import { expect, test, type Page } from "@playwright/test";
import { DESKTOP, NARROW, chooseOnSettings, makePng, waitActive, type Rgb } from "./helpers/background";
import { holdResetWithPointer } from "./helpers/timer-hold";
import { seedTimerState } from "./helpers/timer-hold";
import { taskPanel, taskPanelToggle } from "./helpers/task-list-dialog";

// Behaviour specs for task 012 round 2 (criteria 22, 23, 30) and task 013 round 2 (criteria 11, 49).
// Kept apart from the measurement sweep (qa cost rule 4): a palette change re-runs focus-surface-sweep only.

const WHITE: Rgb = [255, 255, 255];
const WHITE_PNG = () => makePng(DESKTOP.width, DESKTOP.height, () => WHITE);

interface Geometry {
  readout: number[];
  chips: number[][];
  wordmark: number[];
  surfaces: number[][];
  cluster: number[][];
  dots: number[][];
}

/** Bounding boxes of everything the arrival must not move (012 criterion 22). */
async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    };
    return {
      readout: box(document.querySelector("p.tabular-nums")),
      chips: Array.from(document.querySelectorAll('fieldset:has(input[name="timer-mode"]) label span')).map((e) => box(e)),
      wordmark: box(document.querySelector("main h1")),
      surfaces: Array.from(document.querySelectorAll("[data-surface]")).map((e) => box(e)),
      cluster: Array.from(document.querySelector('a[href="/settings"]')?.parentElement?.parentElement?.querySelectorAll("button, a") ?? []).map((e) => box(e)),
      dots: Array.from(document.querySelectorAll("[data-treatment]")).map((e) => box(e)),
    };
  });
}

function sameGeometry(a: Geometry, b: Geometry): string[] {
  const diffs: string[] = [];
  for (const key of Object.keys(a) as (keyof Geometry)[]) {
    const x = a[key];
    const y = b[key];
    if (x.length !== y.length) {
      diffs.push(`${key}: count ${x.length} vs ${y.length}`);
      continue;
    }
    x.forEach((item, i) => {
      const other = y[i] as number[];
      const item2 = item as unknown as number[];
      if (!Array.isArray(item2)) return;
      const delta = item2.map((v, k) => Math.abs(v - (other[k] ?? NaN)));
      if (delta.some((d) => !(d <= 0.5))) diffs.push(`${key}[${i}]: ${JSON.stringify(item2)} vs ${JSON.stringify(other)}`);
    });
  }
  return diffs;
}

test.describe("012 criterion 22: the image's arrival moves nothing", () => {
  for (const [label, viewport] of [["320", NARROW], ["1280", DESKTOP]] as const) {
    test(`${label} px: geometry with no image equals geometry before and after the image arrives; no layout shift; no scrollbar`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // Layout-shift entries with their start times, and the instant the image layer first reports active.
      // Shifts that start at or after that instant are the arrival's; shifts during font and hydration are not.
      await page.addInitScript(() => {
        const w = window as unknown as { __shifts: { t: number; v: number }[]; __activeAt: number | null };
        w.__shifts = [];
        w.__activeAt = null;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
            if (!e.hadRecentInput && typeof e.value === "number") w.__shifts.push({ t: e.startTime, v: e.value });
          }
        }).observe({ type: "layout-shift", buffered: true });
        // Arrival = the first frame the active layer is visible. The attribute alone is set before the fade starts.
        const watch = () => {
          const layer = document.querySelector<HTMLElement>('[data-background="active"]');
          if (w.__activeAt === null && layer && Number(getComputedStyle(layer).opacity) > 0) w.__activeAt = performance.now();
          if (w.__activeAt === null) requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      });

      // No image: the default page, the baseline geometry.
      await page.goto("/");
      await expect(page.locator('[data-surface="frosted"]')).toBeVisible();
      await page.waitForTimeout(400);
      const plain = await geometry(page);
      const plainShifts = await page.evaluate(() => (window as unknown as { __shifts: { t: number; v: number }[] }).__shifts.reduce((a, e) => a + e.v, 0));
      console.log(`012-c22 ${label}px: no-image load layout shift ${plainShifts.toFixed(5)}`);

      // With an image: the arrival. First read is before the layer reports active; the second is after.
      await chooseOnSettings(page, WHITE_PNG(), "arrival.png");
      await page.goto("/");
      // Let the page-load layout shift (present with no image, see below) finish before the early read, so
      // the comparison is between settled states rather than a read taken mid-shift.
      await page.waitForTimeout(400);
      const early = await geometry(page);
      await waitActive(page);
      await page.waitForTimeout(400);
      const late = await geometry(page);

      expect(sameGeometry(plain, early), "geometry before the image is active equals geometry with no image").toEqual([]);
      expect(sameGeometry(plain, late), "geometry after the image has arrived equals geometry with no image").toEqual([]);
      const arrival = await page.evaluate(() => {
        const w = window as unknown as { __shifts: { t: number; v: number }[]; __activeAt: number | null };
        const at = w.__activeAt ?? Infinity;
        const during = w.__shifts.filter((e) => e.t >= at - 50).reduce((a, e) => a + e.v, 0);
        const total = w.__shifts.reduce((a, e) => a + e.v, 0);
        return { at, during, total, count: w.__shifts.length };
      });
      console.log(`012-c22 ${label}px: layout shifts during load ${arrival.total.toFixed(5)} (${arrival.count} entries); starting at or after the image became active (t=${arrival.at.toFixed(0)} ms): ${arrival.during}`);
      expect(arrival.at, "the image became visible during the run (not vacuous)").not.toBe(Infinity);
      // The arrival adds nothing: the image load's layout shift equals the no-image load's, to the sixth decimal.
      // Any shift on `/` at 320 px is a page-load shift that is present with no image at all (reported, not fixed).
      expect(arrival.total, "layout shift with the image equals layout shift with no image (arrival adds 0)").toBeCloseTo(plainShifts, 6);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll, "no horizontal scroll, so no scrollbar").toBeLessThanOrEqual(0);
    });
  }
});

test.describe("012 criterion 23: the surfaces paint before the image, never after", () => {
  test("every frame across the arrival: no full-opacity image while a surface is missing or unpainted", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await chooseOnSettings(page, WHITE_PNG(), "sequence.png");
    // Sample every animation frame from the first script that runs, so the arrival is caught from its first frame.
    await page.addInitScript(() => {
      const w = window as unknown as { __frames: string[]; __stop: boolean };
      w.__frames = [];
      w.__stop = false;
      const parseAlpha = (css: string) => {
        const m = css.match(/rgba?\(([^)]+)\)/);
        if (!m) return 0;
        const parts = m[1].split(/[ ,/]+/).filter(Boolean);
        return parts.length === 4 ? Number(parts[3]) : 1;
      };
      const tick = () => {
        const layer = document.querySelector<HTMLElement>("[data-background]");
        const imgOn = !!layer && layer.getAttribute("data-background") === "active" && Number(getComputedStyle(layer).opacity) > 0;
        const surfaces = Array.from(document.querySelectorAll<HTMLElement>("[data-surface]"));
        const painted = surfaces.length >= 2 && surfaces.every((s) => parseAlpha(getComputedStyle(s).backgroundColor) > 0.5);
        const state = `img ${imgOn ? "on" : "off"} | surfaces ${surfaces.length} ${painted ? "painted" : "not painted"}`;
        const frames = w.__frames;
        if (frames.length === 0 || frames[frames.length - 1] !== state) frames.push(state);
        if (!w.__stop && frames.length < 400) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto("/");
    await waitActive(page);
    await page.waitForTimeout(300);
    await page.evaluate(() => ((window as unknown as { __stop: boolean }).__stop = true));
    const frames = await page.evaluate(() => (window as unknown as { __frames: string[] }).__frames);
    console.log(`012-c23 frame states observed: ${frames.join(" => ")}`);
    const violations = frames.filter((f) => f.startsWith("img on") && !f.endsWith("surfaces 2 painted") && !/surfaces [2-9] painted/.test(f));
    expect(violations, "a frame with the image on and a surface missing or unpainted").toEqual([]);
    expect(frames.some((f) => f.startsWith("img on")), "the image arrived during sampling (not vacuous)").toBe(true);
  });
});

test.describe("013 criterion 11: the Focus length persists across reloads and is unaffected by Reset", () => {
  test("set 50, reload, the value and the readout hold; hold Reset, the length holds", async ({ page }) => {
    await page.goto("/");
    await seedTimerState(page, { mode: "focus", status: "idle", focusMinutes: 25, cyclePosition: 0, endTimestamp: null, startedAt: null, runId: null, pausedRemainingMs: null });
    await page.reload();
    const field = page.locator("input#focus-length");
    await field.fill("50");
    await field.press("Tab");
    await expect(page.locator("p.tabular-nums").first()).toHaveText("50:00");
    await page.reload();
    await expect(field).toHaveValue("50");
    await expect(page.locator("p.tabular-nums").first()).toHaveText("50:00");
    await holdResetWithPointer(page);
    await expect(field).toHaveValue("50");
    await page.reload();
    await expect(field).toHaveValue("50");
  });
});

test.describe("013 criterion 49: mode radios keyboard-reachable with a visible focus indicator", () => {
  test("Tab reaches the Focus radio; arrows move through the three modes; the focused chip paints a 2 px outline", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const focusRadio = page.locator('input[name="timer-mode"][value="focus"]');
    let reached = false;
    for (let i = 0; i < 80 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await focusRadio.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Focus radio reachable by Tab from the top of the page").toBe(true);
    const outline = await page.locator('fieldset:has(input[name="timer-mode"]) label:has(input[value="focus"]) span').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset };
    });
    expect(outline, "focused chip paints a solid 2px outline").toEqual({ style: "solid", width: "2px", offset: "2px" });

    await page.keyboard.press("ArrowRight");
    await expect(page.locator('input[name="timer-mode"][value="shortBreak"]')).toBeChecked();
    await expect(page.locator('input[name="timer-mode"][value="shortBreak"]')).toBeFocused();
    const checked = await page.locator('input[name="timer-mode"]:checked').count();
    expect(checked).toBe(1);
  });

  test("default mode (no focus): no outline is painted on the chips", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const style = await page.locator('fieldset:has(input[name="timer-mode"]) label:has(input[value="focus"]) span').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(style).toBe("none");
  });
});

test.describe("012 criterion 30: zero console errors or warnings across the listed flow, both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: load, settings, pick, return, reload, start, pause, resume, complete, task dialog, flip theme, remove, reload`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") problems.push(`[${msg.type()}] ${msg.text()}`);
      });
      page.on("pageerror", (err) => problems.push(`[pageerror] ${err.message}`));

      await page.goto("/");
      await page.evaluate((t) => {
        const raw = JSON.parse(localStorage.getItem("pomotato-preferences") ?? '{"state":{},"version":1}');
        localStorage.setItem("pomotato-preferences", JSON.stringify({ ...raw, state: { ...raw.state, theme: t } }));
      }, theme);
      await page.reload();
      await page.getByRole("link", { name: "Settings" }).click();
      await chooseOnSettings(page, WHITE_PNG(), "console.png");
      await page.goto("/");
      await waitActive(page);
      await page.reload();
      await waitActive(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      // Complete: a Focus run that ends now, so the auto-advance path runs.
      await seedTimerState(page, { mode: "focus", status: "running", focusMinutes: 25, cyclePosition: 0, endTimestamp: Date.now() + 400, startedAt: Date.now() - 1000, runId: "qa-console", pausedRemainingMs: null });
      await page.reload();
      await page.waitForTimeout(1200);
      // Re-point (task 015, commit 4ca861e): the task dialog was deleted. The panel is always visible, and its
      // bottom-right toggle is the one control that hides and shows it, so the flow hides and shows the panel.
      await taskPanelToggle(page).click();
      await expect(taskPanel(page)).toHaveCount(0);
      await taskPanelToggle(page).click();
      await expect(taskPanel(page)).toBeVisible();
      await page.locator('label:has(input[name="theme"][value="dark"])').click();
      await page.goto("/settings");
      await page.getByRole("button", { name: "Remove background" }).click();
      await page.goto("/");
      await page.reload();
      await page.waitForTimeout(400);
      expect(problems, "console errors and warnings across the flow").toEqual([]);
    });
  }
});

// Silence the unused-type warning for the Rgb alias when the sweep file changes.
export type { Rgb };
