import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openTaskList, closeTaskList } from "./helpers/task-list-dialog";
import { holdResetWithPointer, readTimerState, seedTimerState } from "./helpers/timer-hold";
import { DESKTOP, NARROW, openThemed, settle, type Preference } from "./helpers/dark";

// Task 009 criterion 39 (axe, zero serious or critical, both themes, both viewports, every
// listed state) and criterion 60 (zero console errors or warnings across the listed flows).

const COMBOS: { theme: Preference; viewport: { width: number; height: number }; label: string }[] = [
  { theme: "light", viewport: NARROW, label: "light 320" },
  { theme: "light", viewport: DESKTOP, label: "light 1280" },
  { theme: "dark", viewport: NARROW, label: "dark 320" },
  { theme: "dark", viewport: DESKTOP, label: "dark 1280" },
];

async function seriousOrCritical(page: Page, include?: string): Promise<string[]> {
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
}

/** Collects console errors and warnings, and uncaught page errors, from before the first navigation. */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      problems.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => problems.push(`[pageerror] ${err.message}`));
  return problems;
}

test.describe("criterion 39: axe-core, zero serious or critical violations", () => {
  for (const combo of COMBOS) {
    test(`${combo.label}: / with the timer idle, running, paused and complete`, async ({ page }) => {
      test.setTimeout(120_000);
      await openThemed(page, { stored: combo.theme, osDark: false, viewport: combo.viewport });
      await settle(page);
      expect(await seriousOrCritical(page), "idle").toEqual([]);

      const now = Date.now();
      await seedTimerState(page, { status: "running", endTimestamp: now + 600_000, startedAt: now, runId: "qa-axe-run", pausedRemainingMs: null });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await settle(page);
      expect(await seriousOrCritical(page), "running").toEqual([]);

      await seedTimerState(page, { status: "paused", pausedRemainingMs: 300_000, endTimestamp: null, startedAt: null, runId: "qa-axe-paused" });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await settle(page);
      expect(await seriousOrCritical(page), "paused").toEqual([]);

      await seedTimerState(page, { status: "complete", endTimestamp: null, pausedRemainingMs: null, startedAt: null, runId: null });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await settle(page);
      expect(await seriousOrCritical(page), "complete").toEqual([]);
    });

    test(`${combo.label}: the task dialog, its form in the error state, and /stats`, async ({ page }) => {
      test.setTimeout(120_000);
      await openThemed(page, { stored: combo.theme, osDark: false, viewport: combo.viewport });
      await openTaskList(page);
      await settle(page);
      expect(await seriousOrCritical(page), "dialog open").toEqual([]);

      // Error state: submit the add form with an empty title.
      const dialog = page.getByRole("dialog", { name: "Your tasks", exact: true });
      await dialog.getByRole("button", { name: "Add task", exact: true }).click();
      await expect(dialog.getByRole("alert").first()).toBeVisible();
      await settle(page);
      expect(await seriousOrCritical(page), "form error").toEqual([]);
      await closeTaskList(page);

      await page.goto("/stats");
      await page.waitForLoadState("networkidle");
      await settle(page);
      expect(await seriousOrCritical(page), "/stats").toEqual([]);
    });
  }
});

test.describe("criterion 60: zero console errors or warnings across the listed flows", () => {
  for (const combo of COMBOS) {
    test(`${combo.label}: load, theme states, timer, mode, custom edits, dialog, tasks, /stats and reload`, async ({ page }) => {
      test.setTimeout(180_000);
      const problems = watchConsole(page);
      await page.emulateMedia({ colorScheme: "light" });
      await page.setViewportSize(combo.viewport);
      // Capture starts before goto. Clear storage on the first visit only.
      await page.goto("/");
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.waitForLoadState("networkidle");
      // Not vacuous: a deliberate warning must reach the captured list, or zero messages means nothing.
      await page.evaluate(() => console.warn("qa-probe-warning"));
      await expect.poll(() => problems.some((p) => p.includes("qa-probe-warning"))).toBe(true);
      problems.length = 0;

      // Load and every theme state.
      for (const theme of ["light", "dark", "system"] as const) {
        await page.locator(`label:has(input[name="theme"][value="${theme}"])`).click();
        await settle(page);
      }
      // Timer: start, pause, resume, hold Reset to confirm.
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await holdResetWithPointer(page, 1500);
      await page.waitForTimeout(300);

      // Mode switch and custom-duration edits: one valid, one invalid.
      await page.locator('label:has(input[name="timer-mode"][value="shortBreak"])').click();
      await page.locator('label:has(input[name="timer-mode"][value="custom"])').click();
      const custom = page.locator("input#custom-duration");
      await custom.fill("5");
      await custom.fill("0");
      await custom.fill("5");
      await page.locator('label:has(input[name="timer-mode"][value="focus"])').click();

      // Completion: a timer that ends while the page is open.
      const now = Date.now();
      await seedTimerState(page, { status: "running", mode: "focus", customMinutes: 25, endTimestamp: now + 1500, startedAt: now, runId: "qa-complete", pausedRemainingMs: null });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect.poll(async () => (await readTimerState(page))?.status, { timeout: 15_000 }).toBe("complete");

      // Task dialog: open, add, pin, edit, delete, close.
      await openTaskList(page);
      const dialog = page.getByRole("dialog", { name: "Your tasks", exact: true });
      const title = page.locator('input[id*="-title"]').first();
      await title.fill("Alpha");
      await title.press("Enter");
      await expect(page.getByText("Alpha", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Pin Alpha as current task", exact: true }).click();
      await page.getByRole("button", { name: "Edit Alpha", exact: true }).click();
      // The edit row is the one holding the Save button; the add form's title input is not it.
      const editRow = page.locator("ul li").filter({ has: page.getByRole("button", { name: "Save", exact: true }) }).first();
      await editRow.locator("input").first().fill("Alpha two");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      // Scoped to the dialog: a pinned task also shows as the current-task card in <main>.
      await expect(dialog.getByText("Alpha two", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Delete Alpha two", exact: true }).click();
      await dialog.getByRole("group").getByRole("button", { name: "Delete", exact: true }).click();
      await closeTaskList(page);

      // /stats and back, then reload.
      await page.getByRole("link", { name: "Focus stats", exact: true }).click();
      await expect(page).toHaveURL(/\/stats$/);
      await page.waitForLoadState("networkidle");
      await page.goBack();
      await page.waitForLoadState("networkidle");
      await page.reload();
      await page.waitForLoadState("networkidle");
      await settle(page);

      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});
