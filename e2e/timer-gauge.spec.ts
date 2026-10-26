import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { holdResetWithPointer, readTimerState, resetControl, seedTimerState } from "./helpers/timer-hold";

const gauge = (page: Page) => page.getByTestId("timer-gauge");
const readout = (page: Page) => page.locator('[data-testid="timer-gauge"] + p');
const meter = (page: Page) => page.locator('[data-testid="timer-gauge"] [role="meter"]');
const liquid = (page: Page) => page.locator('[data-testid="timer-gauge"] [role="meter"] > div').first();
const startButton = (page: Page) => page.getByRole("button", { name: "Start", exact: true });
const pauseButton = (page: Page) => page.getByRole("button", { name: "Pause", exact: true });
const resumeButton = (page: Page) => page.getByRole("button", { name: "Resume", exact: true });

async function levelOf(page: Page): Promise<number> {
  const raw = await gauge(page).getAttribute("data-gauge-level");
  expect(raw, "data-gauge-level is present once hydrated").not.toBeNull();
  return Number(raw);
}

async function readoutSeconds(page: Page): Promise<number> {
  const text = ((await readout(page).textContent()) ?? "").trim();
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  expect(match, `readout shows mm:ss, got "${text}"`).not.toBeNull();
  return Number(match?.[1]) * 60 + Number(match?.[2]);
}

/** Asserts the gauge level equals the level derived from the mm:ss readout on the same page. */
async function expectLevelMatchesReadout(page: Page, fullSec: number, toleranceLevel = 2) {
  const level = await levelOf(page);
  const seconds = await readoutSeconds(page);
  const derived = (seconds / fullSec) * 100;
  expect(Math.abs(level - derived), `level ${level} vs readout ${seconds}s of ${fullSec}s`).toBeLessThanOrEqual(toleranceLevel);
}

async function fastForward(page: Page, ms: number) {
  await page.clock.fastForward(ms);
}

/** Waits until the readout shows `targetSec` (within `tolSec`), so the display has caught up with the clock jump. */
async function waitForReadoutSeconds(page: Page, targetSec: number, tolSec = 2) {
  await expect
    .poll(async () => Math.abs((await readoutSeconds(page)) - targetSec), { message: `readout reaches ${targetSec}s` })
    .toBeLessThanOrEqual(tolSec);
}

/** Converts any computed CSS colour (rgb, lab, oklch) to 8-bit sRGB by letting the browser paint it. */
async function srgbOf(page: Page, colour: string): Promise<[number, number, number]> {
  return page.evaluate((value) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [-1, -1, -1] as [number, number, number];
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  }, colour);
}

test.describe("Gauge level comes from derived time", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  const modes = [
    { name: "Focus", select: null, custom: null, fullSec: 25 * 60 },
    { name: "Short break", select: "shortBreak", custom: null, fullSec: 5 * 60 },
    { name: "Custom 10 minutes", select: "custom", custom: "10", fullSec: 10 * 60 },
  ] as const;

  for (const mode of modes) {
    test(`${mode.name}: full at start, 50 at half, 0 at completion`, async ({ page }) => {
      if (mode.select) {
        await page.locator(`label:has(input[value="${mode.select}"])`).click();
      }
      if (mode.custom) {
        await page.locator('input[id="custom-duration"]').fill(mode.custom);
      }
      await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");

      await startButton(page).click();
      await expect(pauseButton(page)).toBeVisible();
      const atStart = await levelOf(page);
      expect(atStart, "level at start").toBeGreaterThanOrEqual(99);
      expect(atStart, "level at start").toBeLessThanOrEqual(100);

      await page.clock.install();
      await fastForward(page, (mode.fullSec / 2) * 1000);
      await waitForReadoutSeconds(page, mode.fullSec / 2);
      const atHalf = await levelOf(page);
      expect(Math.abs(atHalf - 50), `level at half ${atHalf}`).toBeLessThanOrEqual(2);
      await expectLevelMatchesReadout(page, mode.fullSec);

      await fastForward(page, (mode.fullSec / 2 + 2) * 1000);
      await expect(readout(page)).toHaveText("00:00");
      const atEnd = await levelOf(page);
      expect(atEnd, "level at completion").toBeLessThanOrEqual(1);
    });
  }

  test("the drawn liquid, not only the data attribute, reaches the new level after a change", async ({ page }) => {
    // The drawn top edge is the liquid's clip-path, in percent of the vessel height from the top.
    const liquidTopPercent = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="timer-gauge"] [role="meter"] > div') as HTMLElement | null;
        const match = /calc\(([-\d.]+)%/.exec(el?.style.clipPath ?? "");
        return match ? Number(match[1]) : Number.NaN;
      });
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await page.clock.install();
    await fastForward(page, 12.5 * 60 * 1000);
    await waitForReadoutSeconds(page, 750);
    await expect.poll(liquidTopPercent).toBeGreaterThanOrEqual(48);
    await expect.poll(liquidTopPercent).toBeLessThanOrEqual(52);

    // Mode change re-bases the level from about 50 to 100: the liquid must rise to the top.
    await page.locator('label:has(input[value="shortBreak"])').click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");
    await expect.poll(liquidTopPercent, { message: "drawn liquid top edge after the change" }).toBeLessThanOrEqual(1);
  });

  test("starting from idle does not slosh the liquid (documents frontend's choice; not an acceptance criterion)", async ({ page }) => {
    const clip = () => page.evaluate(() => (document.querySelector('[data-testid="timer-gauge"] [role="meter"] > div') as HTMLElement | null)?.style.clipPath ?? "");
    const topOf = (value: string) => {
      const match = /calc\(([-\d.]+)%/.exec(value);
      return match ? Number(match[1]) : Number.NaN;
    };
    // Wait for the gauge to render its level before reading it: a single read right after
    // navigation can see no clip-path yet under load (flake, task 009 QA loop 2).
    await expect.poll(async () => Number.isNaN(topOf(await clip()))).toBe(false);
    const idleTop = topOf(await clip());
    expect(idleTop).toBe(0);
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await page.waitForTimeout(800);
    // The derived level drops by a few thousandths of a percent as the first milliseconds pass: no visible slosh.
    expect(Math.abs(topOf(await clip()) - idleTop), "liquid movement after a start, in percent of the vessel").toBeLessThan(0.5);
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");
  });

  test("switching mode and changing the custom duration re-bases against the new full duration", async ({ page }) => {
    await startButton(page).click();
    await page.clock.install();
    await fastForward(page, 12.5 * 60 * 1000);
    await waitForReadoutSeconds(page, 750);
    expect(Math.abs((await levelOf(page)) - 50)).toBeLessThanOrEqual(2);

    await page.locator('label:has(input[value="shortBreak"])').click();
    await expect(readout(page)).toHaveText("05:00");
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");

    await page.locator('label:has(input[value="custom"])').click();
    await page.locator('input[id="custom-duration"]').fill("3");
    await expect(readout(page)).toHaveText("03:00");
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");

    await page.locator('input[id="custom-duration"]').fill("4");
    await expect(readout(page)).toHaveText("04:00");
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");
  });

  test("pause freezes the level for 3 seconds and resume continues from the same level", async ({ page }) => {
    await startButton(page).click();
    await page.clock.install();
    await fastForward(page, 12.5 * 60 * 1000);
    await waitForReadoutSeconds(page, 750);
    await pauseButton(page).click();
    await expect(resumeButton(page)).toBeVisible();

    const pausedLevel = await levelOf(page);
    const pausedReadout = await readout(page).textContent();
    await page.waitForTimeout(3000);
    expect(await levelOf(page), "level while paused").toBe(pausedLevel);
    expect(await readout(page).textContent(), "readout while paused").toBe(pausedReadout);

    await resumeButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    const resumedLevel = await levelOf(page);
    expect(Math.abs(resumedLevel - pausedLevel), "resume starts at the paused level").toBeLessThanOrEqual(1);

    await fastForward(page, 60 * 1000);
    const later = await levelOf(page);
    expect(pausedLevel - later, "level falls after resume").toBeGreaterThanOrEqual(3);
  });

  test("a session that expired while the tab was closed loads empty and does not animate down from full", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();

    // Record every level the wrapper ever shows across the reload, from before hydration on.
    await page.addInitScript(() => {
      const w = window as unknown as { __gaugeSeq: string[] };
      w.__gaugeSeq = [];
      const sample = () => {
        const el = document.querySelector('[data-testid="timer-gauge"]');
        const value = el ? (el.getAttribute("data-gauge-level") ?? "absent") : "no-wrapper";
        if (w.__gaugeSeq[w.__gaugeSeq.length - 1] !== value) w.__gaugeSeq.push(value);
      };
      new MutationObserver(sample).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-gauge-level"],
      });
      sample();
    });

    await page.clock.install();
    await fastForward(page, 26 * 60 * 1000);
    await page.reload();
    await expect(readout(page)).toHaveText("00:00");
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "0");

    const sequence = await page.evaluate(() => (window as unknown as { __gaugeSeq: string[] }).__gaugeSeq);
    expect(sequence, "the observer recorded the wrapper").toContain("0");
    const shown = sequence.filter((value) => value !== "absent" && value !== "no-wrapper");
    expect(shown, `levels shown after reload: ${sequence.join(",")}`).toEqual(["0"]);
  });
});

test.describe("Idle loop: no animation frames once settled", () => {
  test.beforeEach(async ({ page }) => {
    // Counts every requestAnimationFrame call the page makes, installed before any app script runs.
    await page.addInitScript(() => {
      const w = window as unknown as { __rafCalls: number };
      w.__rafCalls = 0;
      const real = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        w.__rafCalls += 1;
        return real(callback);
      };
    });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  async function framesInWindow(page: Page, settleMs: number, windowMs: number): Promise<number> {
    await page.waitForTimeout(settleMs);
    await page.evaluate(() => {
      (window as unknown as { __rafCalls: number }).__rafCalls = 0;
    });
    await page.waitForTimeout(windowMs);
    return page.evaluate(() => (window as unknown as { __rafCalls: number }).__rafCalls);
  }

  test("idle: zero animation frames after a 1 s settle window", async ({ page }) => {
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");
    expect(await framesInWindow(page, 1000, 1000)).toBe(0);
  });

  test("paused: zero animation frames after a 1 s settle window", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await pauseButton(page).click();
    await expect(resumeButton(page)).toBeVisible();
    expect(await framesInWindow(page, 1000, 1000)).toBe(0);
  });

  test("complete: zero animation frames after a 1 s settle window", async ({ page }) => {
    await seedTimerState(page, { status: "complete" });
    await page.reload();
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "0");
    expect(await framesInWindow(page, 1000, 1000)).toBe(0);
  });

  test("positive control: running timer does request animation frames", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    expect(await framesInWindow(page, 300, 1000)).toBeGreaterThan(0);
  });
});

test.describe("Canvas colours re-read from tokens at runtime", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  test("liquid and glass colours are resolved strings, not var() references, at load", async ({ page }) => {
    await expect(gauge(page)).toHaveAttribute("data-liquid-color", "#d97706");
    // The resolved value of --popover, as the token is written in globals.css.
    expect(await gauge(page).getAttribute("data-glass-color")).toBe("#fffaf3");
    expect(await gauge(page).getAttribute("data-liquid-color")).not.toContain("var(");
  });

  test("a runtime change to --gauge-liquid re-reads the colour and repaints the liquid", async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty("--gauge-liquid", "#0000ff"));
    await expect(gauge(page)).toHaveAttribute("data-liquid-color", "#0000ff");
    await expect(liquid(page)).toHaveCSS("background-color", "rgb(0, 0, 255)");
  });

  test("a change to --popover re-reads the glass colour and repaints the vessel", async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty("--popover", "#00ff00"));
    await expect(gauge(page)).toHaveAttribute("data-glass-color", "#00ff00");
    await expect(meter(page)).toHaveCSS("background-color", "rgb(0, 255, 0)");
  });

  test("adding a .dark class to <html> with a dark token override re-reads the colour (milestone 4 signal)", async ({ page }) => {
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "qa-theme";
      style.textContent = ":root.dark { --gauge-liquid: #ff0000; }";
      document.head.appendChild(style);
    });
    await expect(gauge(page)).toHaveAttribute("data-liquid-color", "#d97706");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(gauge(page)).toHaveAttribute("data-liquid-color", "#ff0000");
    await expect(liquid(page)).toHaveCSS("background-color", "rgb(255, 0, 0)");
  });

  test("the Reset hold colours re-read from --primary at runtime", async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty("--primary", "#00ff00"));
    await expect(resetControl(page)).toHaveAttribute("style", /--hb-fill:\s*#00ff00/);
  });
});

test.describe("Gauge accessibility and layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  test("the gauge is hidden from assistive tech, holds no text, and is not a control", async ({ page }) => {
    await expect(gauge(page)).toHaveAttribute("aria-hidden", "true");
    expect((await gauge(page).textContent())?.trim()).toBe("");
    await expect(meter(page)).toHaveAttribute("data-interactive", "false");
    expect(await gauge(page).locator("[tabindex], button, input, a").count()).toBe(0);
    // Pointer input on the gauge must not change the level or the timer.
    const before = await levelOf(page);
    const box = await gauge(page).boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 4);
    // The timer is still idle, and the level is unchanged: pointer input on the gauge is inert.
    expect((await readTimerState(page))?.status).toBe("idle");
    await expect(startButton(page)).toBeVisible();
    expect(await levelOf(page)).toBe(before);
  });

  test("exactly one number is rendered in the timer: the mm:ss readout", async ({ page }) => {
    await expect(page.getByText(/^\d{2}:\d{2}$/)).toHaveCount(1);
  });

  test("the completion announcement stays in its own live region and announces once", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __announce: string[]; __statusSeen: number };
      w.__announce = [];
      w.__statusSeen = 0;
      const check = () => {
        const region = document.querySelector('[role="status"].sr-only');
        if (region) {
          w.__statusSeen += 1;
          const text = region.textContent ?? "";
          const last = w.__announce[w.__announce.length - 1];
          if (text !== "" && text !== last) w.__announce.push(text);
        }
      };
      new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
      check();
    });
    await page.reload();
    await startButton(page).click();
    await page.clock.install();
    await fastForward(page, 26 * 60 * 1000);
    await expect(readout(page)).toHaveText("00:00");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __announce: string[] }).__announce)).toEqual([
      "Focus complete",
    ]);
    const seen = await page.evaluate(() => (window as unknown as { __statusSeen: number }).__statusSeen);
    expect(seen, "the completion region was observed").toBeGreaterThan(0);

    // A reload of an already-complete timer must not re-announce.
    await page.evaluate(() => {
      (window as unknown as { __announce: string[] }).__announce = [];
    });
    await page.reload();
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "0");
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __announce: string[] }).__announce)).toEqual([]);
  });

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 1280, height: 800 },
  ]) {
    test(`at ${viewport.width} px: no horizontal scroll, gauge does not overlap controls, controls are 44 px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startButton(page).click();
      await expect(pauseButton(page)).toBeVisible();

      const scroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);

      const gaugeBox = await gauge(page).boundingBox();
      const readoutBox = await readout(page).boundingBox();
      const fieldsetBox = await page.locator("fieldset").first().boundingBox();
      const startBox = await pauseButton(page).boundingBox();
      const resetBox = await resetControl(page).boundingBox();
      for (const box of [gaugeBox, readoutBox, fieldsetBox, startBox, resetBox]) {
        expect(box).not.toBeNull();
      }
      if (!gaugeBox || !readoutBox || !fieldsetBox || !startBox || !resetBox) return;

      // The readout sits fully inside the gauge.
      expect(readoutBox.x).toBeGreaterThanOrEqual(gaugeBox.x - 0.5);
      expect(readoutBox.x + readoutBox.width).toBeLessThanOrEqual(gaugeBox.x + gaugeBox.width + 0.5);
      expect(readoutBox.y).toBeGreaterThanOrEqual(gaugeBox.y - 0.5);
      expect(readoutBox.y + readoutBox.height).toBeLessThanOrEqual(gaugeBox.y + gaugeBox.height + 0.5);
      // The mode selector sits above the gauge; the controls sit below it.
      expect(fieldsetBox.y + fieldsetBox.height).toBeLessThanOrEqual(gaugeBox.y + 0.5);
      expect(startBox.y).toBeGreaterThanOrEqual(gaugeBox.y + gaugeBox.height - 0.5);
      expect(resetBox.y).toBeGreaterThanOrEqual(gaugeBox.y + gaugeBox.height - 0.5);
      for (const box of [startBox, resetBox]) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test("contrast of the mm:ss readout over the liquid, the glass and the waterline", async ({ page }) => {
    const luminance = ([r, g, b]: [number, number, number]) => {
      const [R, G, B] = [r, g, b].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    const ratio = (a: [number, number, number], b: [number, number, number]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const measured: string[] = [];
    await page.clock.install();
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 320, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await startButton(page).click();
      await expect(pauseButton(page)).toBeVisible();

      for (const [label, advanceMs, targetSec] of [
        ["full", 0, 1500],
        ["half", 12.5 * 60 * 1000, 750],
        ["empty", 13 * 60 * 1000, 0],
      ] as const) {
        if (advanceMs > 0) await fastForward(page, advanceMs);
        // 0 means the readout must reach 00:00 (readoutSeconds reads it as 0).
        await waitForReadoutSeconds(page, targetSec);
        const computed = await page.evaluate(() => {
          const text = document.querySelector('[data-testid="timer-gauge"] + p');
          const meterEl = document.querySelector('[data-testid="timer-gauge"] [role="meter"]');
          const liquidEl = meterEl?.querySelector(":scope > div") ?? null;
          return {
            text: text ? getComputedStyle(text).color : "",
            fontPx: text ? parseFloat(getComputedStyle(text).fontSize) : 0,
            liquid: liquidEl ? getComputedStyle(liquidEl).backgroundColor : "",
            glass: meterEl ? getComputedStyle(meterEl).backgroundColor : "",
          };
        });
        const text = await srgbOf(page, computed.text);
        const liquid = await srgbOf(page, computed.liquid);
        const glass = await srgbOf(page, computed.glass);
        const level = await levelOf(page);
        const liquidRatio = ratio(text, liquid);
        const glassRatio = ratio(text, glass);
        measured.push(
          `${viewport.width}px ${label} level=${level} font=${computed.fontPx}px text=rgb(${text}) liquid=rgb(${liquid}) glass=rgb(${glass}) text/liquid=${liquidRatio.toFixed(2)} text/glass=${glassRatio.toFixed(2)} waterline(min)=${Math.min(liquidRatio, glassRatio).toFixed(2)}`,
        );
        // The readout is at least 24 px at every viewport, so AA large text (3:1) is the floor.
        expect(computed.fontPx).toBeGreaterThanOrEqual(24);
        expect(liquidRatio, `${label} text over liquid at ${viewport.width}px`).toBeGreaterThanOrEqual(3);
        expect(glassRatio, `${label} text over glass at ${viewport.width}px`).toBeGreaterThanOrEqual(3);
      }
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(startButton(page)).toBeVisible();
    }
    // Recorded for the QA report.
    console.log(`CONTRAST\n${measured.join("\n")}`);
  });

  test("non-text contrast of liquid against glass is measured and recorded", async ({ page }) => {
    const liquidColour = await gauge(page).getAttribute("data-liquid-color");
    const glassColour = await gauge(page).getAttribute("data-glass-color");
    expect(liquidColour).not.toBeNull();
    expect(glassColour).not.toBeNull();
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [lum(liquidColour ?? "#000000"), lum(glassColour ?? "#000000")].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    console.log(`NONTEXT liquid=${liquidColour} glass=${glassColour} ratio=${ratio.toFixed(2)}`);
    // 1.4.11 asks for 3:1 when the level is the only carrier. mm:ss carries the truth, so this is recorded, not gated.
    expect(ratio).toBeGreaterThan(1);
  });

  test("the vessel carries its 1px border and no shadow", async ({ page }) => {
    await expect(meter(page)).toHaveCSS("box-shadow", "none");
    await expect(meter(page)).toHaveCSS("border-top-width", "1px");
  });
});

test.describe("Reduced motion: the gauge still shows the correct level", () => {
  const gaugeStillTracksTime = async (page: Page) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");
    await page.clock.install();
    await fastForward(page, 12.5 * 60 * 1000);
    await waitForReadoutSeconds(page, 750);
    await expectLevelMatchesReadout(page, 25 * 60);
    expect(Math.abs((await levelOf(page)) - 50)).toBeLessThanOrEqual(2);
    // Keeps tracking after the first sample: the level moves as time passes.
    const before = await levelOf(page);
    await fastForward(page, 5 * 60 * 1000);
    await waitForReadoutSeconds(page, 450);
    const after = await levelOf(page);
    expect(before - after, "level falls as time passes").toBeGreaterThanOrEqual(15);
    await expectLevelMatchesReadout(page, 25 * 60);
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  test("default motion (paired control): the gauge tracks derived time", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);
    await gaugeStillTracksTime(page);
  });

  test("reduced motion: the gauge still tracks derived time", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await gaugeStillTracksTime(page);
  });

  /** Samples the liquid's clip-path across a large level jump and returns the largest slosh lean seen, in px. */
  async function maxLeanDuringJump(page: Page): Promise<number> {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await page.clock.install();
    await fastForward(page, 12.5 * 60 * 1000);
    await waitForReadoutSeconds(page, 750);
    await page.evaluate(() => {
      const w = window as unknown as { __clips: string[]; __sampler: number };
      const liquidEl = document.querySelector('[data-testid="timer-gauge"] [role="meter"] > div');
      w.__clips = [];
      w.__sampler = window.setInterval(() => {
        if (liquidEl instanceof HTMLElement) w.__clips.push(liquidEl.style.clipPath);
      }, 16);
    });
    // Changing mode re-bases the level from about 50 to 100 in one step.
    await page.locator('label:has(input[value="shortBreak"])').click();
    await page.waitForTimeout(1500);
    const clips = await page.evaluate(() => {
      const w = window as unknown as { __clips: string[]; __sampler: number };
      window.clearInterval(w.__sampler);
      return w.__clips;
    });
    expect(clips.length, "sampled the liquid during the jump").toBeGreaterThan(10);
    let maxLean = 0;
    for (const clip of clips) {
      for (const match of clip.matchAll(/calc\([-\d.]+% ([+-]) ([\d.]+)px\)/g)) {
        maxLean = Math.max(maxLean, Number(match[2]));
      }
    }
    return maxLean;
  }

  test("default motion (paired control): the liquid leans while it sloshes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const lean = await maxLeanDuringJump(page);
    expect(lean, "positive control: the default slosh shows a lean").toBeGreaterThan(0.5);
  });

  test("reduced motion: the liquid settles without lean, and still reaches the right level", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const lean = await maxLeanDuringJump(page);
    expect(lean, "no slosh lean under reduced motion").toBe(0);
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "100");
  });
});

test.describe("Console and hydration", () => {
  test("no hydration error or warning on reload while idle, running and paused", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") messages.push(`${msg.type()}: ${msg.text()}`);
    });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
    await page.reload();
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await page.reload();
    await expect(pauseButton(page)).toBeVisible();
    await pauseButton(page).click();
    await expect(resumeButton(page)).toBeVisible();
    await page.reload();
    await expect(resumeButton(page)).toBeVisible();
    expect(messages.filter((m) => /hydrat|mismatch/i.test(m))).toEqual([]);
  });

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 1280, height: 800 },
  ]) {
    test(`zero console errors or warnings across the whole flow at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const messages: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") messages.push(`${msg.type()}: ${msg.text()}`);
      });
      page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(startButton(page)).toBeVisible();
      await startButton(page).click();
      await expect(pauseButton(page)).toBeVisible();
      await pauseButton(page).click();
      await expect(resumeButton(page)).toBeVisible();
      await resumeButton(page).click();
      await expect(pauseButton(page)).toBeVisible();
      await holdResetWithPointer(page);
      await expect(startButton(page)).toBeVisible();
      await startButton(page).click();
      await expect(pauseButton(page)).toBeVisible();
      await page.clock.install();
      await fastForward(page, 26 * 60 * 1000);
      await expect(readout(page)).toHaveText("00:00");
      await page.locator('label:has(input[value="shortBreak"])').click();
      await expect(readout(page)).toHaveText("05:00");
      await page.reload();
      await expect(startButton(page)).toBeVisible();

      expect(messages, messages.join("\n")).toEqual([]);
    });
  }
});

test.describe("Axe on /, every timer status", () => {
  const serious = async (page: Page) => {
    const results = await new AxeBuilder({ page }).analyze();
    return (results.violations ?? []).filter((v) => v.impact === "critical" || v.impact === "serious");
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(startButton(page)).toBeVisible();
  });

  test("idle", async ({ page }) => {
    expect(await serious(page)).toEqual([]);
  });

  test("running", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test("paused", async ({ page }) => {
    await startButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await pauseButton(page).click();
    await expect(resumeButton(page)).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test("complete", async ({ page }) => {
    await seedTimerState(page, { status: "complete" });
    await page.reload();
    await expect(gauge(page)).toHaveAttribute("data-gauge-level", "0");
    expect(await serious(page)).toEqual([]);
  });
});
