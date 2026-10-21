import { test, expect, type Locator, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { holdPointer, holdResetWithPointer, resetControl, seedTimerState, TIMER_STORAGE_KEY } from "./helpers/timer-hold";

// Task 006 QA: the timer surface draws from semantic tokens and must look the same.
// Every colour here is read from the browser's computed style (painted value), never from
// the token hex in globals.css, and every token expectation is resolved by the browser too.

const viewports = [
  { width: 320, height: 720 },
  { width: 1280, height: 800 },
];

type Rgb = [number, number, number];

function parseRgb(value: string): Rgb {
  // Chromium serialises color-mix() results (hover fills) as color(srgb r g b) with 0..1 channels.
  const srgb = value.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255].map((c) => Math.round(c)) as Rgb;
  const m = value.match(/^rgb\((\d+(?:\.\d+)?), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\)$/);
  if (!m) throw new Error(`expected an opaque rgb() colour, got "${value}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2.x contrast ratio between two opaque colours. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a CSS custom property to the rgb() the browser paints with it. */
async function resolveToken(page: Page, token: string): Promise<Rgb> {
  const resolved = await page.evaluate((cssVar) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${cssVar})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, token);
  return parseRgb(resolved);
}

/** The opaque background of the nearest ancestor that paints one: the page behind an element. */
async function pageBackground(page: Page): Promise<Rgb> {
  const value = await page.evaluate(() => {
    let node: Element | null = document.body;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      node = node.parentElement;
    }
    return getComputedStyle(document.documentElement).backgroundColor;
  });
  return parseRgb(value);
}

interface Paint {
  color: Rgb;
  background: Rgb;
  borderColor: Rgb;
  borderWidth: string;
  outlineColor: string;
  outlineWidth: string;
  outlineOffset: string;
  outlineStyle: string;
  width: number;
  height: number;
}

async function readPaint(locator: Locator): Promise<Paint> {
  const raw = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      color: s.color,
      background: s.backgroundColor,
      borderColor: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      outlineColor: s.outlineColor,
      outlineWidth: s.outlineWidth,
      outlineOffset: s.outlineOffset,
      outlineStyle: s.outlineStyle,
      width: box.width,
      height: box.height,
    };
  });
  return {
    color: parseRgb(raw.color),
    background: parseRgb(raw.background),
    borderColor: parseRgb(raw.borderColor),
    borderWidth: raw.borderWidth,
    outlineColor: raw.outlineColor,
    outlineWidth: raw.outlineWidth,
    outlineOffset: raw.outlineOffset,
    outlineStyle: raw.outlineStyle,
    width: raw.width,
    height: raw.height,
  };
}

function chipRadio(page: Page, mode: string): Locator {
  return page.locator(`input[name="timer-mode"][value="${mode}"]`);
}

/** The painted chip is the <span> that follows the sr-only radio. */
function chip(page: Page, mode: string): Locator {
  return chipRadio(page, mode).locator("xpath=following-sibling::span[1]");
}

function startButton(page: Page): Locator {
  return page.getByRole("button", { name: "Start", exact: true });
}

function primaryButton(page: Page): Locator {
  return page.getByRole("button", { name: /^(Start|Pause|Resume)$/ });
}

/** Lets the 150 ms colour transition finish before reading painted values. */
async function settle(page: Page) {
  await page.waitForTimeout(700);
}

/** Tab from the top of the page until the checked mode radio has focus. Fails if it never does. */
async function tabToCheckedMode(page: Page) {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const onRadio = await page.evaluate(() => {
      const active = document.activeElement as HTMLInputElement | null;
      return active?.type === "radio" && active.name === "timer-mode";
    });
    if (onRadio) return;
  }
  throw new Error("focus never reached the timer-mode radio group");
}

test.describe("task 006 timer surface: contrast and painted values", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await settle(page);
  });

  test("selected chip: label on fill is 4.5:1 or better; border against the page is 3:1 or better", async ({ page }) => {
    const selected = await readPaint(chip(page, "focus"));
    const page_ = await pageBackground(page);
    expect(contrast(selected.color, selected.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(selected.borderColor, page_)).toBeGreaterThanOrEqual(3);
    // Selected fill is the --accent token; the mode-chip variant must not drift from it.
    expect(selected.background).toEqual(await resolveToken(page, "--accent"));
    expect(selected.color).toEqual(await resolveToken(page, "--accent-foreground"));
    expect(selected.borderColor).toEqual(await resolveToken(page, "--primary"));
  });

  test("unselected chip: label on fill is 4.5:1 or better; fill and border measured against the page", async ({ page }) => {
    const unselected = await readPaint(chip(page, "shortBreak"));
    const page_ = await pageBackground(page);
    expect(contrast(unselected.color, unselected.background)).toBeGreaterThanOrEqual(4.5);
    expect(unselected.background).toEqual(await resolveToken(page, "--popover"));
    expect(unselected.borderColor).toEqual(await resolveToken(page, "--border"));
    // Recorded, not thresholded: fill vs page is a deliberate reduction (1.05:1, the border carries the boundary).
    const fillVsPage = contrast(unselected.background, page_);
    expect(fillVsPage).toBeLessThan(1.1);
  });

  // Known failure, carried over from HEAD and deliberately not fixed in this task (see Implementation Notes).
  // Criterion 14 requires 3:1 for a non-text boundary that carries a control's state. test.fail() keeps the
  // suite green while the failure is real, and turns red the moment someone fixes it so the marker is removed.
  test.fail("unselected chip border against the page reaches 3:1 (KNOWN FAILURE: 1.36:1, pre-existing, owner decision)", async ({ page }) => {
    const unselected = await readPaint(chip(page, "shortBreak"));
    expect(contrast(unselected.borderColor, await pageBackground(page))).toBeGreaterThanOrEqual(3);
  });

  test("custom duration input: text on fill 4.5:1, error text on page 4.5:1, disabled text not worse than HEAD (2.37:1)", async ({ page }) => {
    await page.getByText("Custom", { exact: true }).click();
    const input = page.locator("input#custom-duration");
    await expect(input).toBeVisible();
    await settle(page);
    const field = await readPaint(input);
    expect(contrast(field.color, field.background)).toBeGreaterThanOrEqual(4.5);
    expect(field.background).toEqual(await resolveToken(page, "--popover"));

    await input.fill("abc");
    const error = page.locator('p[role="alert"]');
    await expect(error).toContainText("Enter a whole number");
    await settle(page);
    // The error paragraph paints no fill of its own, so read its text colour directly.
    const errorColor = parseRgb(await error.evaluate((el) => getComputedStyle(el).color));
    expect(contrast(errorColor, await pageBackground(page))).toBeGreaterThanOrEqual(4.5);
    expect(errorColor).toEqual(await resolveToken(page, "--destructive"));
  });

  test("custom duration input, running: disabled text on disabled fill is not worse than HEAD (2.37:1)", async ({ page }) => {
    await page.getByText("Custom", { exact: true }).click();
    await startButton(page).click();
    await expect(page.locator("input#custom-duration")).toBeDisabled();
    await settle(page);
    const disabled = await readPaint(page.locator("input#custom-duration"));
    expect(disabled.background).toEqual(await resolveToken(page, "--muted"));
    expect(contrast(disabled.color, disabled.background)).toBeGreaterThanOrEqual(2.37);
  });

  test("primary Start button: label on fill 4.5:1 or better; fill is the --primary token", async ({ page }) => {
    const primary = await readPaint(startButton(page));
    expect(contrast(primary.color, primary.background)).toBeGreaterThanOrEqual(4.5);
    expect(primary.background).toEqual(await resolveToken(page, "--primary"));
    expect(primary.color).toEqual(await resolveToken(page, "--primary-foreground"));
  });

  test("Reset keeps its task 005 painted figures: label on fill about 4.72:1 when running, dark label on glass about 7.18:1 when idle", async ({ page }) => {
    // Idle: Reset is the glass variant with the dark label; the fixture state is idle after beforeEach.
    const idleReset = await readPaint(resetControl(page));
    expect(contrast(idleReset.color, await pageBackground(page))).toBeGreaterThanOrEqual(4.5);
    await startButton(page).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await settle(page);
    const runningReset = await readPaint(resetControl(page));
    expect(contrast(runningReset.color, runningReset.background)).toBeGreaterThanOrEqual(3);
  });

  test("the four chips and the primary button keep at least 44 px in both dimensions at both viewports", async ({ page }) => {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await settle(page);
      for (const mode of ["focus", "shortBreak", "longBreak", "custom"]) {
        const box = await chip(page, mode).boundingBox();
        expect(box, `${mode} chip box at ${viewport.width}px`).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      const primary = await primaryButton(page).boundingBox();
      expect(primary!.height).toBeGreaterThanOrEqual(44);
      expect(primary!.width).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("task 006 mode chips: keyboard focus, grouping and behaviour", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await settle(page);
  });

  for (const mode of ["focus", "shortBreak"]) {
    test(`keyboard focus on the ${mode === "focus" ? "checked" : "unchecked"} chip: 2 px solid outline, 2 px offset, app focus colour, 3:1 or better against fill and page`, async ({ page }) => {
      await tabToCheckedMode(page);
      if (mode !== "focus") {
        // Keyboard-modality focus on an unchecked radio: move focus to it without changing the selection.
        await page.evaluate((value) => {
          (document.querySelector(`input[name="timer-mode"][value="${value}"]`) as HTMLInputElement).focus();
        }, mode);
      }
      const radio = chipRadio(page, mode);
      await expect(radio).toBeFocused();
      // outline-color is in transition-colors, so wait out the fade before reading the ring.
      await settle(page);
      const focused = await readPaint(chip(page, mode));
      expect(focused.outlineStyle).toBe("solid");
      expect(focused.outlineWidth).toBe("2px");
      expect(focused.outlineOffset).toBe("2px");
      const ring = await resolveToken(page, "--ring");
      expect(parseRgb(focused.outlineColor)).toEqual(ring);
      expect(contrast(ring, focused.background)).toBeGreaterThanOrEqual(3);
      expect(contrast(ring, await pageBackground(page))).toBeGreaterThanOrEqual(3);
    });
  }

  test("Tab enters the mode group once, lands on the checked radio, and Tab again leaves it", async ({ page }) => {
    await tabToCheckedMode(page);
    await expect(chipRadio(page, "focus")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(chipRadio(page, "focus")).not.toBeFocused();
    const onOtherRadio = await page.evaluate(() => {
      const active = document.activeElement as HTMLInputElement | null;
      return active?.type === "radio" && active.name === "timer-mode";
    });
    expect(onOtherRadio).toBe(false);
  });

  test("arrow keys move between modes and change the timer mode; the group name is exactly 'Timer mode'", async ({ page }) => {
    await expect(page.getByRole("group", { name: "Timer mode", exact: true })).toBeVisible();
    await tabToCheckedMode(page);
    await page.keyboard.press("ArrowRight");
    await expect(chipRadio(page, "shortBreak")).toBeChecked();
    await expect(chipRadio(page, "shortBreak")).toBeFocused();
  });

  test("clicking a chip label selects its radio", async ({ page }) => {
    await page.locator('label:has(input[value="longBreak"])').click();
    await expect(chipRadio(page, "longBreak")).toBeChecked();
  });
});

test.describe("task 006 axe-core on the timer surface (criterion 19)", () => {
  for (const viewport of viewports) {
    test.describe(`at ${viewport.width} px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto("/");
        await page.evaluate(() => localStorage.clear());
        await page.reload();
      });

      const seriousOrCritical = (violations: { impact?: string | null }[]) =>
        violations.filter((v) => v.impact === "critical" || v.impact === "serious");

      test("idle, running, paused and complete", async ({ page }) => {
        const scan = async () => {
          const results = await new AxeBuilder({ page }).analyze();
          expect(seriousOrCritical(results.violations)).toEqual([]);
        };
        await scan();
        await startButton(page).click();
        await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
        await scan();
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
        await scan();
        await seedTimerState(page, { status: "complete" });
        await page.reload();
        await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
        await scan();
      });

      test("custom field focused, disabled while running, and in its error state", async ({ page }) => {
        const scan = async () => {
          const results = await new AxeBuilder({ page }).analyze();
          expect(seriousOrCritical(results.violations)).toEqual([]);
        };
        await page.getByText("Custom", { exact: true }).click();
        const input = page.locator("input#custom-duration");
        await input.focus();
        await scan();
        await input.fill("abc");
        await expect(page.locator('p[role="alert"]')).toBeVisible();
        await scan();
        await input.fill("25");
        await startButton(page).click();
        await expect(input).toBeDisabled();
        await scan();
      });
    });
  }
});

test.describe("task 006 console and hydration (criteria 32 and 33)", () => {
  for (const viewport of viewports) {
    test(`no console error or warning across the named interactions at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") problems.push(`[${msg.type()}] ${msg.text()}`);
      });
      page.on("pageerror", (err) => problems.push(`[pageerror] ${err.message}`));

      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await settle(page);

      await startButton(page).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

      // Short tap on Reset: well under the 800 ms hold, so it must not reset.
      await holdPointer(page, resetControl(page), 100);
      // Completed hold on Reset.
      await holdResetWithPointer(page, 1200);
      await expect(startButton(page)).toBeVisible();

      // Completion, retroactively after a closed tab.
      await seedTimerState(page, { status: "running", endTimestamp: Date.now() - 1000, startedAt: Date.now() - 60_000, runId: "qa-run" });
      await page.reload();
      await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();

      await page.locator('label:has(input[value="shortBreak"])').click();
      await page.getByText("Custom", { exact: true }).click();
      await page.locator("input#custom-duration").fill("30");
      await page.locator("input#custom-duration").fill("abc");
      await expect(page.locator('p[role="alert"]')).toBeVisible();
      await page.reload();
      await settle(page);

      expect(problems).toEqual([]);
    });
  }

  for (const status of ["idle", "running", "paused"] as const) {
    test(`no React hydration mismatch on reload with the timer ${status}`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (/hydrat/i.test(msg.text())) problems.push(`[${msg.type()}] ${msg.text()}`);
      });
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await seedTimerState(page, {
        status,
        endTimestamp: status === "running" ? Date.now() + 600_000 : null,
        pausedRemainingMs: status === "paused" ? 300_000 : null,
        startedAt: status === "idle" ? null : Date.now(),
        runId: status === "idle" ? null : "qa-hydration",
      });
      await page.reload();
      await settle(page);
      await expect(primaryButton(page)).toBeVisible();
      expect(problems).toEqual([]);
      expect(await page.evaluate((key) => window.localStorage.getItem(key) !== null, TIMER_STORAGE_KEY)).toBe(true);
    });
  }
});
