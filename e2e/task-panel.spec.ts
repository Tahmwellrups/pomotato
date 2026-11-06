import { expect, test, type Locator, type Page } from "@playwright/test";
import { PREFERENCES_STORAGE_KEY } from "../lib/preferences/schema";
import { openTaskList, taskPanel, taskPanelToggle } from "./helpers/task-list-dialog";

// Task 015 behaviour and layout criteria for the panel that replaced the dialog.
// Covered here: 12 (eight controls per row), 14 (add from the empty state), 20-23 (target size,
// no clipping or overlap, title floor, no horizontal scroll), 24 (timer still above the fold at 320 x 568),
// 28 (hidden state persists across reloads), 29-31 (one toggle, focus, hidden means gone), 32 (no
// hydration flash, eight reloads), 33 (toggling writes nothing else), 34-35 (visual weight bounds).
// Not covered here: group G (painted contrast), forced colours, the 50-task case, Escape ownership
// (17), delete focus (13), write-failure line (15). Those are reported as not run.

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "375", width: 375, height: 667 },
  { name: "1280", width: 1280, height: 800 },
] as const;

const LONG_TITLE = "x".repeat(100);

async function addTask(page: Page, title: string) {
  const panel = taskPanel(page);
  await panel.getByLabel("Title", { exact: true }).fill(title);
  await panel.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(panel.getByRole("listitem").filter({ hasText: title }).first()).toBeVisible();
}

async function rowFor(page: Page, title: string): Promise<Locator> {
  return taskPanel(page).getByRole("listitem").filter({ hasText: title }).first();
}

async function seedThreeTasks(page: Page, longFirst = false) {
  await addTask(page, longFirst ? LONG_TITLE : "Sketch the cover");
  await addTask(page, "Write the draft");
  await addTask(page, "Proof the final");
}

/** The eight controls a display-mode row exposes, measured as the tap target: buttons, and the checkbox's label cell. */
async function rowTargets(row: Locator): Promise<Array<{ name: string; box: { x: number; y: number; width: number; height: number } }>> {
  const out: Array<{ name: string; box: { x: number; y: number; width: number; height: number } }> = [];
  const buttons = row.getByRole("button");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    const box = await b.boundingBox();
    if (box) out.push({ name: (await b.getAttribute("aria-label")) ?? (await b.textContent()) ?? "", box });
  }
  const label = row.locator('label:has(input[type="checkbox"])').first();
  const labelBox = await label.boundingBox();
  if (labelBox) out.push({ name: "done checkbox (label cell)", box: labelBox });
  return out;
}

test.describe("criterion 12: every row exposes exactly eight controls", () => {
  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    test(`${vp.name} px: the eight controls by name, and nothing else focusable in the row`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await openTaskList(page);
      await addTask(page, "Alpha");
      const row = await rowFor(page, "Alpha");
      const names = (await row.getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? "")))
        .sort();
      expect(names).toEqual([
        "+1, add a completed pomodoro to Alpha",
        "-1, remove a completed pomodoro from Alpha",
        "Delete Alpha",
        "Edit Alpha",
        "Move Alpha down",
        "Move Alpha up",
        "Reorder Alpha",
      ]);
      await expect(row.locator('input[type="checkbox"]')).toHaveCount(1);
    });
  }
});

test.describe("criterion 14: the add affordance is present in the empty state and works from it", () => {
  test("empty line and add form both render, and adding from there makes the task current", async ({ page }) => {
    await page.goto("/");
    await openTaskList(page);
    const panel = taskPanel(page);
    await expect(panel.getByText("Nothing here yet. Add your first task above.")).toBeVisible();
    await expect(panel.getByLabel("Title", { exact: true })).toBeVisible();
    await addTask(page, "First ever");
    await expect(panel.getByText("Nothing here yet. Add your first task above.")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("First ever");
  });
});

test.describe("criterion 13 (partial): add clears the title and keeps focus in it", () => {
  test("after a successful add the title field is empty and focused", async ({ page }) => {
    await page.goto("/");
    await openTaskList(page);
    const title = taskPanel(page).getByLabel("Title", { exact: true });
    await title.fill("Focus check");
    await taskPanel(page).getByRole("button", { name: "Add task", exact: true }).click();
    await expect(title).toHaveValue("");
    await expect(title).toBeFocused();
  });
});

test.describe("criterion 20-22: target sizes, clipping and the title floor", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} px, three tasks incl. a 100-char title: targets >= 44, nothing clipped or overlapping, title floor met`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await openTaskList(page);
      await seedThreeTasks(page, true);
      const rows = taskPanel(page).getByRole("listitem");
      expect(await rows.count()).toBe(3);
      const panelBox = await taskPanel(page).boundingBox();
      for (let r = 0; r < 3; r++) {
        const row = rows.nth(r);
        const rowBox = await row.boundingBox();
        const targets = await rowTargets(row);
        expect(targets.length, "row targets").toBeGreaterThanOrEqual(8);
        for (const t of targets) {
          expect(t.box.width, `${t.name} width`).toBeGreaterThanOrEqual(44);
          expect(t.box.height, `${t.name} height`).toBeGreaterThanOrEqual(44);
          expect(t.box.x, `${t.name} inside row`).toBeGreaterThanOrEqual(rowBox!.x - 0.5);
          expect(t.box.x + t.box.width, `${t.name} inside row right`).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5);
          expect(t.box.x + t.box.width, `${t.name} inside viewport`).toBeLessThanOrEqual(vp.width + 0.5);
        }
        for (let i = 0; i < targets.length; i++) {
          for (let j = i + 1; j < targets.length; j++) {
            const a = targets[i].box;
            const b = targets[j].box;
            const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
            expect(overlap, `${targets[i].name} overlaps ${targets[j].name}`).toBe(false);
          }
        }
      }
      // Report figures for the orchestrator's diff (not asserted here).
      console.log(`[task-panel ${vp.name}] panel ${panelBox?.width}x${panelBox?.height}`);
      const title = taskPanel(page).getByText(LONG_TITLE, { exact: true });
      const titleBox = await title.first().boundingBox();
      const floor = vp.width >= 1280 ? 180 : 120;
      expect(titleBox?.width ?? 0, "title width").toBeGreaterThanOrEqual(floor);
    });
  }
});

test.describe("criterion 23: no horizontal page scroll in the shown and hidden states", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} px, three tasks: documentElement.scrollWidth <= clientWidth`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await openTaskList(page);
      await seedThreeTasks(page, true);
      const shown = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(shown.sw, "shown").toBeLessThanOrEqual(shown.cw);
      await taskPanelToggle(page).click();
      const hidden = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(hidden.sw, "hidden").toBeLessThanOrEqual(hidden.cw);
    });
  }
});

test.describe("criterion 24: the timer's Start control is above the fold at 320 x 568 with three tasks (scrollY 0)", () => {
  test("Start bottom edge and the readout are reported; Start must sit inside the viewport height", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await openTaskList(page);
    await seedThreeTasks(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const start = await page.getByRole("button", { name: "Start", exact: true }).boundingBox();
    console.log(`[task-panel 320x568] Start box ${JSON.stringify(start)} scrollY=${await page.evaluate(() => window.scrollY)}`);
    expect(start, "Start box").not.toBeNull();
    expect((start?.y ?? 0) + (start?.height ?? 0), "Start bottom edge").toBeLessThanOrEqual(568);
  });
});

test.describe("criterion 28 and 31: the hidden state persists across reloads, and hidden means gone", () => {
  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    test(`${vp.name} px: hide, reload (still hidden); show, reload (still shown); cleared storage returns to shown`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await openTaskList(page);
      await taskPanelToggle(page).click();
      await expect(taskPanelToggle(page)).toHaveAttribute("aria-expanded", "false");
      await page.reload();
      await expect(taskPanelToggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(taskPanel(page)).toHaveCount(0);
      await taskPanelToggle(page).click();
      await expect(taskPanel(page)).toBeVisible();
      await page.reload();
      await expect(taskPanelToggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(taskPanel(page)).toBeVisible();
      await page.evaluate((key) => window.localStorage.removeItem(key), PREFERENCES_STORAGE_KEY);
      await page.reload();
      await expect(taskPanel(page)).toBeVisible();
    });
  }
});

test.describe("criterion 29-31: exactly one toggle, focus stays on it, and hidden means no task control", () => {
  test("one toggle, constant name, aria-expanded flips, focus stays, and Tab from a hidden toggle never lands in the panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await openTaskList(page);
    await expect(page.getByRole("button", { name: "Task list", exact: true })).toHaveCount(1);
    await taskPanelToggle(page).click();
    await expect(taskPanelToggle(page)).toBeFocused();
    await expect(taskPanelToggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(taskPanel(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add task", exact: true })).toHaveCount(0);
    await page.keyboard.press("Tab");
    const landed = await page.evaluate(() => document.activeElement?.closest("[data-task-panel-root]") != null);
    expect(landed, "Tab from hidden toggle lands in panel").toBe(false);
  });
});

test.describe("criterion 32: no hydration flash, and the timer does not move", () => {
  test("stored hidden: the MutationObserver on document never sees the panel painted, across eight reloads", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await openTaskList(page);
    await taskPanelToggle(page).click();
    await expect(taskPanel(page)).toHaveCount(0);

    await page.addInitScript(() => {
      (window as unknown as { __panelPaints: number }).__panelPaints = 0;
      const check = () => {
        const p = document.querySelector("[data-task-panel-root]");
        if (p && p.getBoundingClientRect().width > 0) (window as unknown as { __panelPaints: number }).__panelPaints++;
      };
      new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
      document.addEventListener("DOMContentLoaded", check);
    });
    for (let i = 0; i < 8; i++) {
      await page.reload();
      await expect(taskPanelToggle(page)).toHaveAttribute("aria-expanded", "false");
      const paints = await page.evaluate(() => (window as unknown as { __panelPaints: number }).__panelPaints);
      expect(paints, `reload ${i + 1}`).toBe(0);
    }
  });

  test("timer readout box at first paint equals its box after a one second settle, at 320 and 1280", async ({ page }) => {
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await openTaskList(page);
      const readout = page.getByText(/^\d{2}:\d{2}$/).first();
      const first = await readout.boundingBox();
      await page.waitForTimeout(1000);
      const settled = await readout.boundingBox();
      expect(settled, `${vp.name} readout`).toEqual(first);
    }
  });
});

test.describe("criterion 33: toggling writes nothing else", () => {
  test("the timer entry and the other preference values are byte-identical across a toggle", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await openTaskList(page);
    const snapshot = () =>
      page.evaluate((key) => {
        const prefs = JSON.parse(window.localStorage.getItem(key) ?? "{}") as { state?: Record<string, unknown> };
        const { taskPanelVisible, ...others } = prefs.state ?? {};
        return { others: JSON.stringify(others), taskPanelVisible };
      }, PREFERENCES_STORAGE_KEY);
    const timerBefore = await page.evaluate(() => JSON.stringify(Object.entries(window.localStorage).filter(([k]) => !k.startsWith("pomotato-preferences"))));
    const before = await snapshot();
    await taskPanelToggle(page).click();
    const after = await snapshot();
    const timerAfter = await page.evaluate(() => JSON.stringify(Object.entries(window.localStorage).filter(([k]) => !k.startsWith("pomotato-preferences"))));
    expect(after.others).toBe(before.others);
    expect(before.taskPanelVisible).toBe(true);
    expect(after.taskPanelVisible).toBe(false);
    expect(timerAfter).toBe(timerBefore);
  });
});

test.describe("criterion 34-35: visual weight is bounded", () => {
  test("empty panel at 1280 x 800 is no taller than 240 px; with three tasks it is at most 25% of the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await openTaskList(page);
    const empty = await taskPanel(page).boundingBox();
    expect(empty?.height ?? 999).toBeLessThanOrEqual(240);
    await seedThreeTasks(page);
    const three = await taskPanel(page).boundingBox();
    expect(((three?.width ?? 0) * (three?.height ?? 0)) / (1280 * 800)).toBeLessThanOrEqual(0.25);
  });

  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    test(`${vp.name} px: the largest text inside the panel is under half the mm:ss readout`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await openTaskList(page);
      await seedThreeTasks(page);
      const readoutSize = await page.getByText(/^\d{2}:\d{2}$/).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const panelMax = await taskPanel(page).evaluate((root) => {
        let max = 0;
        for (const el of Array.from(root.querySelectorAll("*"))) {
          if (!el.childNodes.length) continue;
          const hasText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
          const isInput = el instanceof HTMLInputElement;
          if (hasText || isInput) max = Math.max(max, parseFloat(getComputedStyle(el).fontSize));
        }
        return max;
      });
      console.log(`[task-panel ${vp.name}] readout ${readoutSize}px, largest panel text ${panelMax}px`);
      expect(panelMax).toBeLessThan(readoutSize / 2);
    });
  }
});
