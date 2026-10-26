import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openTaskList, closeTaskList } from "./helpers/task-list-dialog";
import { seedTimerState, resetControl } from "./helpers/timer-hold";
import {
  DESKTOP,
  must,
  openThemed,
  pixelsAt,
  record,
  seedStatsSessions,
  settle,
  themeLabel,
  type Preference,
} from "./helpers/dark";
import { compositeOver, contrast, readPainted, rgbString, tokenRgb, type PaintedReading, type Rgb } from "./helpers/painted";

// Task 009 sweep: the rows criteria 41-43 name that the first QA pass did not measure, the
// focus sweep of criterion 28 (amended 2026-10-26: 3:1 against the surrounding ground), the
// chart text of criterion 20, the disabled states of criterion 43, the reduced-motion check of
// criterion 47, and the native-UA checks of criterion 22. Every figure is painted (computed
// styles composited over the real ancestor chain, or pixels from a real screenshot) and is
// recorded with its theme and ground.

type Theme = "light" | "dark";
const THEMES: [Theme, Preference][] = [
  ["light", "light"],
  ["dark", "dark"],
];

const RING_TOKEN = "--ring";

function tag(theme: Theme, label: string) {
  return `[${theme}] ${label}`;
}

/** Collects failing rows so one run reports every miss, not only the first. */
class Sheet {
  readonly failures: string[] = [];
  constructor(private readonly testInfo: TestInfo, private readonly theme: Theme) {}
  row(label: string, ratio: number, floor: number) {
    const shown = tag(this.theme, label);
    record(this.testInfo, shown, ratio, floor);
    if (!Number.isFinite(ratio) || ratio < floor) this.failures.push(`${shown}: ${ratio.toFixed(2)}:1 < ${floor}:1`);
  }
  note(label: string, value: string) {
    record(this.testInfo, tag(this.theme, `${label} | ${value}`), 0, 0);
  }
  done() {
    expect(this.failures, this.failures.join("\n")).toEqual([]);
  }
}

const textVsFill = (r: PaintedReading) => contrast(r.color, r.fill);
const textVsGround = (r: PaintedReading) => contrast(r.color, r.ground);
const borderVsGround = (r: PaintedReading) => (r.borderColor ? contrast(r.borderColor, r.ground) : 0);

async function themed(page: Page, stored: Preference, path = "/") {
  await openThemed(page, { stored, osDark: false, viewport: DESKTOP, path });
  await settle(page);
}

/** Seeds the custom-duration mode (idle), so the custom field and its label are rendered. */
async function seedCustomIdle(page: Page) {
  await seedTimerState(page, { status: "idle", mode: "custom", customMinutes: 5, endTimestamp: null, startedAt: null, runId: null, pausedRemainingMs: null });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await settle(page);
}

/** Adds one task through the dialog form, so rows and form error states exist to measure. */
async function addTask(page: Page, title: string) {
  const dialog = await openTaskList(page);
  await dialog.locator('input[id*="-title"]').first().fill(title);
  await dialog.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(dialog.locator("li").filter({ hasText: title }).first()).toBeVisible();
  return dialog;
}

// ---------------------------------------------------------------------------
// Criterion 28 (amended 2026-10-26): every listed control shows a 2 px ring at 2 px offset
// in --ring, reaching 3:1 against the surrounding ground. Own-fill is not a criterion at 2 px.
// ---------------------------------------------------------------------------

interface RingCheck {
  name: string;
  focusVisible: boolean;
  width: string;
  offset: string;
  colour: Rgb | null;
  ground: Rgb;
  vsGround: number;
  vsFill: number;
}

async function ringCheck(page: Page, name: string, focusTarget: Locator, ringEl: Locator): Promise<RingCheck> {
  // A programmatic focus() after a pointer click does not match :focus-visible. A keypress first
  // makes the focus a keyboard one, which is the state a keyboard user sees the ring in.
  await page.keyboard.press("Shift");
  await focusTarget.focus();
  await settle(page);
  const focusVisible = await focusTarget.evaluate((el) => el.matches(":focus-visible"));
  const r = await readPainted(page, ringEl);
  return {
    name,
    focusVisible,
    width: r.outlineWidth,
    offset: r.outlineOffset,
    colour: r.outlineColor,
    ground: r.ground,
    vsGround: r.outlineColor ? contrast(r.outlineColor, r.ground) : 0,
    vsFill: r.outlineColor ? contrast(r.outlineColor, r.fill) : 0,
  };
}

async function assertRings(page: Page, testInfo: TestInfo, theme: Theme, checks: RingCheck[]) {
  const ring = await tokenRgb(page, RING_TOKEN);
  const sheet = new Sheet(testInfo, theme);
  for (const c of checks) {
    sheet.row(`focus ring ${c.name} (${c.width} / offset ${c.offset}) vs ground`, c.vsGround, 3);
    sheet.note(`focus ring ${c.name} own-fill (informational)`, c.vsFill.toFixed(2));
    if (!c.focusVisible) sheet.failures.push(`${tag(theme, c.name)}: :focus-visible does not match, so no focus indicator is shown`);
    if (c.width !== "2px") sheet.failures.push(`${tag(theme, c.name)}: outline width ${c.width}, expected 2px`);
    if (c.offset !== "2px") sheet.failures.push(`${tag(theme, c.name)}: outline offset ${c.offset}, expected 2px`);
    if (!c.colour || c.colour.join() !== ring.join()) sheet.failures.push(`${tag(theme, c.name)}: outline colour ${c.colour?.join(",")} is not --ring ${ring.join(",")}`);
  }
  sheet.done();
}

test.describe("criterion 28 (amended): every listed control shows a 2 px ring at 2 px offset, 3:1 vs ground", () => {
  for (const [theme, stored] of THEMES) {
    test(`[${theme}] timer, theme, mode, custom input, Tasks, Stats: each focus ring`, async ({ page }, testInfo) => {
      await themed(page, stored);
      await seedCustomIdle(page);
      const checks: RingCheck[] = [];
      // Theme radios: sr-only inputs, the ring is painted on the visible chip span.
      for (const value of ["light", "dark", "system"]) {
        checks.push(
          await ringCheck(
            page,
            `theme ${value}`,
            page.locator(`input[name="theme"][value="${value}"]`),
            page.locator(`label:has(input[name="theme"][value="${value}"]) span`).first(),
          ),
        );
      }
      const modeValues = await page.$$eval('input[name="timer-mode"]', (els) => els.map((e) => (e as HTMLInputElement).value));
      expect(modeValues.length, "mode chips rendered").toBeGreaterThan(0);
      for (const value of modeValues) {
        checks.push(
          await ringCheck(
            page,
            `mode chip ${value}`,
            page.locator(`input[name="timer-mode"][value="${value}"]`),
            page.locator(`label:has(input[name="timer-mode"][value="${value}"]) span`).first(),
          ),
        );
      }
      checks.push(await ringCheck(page, "Start", page.getByRole("button", { name: "Start", exact: true }), page.getByRole("button", { name: "Start", exact: true })));
      checks.push(await ringCheck(page, "Reset", resetControl(page), resetControl(page)));
      checks.push(await ringCheck(page, "custom duration input", page.locator("input#custom-duration"), page.locator("input#custom-duration")));
      const tasks = page.getByRole("button", { name: "Your tasks", exact: true });
      checks.push(await ringCheck(page, "Tasks trigger", tasks, tasks));
      const stats = page.locator('a[href="/stats"]').first();
      checks.push(await ringCheck(page, "Stats button", stats, stats));
      await assertRings(page, testInfo, theme, checks);
    });

    test(`[${theme}] dialog Close, task-row actions, task form fields, submit and colour swatches: each focus ring`, async ({ page }, testInfo) => {
      await themed(page, stored);
      const dialog = await addTask(page, "QA Ring Task");
      const checks: RingCheck[] = [];
      checks.push(await ringCheck(page, "dialog Close", dialog.getByRole("button", { name: "Close", exact: true }), dialog.getByRole("button", { name: "Close", exact: true })));

      const rowButtons = dialog.locator('li button[aria-label*="QA Ring Task"]');
      const rowCount = await rowButtons.count();
      expect(rowCount, "row action buttons rendered").toBeGreaterThanOrEqual(5);
      for (let i = 0; i < rowCount; i++) {
        const b = rowButtons.nth(i);
        if (await b.isDisabled()) continue;
        const label = (await b.getAttribute("aria-label")) ?? `row button ${i}`;
        checks.push(await ringCheck(page, `row action "${label.slice(0, 30)}"`, b, b));
      }

      const title = dialog.getByLabel("Title", { exact: true });
      checks.push(await ringCheck(page, "form Title field", title, title));
      const emoji = dialog.getByLabel("Emoji", { exact: true });
      checks.push(await ringCheck(page, "form Emoji field", emoji, emoji));
      const eta = dialog.getByLabel("Estimated pomodoros", { exact: true });
      checks.push(await ringCheck(page, "form Estimated pomodoros field", eta, eta));
      const submit = dialog.getByRole("button", { name: "Add task", exact: true });
      checks.push(await ringCheck(page, "form submit", submit, submit));

      const swatchValues = await dialog.locator('input[type="radio"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      expect(swatchValues.length, "colour swatches rendered").toBe(8);
      for (const value of swatchValues) {
        checks.push(
          await ringCheck(
            page,
            `swatch ${value}`,
            dialog.locator(`input[type="radio"][value="${value}"]`),
            dialog.locator(`label:has(input[type="radio"][value="${value}"]) span.flex`).first(),
          ),
        );
      }
      await assertRings(page, testInfo, theme, checks);
      await closeTaskList(page);
    });

    test(`[${theme}] /stats view chips and the Focus stats return: each focus ring`, async ({ page }, testInfo) => {
      await themed(page, stored, "/stats");
      await seedStatsSessions(page);
      const views = await page.$$eval('input[name="stats-view"]', (els) => els.map((e) => (e as HTMLInputElement).value));
      expect(views.length, "view chips rendered").toBe(3);
      const checks: RingCheck[] = [];
      for (const value of views) {
        checks.push(
          await ringCheck(
            page,
            `stats view ${value}`,
            page.locator(`input[name="stats-view"][value="${value}"]`),
            page.locator(`label:has(input[name="stats-view"][value="${value}"]) span`).first(),
          ),
        );
      }
      await assertRings(page, testInfo, theme, checks);
    });
  }
});

// ---------------------------------------------------------------------------
// Criterion 41, 42: rows the first QA pass did not measure, in both themes.
// ---------------------------------------------------------------------------

test.describe("criterion 41, 42: unmeasured rows, painted in both themes", () => {
  for (const [theme, stored] of THEMES) {
    test(`[${theme}] CurrentTaskCard normal (pinned) and empty; mode chips; Start rest and hover; Reset; custom field and its error`, async ({ page }, testInfo) => {
      await themed(page, stored);
      await seedCustomIdle(page);
      const sheet = new Sheet(testInfo, theme);

      // Empty state first (no pinned task yet on a fresh profile).
      const emptyText = page.locator("p").filter({ hasText: "Pin a task from Your tasks" }).first();
      await expect(emptyText).toBeVisible();
      sheet.row("CurrentTaskCard empty text vs page", textVsGround(await readPainted(page, emptyText)), 4.5);

      // Normal state: pin a task.
      const dialog = await addTask(page, "QA Card Task");
      await dialog.getByRole("button", { name: "Pin QA Card Task as current task" }).click();
      await closeTaskList(page);
      const cardTitle = page.locator("span.font-comfortaa").filter({ hasText: "QA Card Task" }).first();
      await expect(cardTitle).toBeVisible();
      sheet.row("CurrentTaskCard normal title vs page", textVsGround(await readPainted(page, cardTitle)), 4.5);

      // Mode chips, checked and unchecked.
      const checkedChip = page.locator('label:has(input[name="timer-mode"]:checked) span').first();
      const uncheckedChip = page.locator('label:has(input[name="timer-mode"]:not(:checked)) span').first();
      sheet.row("mode chip checked label vs its fill", textVsFill(await readPainted(page, checkedChip)), 4.5);
      sheet.row("mode chip unchecked label vs its fill", textVsFill(await readPainted(page, uncheckedChip)), 4.5);

      // TimerControls primary at rest and on hover, and Reset.
      const start = page.getByRole("button", { name: "Start", exact: true });
      sheet.row("Start rest label vs fill", textVsFill(await readPainted(page, start)), 4.5);
      await start.hover();
      await settle(page);
      sheet.row("Start hover label vs fill", textVsFill(await readPainted(page, start)), 4.5);
      await page.mouse.move(0, 0);
      await settle(page);
      const reset = resetControl(page);
      sheet.row("Reset label vs fill", textVsFill(await readPainted(page, reset)), 4.5);

      // Custom duration: label, field text, field edge, and the error state.
      const label = page.locator('label[for="custom-duration"]');
      sheet.row("custom duration label vs page", textVsGround(await readPainted(page, label)), 4.5);
      const field = page.locator("input#custom-duration");
      const fieldReading = await readPainted(page, field);
      sheet.row("custom duration field text vs field fill", textVsFill(fieldReading), 4.5);
      sheet.row("custom duration field edge vs page", borderVsGround(fieldReading), 3);
      await field.fill("abc");
      await field.press("Tab");
      const error = page.locator("#custom-duration-error");
      await expect(error).toBeVisible();
      sheet.row("custom duration error text vs page", textVsGround(await readPainted(page, error)), 4.5);
      const errorField = await readPainted(page, field);
      sheet.row("custom duration error field edge vs page", borderVsGround(errorField), 3);

      // Theme control chips (checked and unchecked labels) and the Stats button's edge.
      const themeChecked = page.locator('label:has(input[name="theme"]:checked) span').first();
      const themeUnchecked = page.locator('label:has(input[name="theme"]:not(:checked)) span').first();
      sheet.row("theme chip checked label vs its fill", textVsFill(await readPainted(page, themeChecked)), 4.5);
      sheet.row("theme chip unchecked label vs its fill", textVsFill(await readPainted(page, themeUnchecked)), 4.5);
      const statsLink = page.locator('a[href="/stats"]').first();
      sheet.row("Stats button edge vs page", borderVsGround(await readPainted(page, statsLink)), 3);
      sheet.done();
    });

    test(`[${theme}] TaskRow idle, drag-active ring, TaskColorDot, delete-confirm prompt; TaskForm invalid and submit; TaskList count`, async ({ page }, testInfo) => {
      await themed(page, stored);
      const sheet = new Sheet(testInfo, theme);
      const dialog = await addTask(page, "QA Row Task");
      const row = dialog.locator("li").filter({ hasText: "QA Row Task" }).first();

      // Idle row: title and count text on the card.
      const title = row.locator("span.break-words").first();
      sheet.row("TaskRow idle title vs card", textVsGround(await readPainted(page, title)), 4.5);
      const count = row.locator("span.font-mono").first();
      sheet.row("TaskRow idle count vs card", textVsGround(await readPainted(page, count)), 4.5);

      // Colour dot: the swatch fill is identity (criterion 19). The hairline is decorative.
      const dot = row.locator("span[aria-hidden='true'].rounded-full").first();
      const dotReading = await readPainted(page, dot);
      sheet.row("TaskColorDot fill vs card", contrast(dotReading.fill, dotReading.ground), 3);
      sheet.note("TaskColorDot hairline (decorative, exempt: swatch fill carries identity)", `${borderVsGround(dotReading).toFixed(2)}:1 vs card`);

      // Drag-active: start a real pointer drag on the handle, read the ring while held.
      const handle = row.locator('button[aria-label="Reorder QA Row Task"]');
      const hb = must(await handle.boundingBox(), "drag handle box");
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 30, { steps: 6 });
      await settle(page);
      // The drag-active state is the ring-2 ring-ring class set by TaskRow while isDragging.
      const draggingRow = page.locator(".ring-2").filter({ hasText: "QA Row Task" });
      const draggingCount = await draggingRow.count();
      if (draggingCount !== 1) {
        sheet.failures.push(`${tag(theme, "drag-active")}: expected one ring-2 row while dragging, found ${draggingCount}`);
      }
      const rb = must(await draggingRow.first().boundingBox(), "dragged row box");
      // The ring sits 2 px outside the row box. Sample the ring and the page ground beyond it.
      const ringPx = await pixelsAt(page, [[Math.round(rb.x - 1), Math.round(rb.y + rb.height / 2)]]);
      const groundPx = await pixelsAt(page, [[Math.round(rb.x - 6), Math.round(rb.y + rb.height / 2)]]);
      // Criterion 42 exemption (owner ruling 2026-10-26, docs/tasks/009-dark-mode-toggle.md). The ring is
      // a third cue, not the carrier of the drag state. The ratio is recorded for information with floor 0,
      // not asserted against 3:1. What is asserted: both named carriers are present on the dragging row,
      // so a future change that removes one of them and leaves the ring doing the work fails here.
      record(testInfo, tag(theme, `TaskRow drag-active ring vs page ground, EXEMPT (criterion 42), informational | ${contrast(ringPx[0], groundPx[0]).toFixed(2)}:1 | floor n/a`), contrast(ringPx[0], groundPx[0]), 0);
      const carriers = await draggingRow.first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return { transform: cs.transform, opacity: Number(cs.opacity), classes: el.className, ring: cs.boxShadow };
      });
      expect(carriers.transform, "carrier 1: dnd-kit transform is applied to the dragging row").not.toBe("none");
      expect(carriers.opacity, "carrier 2: opacity-60 is applied to the dragging row").toBeCloseTo(0.6, 2);
      expect(carriers.classes, "carrier 2 class").toContain("opacity-60");
      expect(carriers.ring, "the ring is present (reinforcing cue)").not.toBe("none");
      await page.mouse.up();
      await settle(page);

      // Delete-confirm prompt text on its tint.
      await row.getByRole("button", { name: "Delete QA Row Task" }).click();
      const prompt = row.locator("p.text-destructive").first();
      await expect(prompt).toBeVisible();
      sheet.row("TaskRow delete-confirm prompt vs tint", textVsGround(await readPainted(page, prompt)), 4.5);
      await row.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => undefined);

      // Invalid form: submit an empty title to raise the error.
      await dialog.getByRole("button", { name: "Add task", exact: true }).click();
      const formError = dialog.getByRole("alert").first();
      await expect(formError).toBeVisible();
      sheet.row("TaskForm invalid error text vs popover", textVsGround(await readPainted(page, formError)), 4.5);
      const invalidTitle = await readPainted(page, dialog.locator('input[id*="-title"]').first());
      sheet.row("TaskForm invalid title edge vs popover", borderVsGround(invalidTitle), 3);

      // Submit enabled.
      const submit = dialog.getByRole("button", { name: "Add task", exact: true });
      sheet.row("TaskForm submit enabled label vs fill", textVsFill(await readPainted(page, submit)), 4.5);

      // Cancel is rendered only by the edit form (onCancel). Open Edit on the row to reach it.
      await row.getByRole("button", { name: "Edit QA Row Task" }).click();
      const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
      await expect(cancel).toBeVisible();
      const cancelReading = await readPainted(page, cancel);
      sheet.row("TaskForm Cancel label vs fill", textVsFill(cancelReading), 4.5);
      sheet.row("TaskForm Cancel edge vs ground", borderVsGround(cancelReading), 3);
      sheet.done();
      await closeTaskList(page);
    });

    test(`[${theme}] /stats: chart ticks (all), StatsViewSwitcher chips, StatsTables; no legend or tooltip exists`, async ({ page }, testInfo) => {
      await themed(page, stored, "/stats");
      await seedStatsSessions(page);
      await page.waitForFunction(() => document.querySelectorAll("svg text").length > 0, undefined, { timeout: 15000 });
      await settle(page);
      const sheet = new Sheet(testInfo, theme);

      // Every chart text, not a sample. Recharts paints ticks only: no legend, no tooltip.
      const texts = await page.evaluate(() => {
        const out: { text: string; fill: string; chain: string[] }[] = [];
        for (const el of document.querySelectorAll("svg text")) {
          const chain: string[] = [];
          let node: Element | null = el.parentElement;
          while (node) {
            chain.unshift(getComputedStyle(node).backgroundColor);
            node = node.parentElement;
          }
          out.push({ text: el.textContent ?? "", fill: getComputedStyle(el).fill, chain });
        }
        return out.filter((t) => t.text.trim().length > 0);
      });
      expect(texts.length, "chart text rendered").toBeGreaterThan(0);
      for (const t of texts) {
        let ground: Rgb = [255, 255, 255];
        for (const bg of t.chain) {
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") ground = await compositeOver(page, bg, rgbString(ground));
        }
        const fg = await compositeOver(page, t.fill, rgbString(ground));
        sheet.row(`chart tick "${t.text.slice(0, 14)}" vs card`, contrast(fg, ground), 4.5);
      }

      const legendCount = await page.locator(".recharts-legend-wrapper").count();
      const tooltipCount = await page.locator(".recharts-tooltip-wrapper").count();
      expect(legendCount, "no legend is rendered (StatsChart.tsx: visual summary only)").toBe(0);
      const bar = page.locator(".recharts-bar-rectangle path").first();
      await bar.hover();
      await settle(page);
      const tooltipAfterHover = await page.locator(".recharts-tooltip-wrapper").count();
      expect(tooltipAfterHover, "no tooltip is rendered on hover").toBe(0);
      expect(tooltipCount, "no tooltip wrapper before hover").toBe(0);
      sheet.note("chart legend and tooltip", "none rendered (legend 0, tooltip 0 before and after hover); criterion 20 legend/tooltip clause is vacuous");

      // Dashboard heading.
      const heading = page.locator("h1").first();
      sheet.row("StatsDashboard heading vs page", textVsGround(await readPainted(page, heading)), 4.5);

      // The view chips.
      const checked = page.locator('label:has(input[name="stats-view"]:checked) span').first();
      const unchecked = page.locator('label:has(input[name="stats-view"]:not(:checked)) span').first();
      sheet.row("stats view chip checked label vs its fill", textVsFill(await readPainted(page, checked)), 4.5);
      sheet.row("stats view chip unchecked label vs its fill", textVsFill(await readPainted(page, unchecked)), 4.5);

      // StatsTables: open the disclosure, then measure the headers and cells.
      await page.locator("details > summary").first().click();
      await settle(page);
      const cells = await page.$$eval("details table th, details table td", (els) =>
        els.slice(0, 40).map((e) => ({ tag: e.tagName, text: (e.textContent ?? "").trim() })),
      );
      expect(cells.length, "table cells rendered").toBeGreaterThan(0);
      const headerCell = page.locator("details table th").first();
      sheet.row("StatsTables header vs card", textVsGround(await readPainted(page, headerCell)), 4.5);
      const bodyCell = page.locator("details table td").first();
      sheet.row("StatsTables cell vs card", textVsGround(await readPainted(page, bodyCell)), 4.5);
      sheet.done();
    });
  }
});

// ---------------------------------------------------------------------------
// Criterion 43: disabled states are measured, not made invisible, and are not worse than light.
// Measured in one test, light first, then dark, so each dark figure is compared to its light figure.
// ---------------------------------------------------------------------------

test.describe("criterion 43 and 26: disabled states, dark figures not worse than light", () => {
  test("disabled custom field (running), disabled submit, and the three task-form fields with the disabled attribute forced", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openThemed(page, { stored: "light", osDark: false, viewport: DESKTOP });
    await seedTimerState(page, {
      status: "running",
      mode: "custom",
      customMinutes: 5,
      endTimestamp: Date.now() + 600_000,
      startedAt: Date.now(),
      runId: "qa-disabled",
      pausedRemainingMs: null,
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await settle(page);

    const measure = async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      const field = page.locator("input#custom-duration");
      await expect(field).toBeDisabled();
      const fr = await readPainted(page, field);
      out["custom field (running) text vs fill"] = textVsFill(fr);
      out["custom field (running) edge vs page"] = borderVsGround(fr);

      // Disabled task-form controls. The shipped form never disables its fields: only the submit
      // and Cancel take `disabled={submitting}`. The fields are forced disabled here so the
      // disabled style, if one is ever applied, is measured. Each is restored afterwards.
      await openTaskList(page);
      const dialog = page.getByRole("dialog", { name: "Your tasks", exact: true });
      const fields: [string, Locator][] = [
        ["task Title field", dialog.getByLabel("Title", { exact: true })],
        ["task Emoji field", dialog.getByLabel("Emoji", { exact: true })],
        ["task Estimated pomodoros field", dialog.getByLabel("Estimated pomodoros", { exact: true })],
      ];
      for (const [name, f] of fields) {
        await f.evaluate((el) => ((el as HTMLInputElement).disabled = true));
        await settle(page);
        const r = await readPainted(page, f);
        out[`${name} (forced disabled) text vs fill`] = textVsFill(r);
        out[`${name} (forced disabled) edge vs ground`] = borderVsGround(r);
        out[`${name} (forced disabled) fill vs ground`] = contrast(r.fill, r.ground);
        await f.evaluate((el) => ((el as HTMLInputElement).disabled = false));
      }
      const submit = dialog.getByRole("button", { name: "Add task", exact: true });
      await submit.evaluate((el) => ((el as HTMLButtonElement).disabled = true));
      await settle(page);
      const sr = await readPainted(page, submit);
      out["disabled submit label vs fill"] = textVsFill(sr);
      out["disabled submit fill vs ground"] = contrast(sr.fill, sr.ground);
      await submit.evaluate((el) => ((el as HTMLButtonElement).disabled = false));
      await closeTaskList(page);
      return out;
    };

    const light = await measure();
    await themeLabel(page, "Dark").click();
    await settle(page);
    const dark = await measure();

    const failures: string[] = [];
    for (const key of Object.keys(light)) {
      const l = light[key];
      const d = dark[key];
      record(testInfo, tag("dark", `${key} | light ${l.toFixed(2)}:1, dark ${d.toFixed(2)}:1 | floor: light figure`), d, l);
      // Not worse than light. Disabled rows are exempt from 1.4.3, so the test checks direction, not 4.5.
      if (d < l - 0.005) failures.push(`${key}: dark ${d.toFixed(2)}:1 is worse than light ${l.toFixed(2)}:1`);
      if (!(d > 1.0)) failures.push(`${key}: dark ${d.toFixed(2)}:1 is invisible`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 47 (independent check): under reduced motion the theme flip is instant and
// the HoldButton background transition is 0 s. Default motion still animates, so the
// reduced-motion check is not vacuous.
// ---------------------------------------------------------------------------

test.describe("criterion 47: the theme flip is instant under reduced motion, and default motion still animates", () => {
  test("reduced motion: Reset transition is 0 s, no transition is started by the flip, and the fill is final on the first frame", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await openThemed(page, { stored: "light", osDark: false, viewport: DESKTOP });
    await settle(page);
    const hold = resetControl(page);
    const before = await readPainted(page, hold);
    const transitionBefore = await hold.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { property: cs.transitionProperty, duration: cs.transitionDuration };
    });
    record(testInfo, tag("light", `Reset transition under reduced motion ${JSON.stringify(transitionBefore)}`), 0, 0);
    expect(transitionBefore.duration.split(",").every((d) => parseFloat(d) === 0), JSON.stringify(transitionBefore)).toBe(true);

    await themeLabel(page, "Dark").click();
    // Read in the same task as the click resolves, before any frame can have advanced a transition.
    const started = await hold.evaluate((el) => el.getAnimations().filter((a) => a instanceof CSSTransition).length);
    expect(started, "no CSS transition started by the flip under reduced motion").toBe(0);
    const bgNow = await readPainted(page, hold);
    expect(bgNow.fill.join(), "dark fill on the first read after the flip").not.toEqual(before.fill.join());
    await settle(page);
    const bgSettled = await readPainted(page, hold);
    record(testInfo, tag("dark", `Reset fill first read ${bgNow.fill.join(",")} = settled ${bgSettled.fill.join(",")}`), 0, 0);
    expect(bgNow.fill.join(), "first read is already the final dark fill").toEqual(bgSettled.fill.join());
    expect(await htmlIsDark(page), "html has .dark").toBe(true);
  });

  test("default motion: the same flip does start a CSS transition on Reset (the check above is not vacuous)", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
    await openThemed(page, { stored: "light", osDark: false, viewport: DESKTOP });
    await settle(page);
    const hold = resetControl(page);
    await themeLabel(page, "Dark").click();
    const started = await hold.evaluate((el) => el.getAnimations().filter((a) => a instanceof CSSTransition).length);
    record(testInfo, tag("dark", `CSS transitions started on Reset by the flip, default motion: ${started}`), started, 1);
    expect(started, "default motion animates the flip").toBeGreaterThan(0);
    await settle(page);
  });
});

async function htmlIsDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("dark"));
}
