import { expect, test, type Locator, type Page } from "@playwright/test";
import { makePng, chooseOnSettings, contrastRatio } from "./helpers/background";
import { captureOnce, findExact, liquidTopPercent, pixelsFrom, type Box } from "./helpers/gauge-sampler";
import { tokenRgb, type Rgb } from "./helpers/painted";

// Task 022 measurement group, criteria 41-46. Run on its own so a token change
// re-runs only this file. Each scenario takes ONE screenshot and reads every
// figure from it. The preview sample is 60% remaining (PREVIEW_PROGRESS), and the
// live timer is paused at 15:00 of a 25:00 Focus, which is the same 60%.

const PREFS_KEY = "pomotato-preferences";
const SAMPLE_LEVEL = 60;
const LEVEL_TOP = 100 - SAMPLE_LEVEL;

type Style = "vessel" | "glyph";
const layerOn = (page: Page) => page.getByTestId("timer-gauge");
const previewLayer = (page: Page, style: Style) => page.locator(`[data-testid="gauge-preview-${style}"][data-gauge-style="${style}"]`);
const optionLabel = (page: Page, name: string) => page.locator("label").filter({ has: page.getByRole("radio", { name, exact: true }) });
const startBtn = (page: Page) => page.getByRole("button", { name: "Start", exact: true });
const pauseBtn = (page: Page) => page.getByRole("button", { name: "Pause", exact: true });
const resumeBtn = (page: Page) => page.getByRole("button", { name: "Resume", exact: true });

/** Seeds the style and the gauge on, then pauses the timer at 15:00 (60% of a 25:00 Focus). */
async function pausedAt60(page: Page, style: Style) {
  await page.goto("/");
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [PREFS_KEY, JSON.stringify({ state: { gaugeEnabled: true, gaugeStyle: style }, version: 4 })] as const);
  await page.reload();
  await expect(startBtn(page)).toBeVisible();
  await startBtn(page).click();
  await page.clock.fastForward(10 * 60_000);
  await pauseBtn(page).click();
  await expect(resumeBtn(page)).toBeVisible();
  await expect(layerOn(page)).toHaveAttribute("data-gauge-level", String(SAMPLE_LEVEL));
  await expect.poll(() => liquidTopPercent(layerOn(page)), { timeout: 5_000 }).toBeCloseTo(LEVEL_TOP, 0);
}

const boxOf = async (loc: Locator): Promise<Box> => {
  const b = await loc.boundingBox();
  if (!b) throw new Error("no rendered rect");
  return b;
};

/** Vessel: the liquid fill fully covers the point 75% down; the glass above the surface is the ground behind it. */
async function vesselFigures(page: Page, layer: Locator, b64: string, label: string) {
  await layer.scrollIntoViewIfNeeded();
  const box = await boxOf(layer);
  const frame = { x: box.x, y: box.y, width: box.width, height: box.height };
  const px = frame.x + frame.width * 0.08; // left margin, clear of the centred digits
  const fillPt: [number, number] = [px, frame.y + frame.height * 0.75];
  const groundPt: [number, number] = [px, frame.y + frame.height * 0.1];
  const pagePt: [number, number] = [frame.x - 12, frame.y + frame.height / 2];
  const [fill, ground, page2] = await pixelsFrom(page, b64, [fillPt, groundPt, pagePt]);
  const liquid = await tokenRgb(page, "--gauge-liquid");
  const glass = await tokenRgb(page, "--popover");
  const top = await liquidTopPercent(layer);
  const row = { label, figure: "vessel fill vs glass ground", fill, liquid, ground, glass, page: page2, topPercent: top, ratio: contrastRatio(fill, ground) };
  console.log("MEASURE", JSON.stringify(row));
  return row;
}

/** Glyph: an exact pixel of each digit tone, read against the page ground just outside the digits. */
async function glyphFigures(page: Page, layer: Locator, b64: string, label: string) {
  await layer.scrollIntoViewIfNeeded();
  const frame = layer.locator("xpath=..");
  const digits = await boxOf(frame.locator("p"));
  const accent = await tokenRgb(page, "--accent-foreground");
  const muted = await tokenRgb(page, "--muted-foreground");
  const groundPt: [number, number] = [digits.x - 12, digits.y + digits.height / 2];
  const [ground] = await pixelsFrom(page, b64, [groundPt]);
  const rows = [];
  for (const [tone, rgb] of [["accent", accent], ["muted", muted]] as const) {
    const hit = await findExact(page, b64, digits, rgb);
    if (!hit) {
      rows.push({ label, figure: `glyph ${tone} tone`, found: false });
      continue;
    }
    const [fill] = await pixelsFrom(page, b64, [hit]);
    const row = { label, figure: `glyph ${tone} tone`, found: true, at: hit, fill, tokenRgb: rgb, ground, ratio: contrastRatio(fill, ground) };
    console.log("MEASURE", JSON.stringify(row));
    rows.push(row);
  }
  return rows;
}

/** The lightest/darkest-leaning grey upload whose composited ground (half opacity over --background) lands nearest the gauge's luminance. */
function derivedUploadGrey(target: Rgb, background: Rgb): number {
  const lum = (c: Rgb) => {
    const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const targetY = lum(target);
  let best = { u: 0, gap: Infinity };
  for (let u = 0; u <= 255; u++) {
    const composite: Rgb = [0, 1, 2].map((i) => 0.5 * u + 0.5 * background[i]) as Rgb;
    const gap = Math.abs(lum(composite) - targetY);
    if (gap < best.gap) best = { u, gap };
  }
  return best.u;
}

test.describe("criterion 41, 42: contrast of the live gauge and of each preview card", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test("criterion 41 vessel: live gauge at 60% on / with no upload, fully covered liquid against the glass behind it", async ({ page }) => {
    await pausedAt60(page, "vessel");
    const row = await vesselFigures(page, layerOn(page), await captureOnce(page), "live / vessel, no upload");
    expect(row.ratio, "ratio vs glass behind the liquid").toBeGreaterThanOrEqual(3);
  });

  test("criterion 41 glyph: live gauge at 60% on / with no upload, digits' tones against the page ground", async ({ page }) => {
    await pausedAt60(page, "glyph");
    const rows = await glyphFigures(page, layerOn(page), await captureOnce(page), "live / glyph, no upload");
    const found = rows.filter((r): r is typeof r & { ratio: number } => "ratio" in r);
    expect(found.length, "both tones found as exact painted pixels").toBe(2);
    for (const r of found) expect(r.ratio, `${r.figure} ratio`).toBeGreaterThanOrEqual(3);
  });

  test("criterion 42: both preview cards on /settings, one screenshot, each against its own card ground", async ({ page }) => {
    await pausedAt60(page, "vessel");
    await page.goto("/settings");
    await expect(optionLabel(page, "Vessel")).toBeVisible();
    await optionLabel(page, "Vessel").scrollIntoViewIfNeeded();
    await previewLayer(page, "glyph").scrollIntoViewIfNeeded();
    await previewLayer(page, "vessel").scrollIntoViewIfNeeded();
    const b64 = await captureOnce(page);
    const vessel = await vesselFigures(page, previewLayer(page, "vessel"), b64, "settings preview / vessel");
    expect(vessel.ratio).toBeGreaterThanOrEqual(3);
    const glyph = await glyphFigures(page, previewLayer(page, "glyph"), b64, "settings preview / glyph");
    for (const r of glyph) if ("ratio" in r) expect(r.ratio, `${r.figure} ratio`).toBeGreaterThanOrEqual(3);
  });
});

test.describe("criterion 43, 44: worst case over an uploaded background, derived not swept", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  for (const style of ["vessel", "glyph"] as const) {
    test(`criterion 43 ${style}: derived flat upload is the worst of derived, white and black`, async ({ page }) => {
      await pausedAt60(page, style);
      await page.goto("/settings");
      const bg = await tokenRgb(page, "--background");
      const gaugeColour = await tokenRgb(page, style === "vessel" ? "--gauge-liquid" : "--accent-foreground");
      const grey = derivedUploadGrey(gaugeColour, bg);
      const uploads: [string, number][] = [
        ["derived", grey],
        ["flat white", 255],
        ["flat black", 0],
      ];
      const results: { upload: string; grey: number; ratio: number }[] = [];
      for (const [name, value] of uploads) {
        await chooseOnSettings(page, makePng(800, 500, () => [value, value, value]), `task-022-${style}-${name.replace(" ", "-")}.png`);
        await page.goto("/");
        // The background paints at half opacity (DECISIONS 2026-11-12), so wait for the layer, not for opacity 1.
        await expect(page.locator('[data-background="active"]')).toHaveCount(1);
        await page.waitForTimeout(600);
        await expect(layerOn(page)).toHaveAttribute("data-gauge-level", String(SAMPLE_LEVEL));
        await expect.poll(() => liquidTopPercent(layerOn(page)), { timeout: 5_000 }).toBeCloseTo(LEVEL_TOP, 0);
        const b64 = await captureOnce(page);
        if (style === "vessel") {
          const row = await vesselFigures(page, layerOn(page), b64, `live / vessel, ${name} upload (grey ${value})`);
          results.push({ upload: name, grey: value, ratio: row.ratio });
        } else {
          const rows = await glyphFigures(page, layerOn(page), b64, `live / glyph, ${name} upload (grey ${value})`);
          const accent = rows.find((r) => "ratio" in r && r.figure === "glyph accent tone");
          results.push({ upload: name, grey: value, ratio: accent && "ratio" in accent ? accent.ratio : NaN });
        }
      }
      console.log("MEASURE-43", JSON.stringify({ style, gaugeColour, background: bg, derivedGrey: grey, results }));
      const [derived, white, black] = results;
      expect(derived.ratio, "the derived case is measured").toBeGreaterThan(0);
      expect(derived.ratio, "derived is no higher than white").toBeLessThanOrEqual(white.ratio + 1e-9);
      expect(derived.ratio, "derived is no higher than black").toBeLessThanOrEqual(black.ratio + 1e-9);
      if (style === "vessel") {
        // Criterion 43 gates on vessel only (owner ruling 7, 2026-11-19; criterion 44 discharged).
        expect(derived.ratio, "criterion 43 vessel: derived worst case at or above 3:1").toBeGreaterThanOrEqual(3);
      } else {
        // Glyph is recorded, not gated: the glyph tones are the timer's own digits, with no ground over
        // bright uploads since the frosted panel was retired. Deferred to task 020 (owner ruling 7).
        // The figure stays in the MEASURE-43 output above and is the evidence 020 starts from.
        test.info().annotations.push({
          type: "recorded",
          description: `glyph derived worst case ${derived.ratio.toFixed(2)}:1, deferred to task 020 (ruling 7); not a 022 gate`,
        });
      }
    });
  }
});

test.describe("criterion 45, 46: the settings grid at 390 px and at 1024 px and above", () => {
  test("criterion 45: at 390 px the grid is one or two columns, cards are equal size, and nothing scrolls horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.evaluate((k) => window.localStorage.setItem(k, JSON.stringify({ state: { gaugeEnabled: false, gaugeStyle: "glyph" }, version: 4 })), "pomotato-preferences");
    await page.goto("/settings");
    await expect(optionLabel(page, "Vessel")).toBeVisible();
    const grid = optionLabel(page, "Vessel").locator("xpath=..");
    const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect([1, 2]).toContain(columns);
    const a = await boxOf(optionLabel(page, "Vessel"));
    const b = await boxOf(optionLabel(page, "In the digits"));
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(0.5);
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth);
    expect(overflow).toBe(0);
    for (const box of [a, b, await boxOf(page.getByRole("switch", { name: "Show timer gauge" }).locator("xpath=.."))]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await expect(page.getByText("Turn on the gauge to choose a style.")).toBeVisible();
  });

  test("criterion 46: at 1280 px the grid is exactly two columns and the two cards have identical rendered rects", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/settings");
    await expect(optionLabel(page, "Vessel")).toBeVisible();
    const grid = optionLabel(page, "Vessel").locator("xpath=..");
    const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
    expect(columns).toBe(2);
    const a = await boxOf(optionLabel(page, "Vessel"));
    const b = await boxOf(optionLabel(page, "In the digits"));
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(0.5);
  });
});
