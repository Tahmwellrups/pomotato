import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  holdKey,
  holdPointer,
  holdResetWithPointer,
  readTimerState,
  resetControl,
  seedTimerState,
} from "./helpers/timer-hold";

const HINT = "Press and hold Reset to confirm.";
const startButton = (page: Page) => page.getByRole("button", { name: "Start", exact: true });
const pauseButton = (page: Page) => page.getByRole("button", { name: "Pause", exact: true });
const resumeButton = (page: Page) => page.getByRole("button", { name: "Resume", exact: true });
const readout = (page: Page) => page.locator('[data-testid="timer-gauge"] + p');
const completionRegion = (page: Page) => page.locator('p.sr-only[role="status"]');

/** Counts persisted writes that set the timer back to idle, i.e. every reset that actually ran. */
async function countIdleWrites(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __idleWrites: number }).__idleWrites);
}

async function installIdleWriteCounter(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __idleWrites: number };
    w.__idleWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "pomotato-timer") {
        try {
          const parsed = JSON.parse(value) as { state: { status: string } };
          if (parsed.state.status === "idle") w.__idleWrites += 1;
        } catch {
          // Not JSON: not a timer write.
        }
      }
      return original.call(this, key, value);
    };
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.trim().replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastOfRgbString(a: string, b: string): number {
  const parse = (rgb: string): [number, number, number] => {
    const m = /rgba?\((\d+), (\d+), (\d+)/.exec(rgb);
    expect(m, `computed colour ${rgb}`).not.toBeNull();
    return [Number(m?.[1]), Number(m?.[2]), Number(m?.[3])];
  };
  const [x, y] = [relativeLuminance(parse(a)), relativeLuminance(parse(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Perceived hold progress, read from what is painted rather than from a JS variable.
// Both motion settings reveal the fill by clip-path: default motion slides the edge continuously,
// reduced motion steps it to 25/50/75/100%. The revealed width fraction is the progress in both.
// (Reduced motion used to fade fill opacity; that was replaced because it hid the label contrast dip.)
// Throws if the value cannot be read, so a parse failure cannot pass silently.
async function perceivedHoldProgress(reset: Locator): Promise<number> {
  return reset.evaluate((el) => {
    const fill = el.querySelector<HTMLElement>(".hb-fill");
    if (!fill) throw new Error("hold fill layer (.hb-fill) not found");
    const width = fill.getBoundingClientRect().width;
    const clip = getComputedStyle(fill).clipPath;
    // Chromium serialises the right inset as px or as a percentage of the width.
    const match = /inset\(\s*[\d.]+px\s+([\d.]+)(px|%)/.exec(clip);
    if (!width || !match) throw new Error(`unreadable clip-path or width: ${clip} / ${width}`);
    const rightPx = match[2] === "%" ? (parseFloat(match[1]) / 100) * width : parseFloat(match[1]);
    return Math.min(1, Math.max(0, (width - rightPx) / width));
  });
}

test.describe("Hold-to-confirm Reset, pointer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  test("the control is named Reset and its visible text names the same action", async ({ page }) => {
    await expect(resetControl(page)).toHaveAccessibleName("Reset");
    await expect(resetControl(page)).toContainText("Reset");
  });

  test("a short tap leaves status, end timestamp, paused remainder and the readout exactly as they were", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    const before = await readTimerState(page);
    expect(before?.status).toBe("running");
    const readoutBefore = await readout(page).textContent();

    await holdPointer(page, resetControl(page), 100);
    await page.waitForTimeout(150);

    const after = await readTimerState(page);
    expect(after).toEqual(before);
    expect(after?.endTimestamp).not.toBeNull();
    expect(after?.pausedRemainingMs).toBeNull();
    await expect(pauseButton(page)).toBeVisible();

    // The timer keeps counting after the tap.
    await page.waitForTimeout(1200);
    const readoutAfter = await readout(page).textContent();
    expect(readoutAfter, "the readout kept counting after a tap").not.toBe(readoutBefore);
  });

  test("a tap shows the hold hint politely, leaves the completion region alone, and does not shift the controls", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect(page.getByText(HINT)).toHaveCount(0);
    // Layout offsets ignore the transient press-scale transform that a hold applies.
    const offsets = (el: HTMLElement) => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    const layout = async () => ({
      start: await pauseButton(page).evaluate(offsets),
      reset: await resetControl(page).evaluate(offsets),
      page: await page.evaluate(() => document.documentElement.scrollHeight),
    });
    const before = await layout();
    expect(before.reset.height).toBeGreaterThan(0);

    await holdPointer(page, resetControl(page), 100);

    const hint = page.getByText(HINT);
    await expect(hint).toBeVisible();
    await expect(hint).toHaveAttribute("role", "status");
    await expect(hint).toHaveAttribute("aria-live", "polite");
    expect(await completionRegion(page).textContent()).toBe("");

    const after = await layout();
    expect(after.start).toEqual(before.start);
    expect(after.reset).toEqual(before.reset);
    expect(after.page).toBe(before.page);
  });

  test("a press shorter than the hold time (600 ms) does not reset, and one longer (1100 ms) does", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await holdResetWithPointer(page, 600);
    await page.waitForTimeout(300);
    await expect(pauseButton(page)).toBeVisible();
    expect((await readTimerState(page))?.status).toBe("running");

    await holdResetWithPointer(page, 1100);
    await expect(startButton(page)).toBeVisible();
    await expect(readout(page)).toHaveText("25:00");
  });

  test("a completed hold resets exactly once, and the reset survives a reload", async ({ page }) => {
    await installIdleWriteCounter(page);
    await page.reload();
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();

    const before = await countIdleWrites(page);
    await holdResetWithPointer(page, 1200);
    await expect(startButton(page)).toBeVisible();
    await page.waitForTimeout(800);
    expect(await countIdleWrites(page) - before, "idle writes for one completed hold").toBe(1);

    const state = await readTimerState(page);
    expect(state?.status).toBe("idle");
    expect(state?.endTimestamp).toBeNull();
    expect(state?.runId).toBeNull();
    await expect(readout(page)).toHaveText("25:00");

    await page.reload();
    await expect(startButton(page)).toBeVisible();
    await expect(readout(page)).toHaveText("25:00");
  });

  test("holding well past the hold time still resets exactly once", async ({ page }) => {
    await installIdleWriteCounter(page);
    await page.reload();
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();

    const before = await countIdleWrites(page);
    await holdResetWithPointer(page, 2500);
    await expect(startButton(page)).toBeVisible();
    await page.waitForTimeout(800);
    expect(await countIdleWrites(page) - before, "idle writes for one long hold").toBe(1);
  });

  test("releasing early cancels, leaves the timer running, and leaves no residual fill", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    const before = await readTimerState(page);
    const reset = resetControl(page);

    await page.mouse.move(
      ((await reset.boundingBox())?.x ?? 0) + 20,
      ((await reset.boundingBox())?.y ?? 0) + 20,
    );
    await page.mouse.down();
    await page.waitForTimeout(400);
    const midProgress = await reset.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--hb-p")));
    expect(midProgress, "fill is visibly progressing mid-hold").toBeGreaterThan(0.2);
    await page.mouse.up();

    await page.waitForTimeout(700);
    await expect(pauseButton(page)).toBeVisible();
    expect(await readTimerState(page)).toEqual(before);
    const residual = await reset.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--hb-p")));
    expect(residual, "no residual fill after release").toBeLessThan(0.01);
    await expect(reset).toHaveAttribute("data-phase", "idle");
  });
});

test.describe("Hold-to-confirm Reset, keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  test("Tab reaches Reset straight after Start, which is the visual order", async ({ page }) => {
    await startButton(page).focus();
    await page.keyboard.press("Tab");
    await expect(resetControl(page)).toBeFocused();
    const startBox = await startButton(page).boundingBox();
    const resetBox = await resetControl(page).boundingBox();
    expect(startBox?.x ?? Infinity).toBeLessThan(resetBox?.x ?? 0);
  });

  test("holding Space resets", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await resetControl(page).focus();
    await holdKey(page, "Space", 1200);
    await expect(startButton(page)).toBeVisible();
    await expect(readout(page)).toHaveText("25:00");
  });

  test("holding Enter resets", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await resetControl(page).focus();
    await holdKey(page, "Enter", 1200);
    await expect(startButton(page)).toBeVisible();
    await expect(readout(page)).toHaveText("25:00");
  });

  test("a single Enter press is a tap: it does not reset", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await resetControl(page).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect((await readTimerState(page))?.status).toBe("running");
    await expect(pauseButton(page)).toBeVisible();
  });

  test("Escape during a Space hold cancels it with no state change", async ({ page }) => {
    await installIdleWriteCounter(page);
    await page.reload();
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    const before = await readTimerState(page);
    const writesBefore = await countIdleWrites(page);
    await resetControl(page).focus();

    await page.keyboard.down("Space");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    await page.keyboard.up("Space");
    await page.waitForTimeout(300);

    await expect(pauseButton(page)).toBeVisible();
    expect(await readTimerState(page)).toEqual(before);
    expect(await countIdleWrites(page)).toBe(writesBefore);
  });

  test("releasing Space early cancels", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await resetControl(page).focus();
    await holdKey(page, "Space", 300);
    await page.waitForTimeout(900);
    expect((await readTimerState(page))?.status).toBe("running");
    await expect(pauseButton(page)).toBeVisible();
  });
});

test.describe("Hold-to-confirm Reset: look and availability", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  test("the focus ring matches the Start button: solid 2 px amber, 2 px offset, 3:1 against surface and page", async ({ page }) => {
    // Start is measured while focused: an unfocused button has no ring to compare.
    await startButton(page).focus();
    await expect(startButton(page)).toBeFocused();
    const startRing = await startButton(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, colour: s.outlineColor };
    });
    expect(startRing).toEqual({ style: "solid", width: "2px", offset: "2px", colour: "rgb(180, 83, 9)" });

    await page.keyboard.press("Tab");
    const reset = resetControl(page);
    await expect(reset).toBeFocused();
    const ring = await reset.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, colour: s.outlineColor, surface: s.backgroundColor };
    });
    expect(ring).toMatchObject({ style: "solid", width: "2px", offset: "2px", colour: "rgb(180, 83, 9)" });

    const pageBackground = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim());
    const pageRgb = `rgb(${hexToRgb(pageBackground).join(", ")})`;
    expect(contrastOfRgbString(ring.colour, ring.surface), "ring vs button surface").toBeGreaterThanOrEqual(3);
    expect(contrastOfRgbString(ring.colour, pageRgb), "ring vs page").toBeGreaterThanOrEqual(3);
  });

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 1280, height: 800 },
  ]) {
    test(`at ${viewport.width} px both timer controls are at least 44 px tall and wide`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const control of [startButton(page), resetControl(page)]) {
        const box = await control.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test("glow is off: no box shadow on Reset at rest or mid-hold", async ({ page }) => {
    const reset = resetControl(page);
    // glow={false} omits the data-glow flag entirely.
    expect(await reset.getAttribute("data-glow")).toBeNull();
    await expect(reset).toHaveCSS("box-shadow", "none");
    await expect(startButton(page)).toHaveCSS("box-shadow", "none");
    const box = await reset.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await expect(reset).toHaveAttribute("data-phase", "holding");
    await expect(reset).toHaveCSS("box-shadow", "none");
    await page.mouse.up();
  });

  test("Reset is enabled and visible in every timer status", async ({ page }) => {
    await expect(resetControl(page)).toBeEnabled();
    await expect(resetControl(page)).toBeVisible();

    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect(resetControl(page)).toBeEnabled();

    await pauseButton(page).click();
    await expect(resumeButton(page)).toBeVisible();
    await expect(resetControl(page)).toBeEnabled();

    await seedTimerState(page, { status: "complete" });
    await page.reload();
    await expect(resetControl(page)).toBeEnabled();
    await expect(resetControl(page)).toBeVisible();
  });

  test("Start, Pause and Resume keep single-activation behaviour and the primary styling", async ({ page }) => {
    // Assert the painted result, not the utility class name: the primary fill is the
    // computed value of the --primary token, resolved by the browser itself.
    const primaryFill = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--primary)";
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    });
    expect(primaryFill).toBe("rgb(180, 83, 9)");
    await expect(startButton(page)).toHaveCSS("background-color", primaryFill);
    await expect(startButton(page)).toHaveCSS("color", "rgb(255, 255, 255)");
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await pauseButton(page).click();
    await expect(resumeButton(page)).toBeVisible();
    await resumeButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    // The pointer is still over the button that was just clicked, so its painted fill is the
    // hover mix. Move away to read the resting primary fill.
    await page.mouse.move(0, 0);
    await expect(pauseButton(page)).toHaveCSS("background-color", primaryFill);
    await expect(pauseButton(page)).toHaveCSS("color", "rgb(255, 255, 255)");
  });
});

test.describe("Hold-to-confirm Reset under reduced motion (paired with default motion)", () => {
  const motionCases = [
    { label: "default motion (paired control)", media: "no-preference" as const, reducedExpected: false },
    { label: "reduced motion", media: "reduce" as const, reducedExpected: true },
  ];

  for (const motion of motionCases) {
    test.describe(motion.label, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ reducedMotion: motion.media });
        await page.goto("/");
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await expect(startButton(page)).toBeVisible();
        const reduced = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        expect(reduced).toBe(motion.reducedExpected);
      });

      test("a full hold still resets", async ({ page }) => {
        await startButton(page).click();
        await expect(pauseButton(page)).toBeVisible();
        await holdResetWithPointer(page, 1200);
        await expect(startButton(page)).toBeVisible();
        await expect(readout(page)).toHaveText("25:00");
      });

      test("an early release still cancels", async ({ page }) => {
        await startButton(page).click();
        await expect(pauseButton(page)).toBeVisible();
        await holdPointer(page, resetControl(page), 300);
        await page.waitForTimeout(900);
        expect((await readTimerState(page))?.status).toBe("running");
        await expect(pauseButton(page)).toBeVisible();
      });

      test("Escape still cancels a keyboard hold", async ({ page }) => {
        await startButton(page).click();
        await expect(pauseButton(page)).toBeVisible();
        await resetControl(page).focus();
        await page.keyboard.down("Space");
        await page.waitForTimeout(300);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1000);
        await page.keyboard.up("Space");
        await expect(pauseButton(page)).toBeVisible();
        expect((await readTimerState(page))?.status).toBe("running");
      });

      test("the hold is visibly in progress mid-hold", async ({ page }) => {
        await startButton(page).click();
        await expect(pauseButton(page)).toBeVisible();
        const reset = resetControl(page);
        const box = await reset.boundingBox();
        await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
        await page.mouse.down();
        await page.waitForTimeout(400);
        const progress = await perceivedHoldProgress(reset);
        await page.mouse.up();
        expect(progress, `perceived progress ${progress}`).toBeGreaterThan(0.2);
      });

      test("the hold progress keeps growing across the hold, so it reads as progress", async ({ page }) => {
        await startButton(page).click();
        await expect(pauseButton(page)).toBeVisible();
        const reset = resetControl(page);
        const box = await reset.boundingBox();
        await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
        await page.mouse.down();
        await page.waitForTimeout(200);
        const early = await perceivedHoldProgress(reset);
        await page.waitForTimeout(400);
        const later = await perceivedHoldProgress(reset);
        await page.mouse.up();
        expect(early, `early=${early}`).toBeGreaterThan(0);
        expect(later, `early=${early} later=${later}`).toBeGreaterThan(early);
      });
    });
  }
});
