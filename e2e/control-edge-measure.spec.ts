import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP, NARROW, chooseOnSettings, contrastRatio, fmt, makePng, waitActive, type Rect, type Rgb } from "./helpers/background";
import { groundPixels } from "./helpers/surface-sampler";
import { seedTimerState } from "./helpers/timer-hold";

// Task 012 round 3 measurement: criteria 4 (two-tone edge on the four bottom-cluster triggers), 14 (theme
// control focus ring, pulled inside the header; Stats focus ring) and 20 (forced colours edge on the same four
// triggers). Measurement spec only (qa cost rule 4): a token change re-runs this file and nothing else.
//
// Method (qa cost rules 2 and 5): one page load per (image, theme, viewport). Within a load, one screenshot
// with the theme chip focused (the four triggers at rest, plus the chip ring) and one with the Stats link
// focused (its focus ring). Every figure is a painted pixel read through groundPixels from that screenshot.
// Forced colours is one further load per (theme, viewport). Images are the bound the brief names: white,
// black and a flat 50% grey (128,128,128), which is the one the 2-tone argument is weakest against.
//
// Rows are read on the TOP side of each element at its centre column, as in 012 round 2 (outer row only, one
// side, so no neighbour's paint is in the band). Criterion 4's pass is max(border, halo) >= 3 against the
// ground three pixels above the border; the outer halo alone is allowed to be low by design.

type Theme = "light" | "dark";
const IMAGES: Record<string, Rgb> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  "grey 50%": [128, 128, 128],
};
const VIEWPORTS = [
  { name: "1280x800", ...DESKTOP },
  { name: "320x720", ...NARROW },
] as const;
const NO_TRANSITION = "*, *::before, *::after { transition: none !important; }";
const TRIGGERS = [
  // Task 015 re-point: the "Your tasks" dialog trigger is deleted; the panel toggle is the Tasks control.
  { name: "Task list (panel toggle)", selector: 'button[aria-label="Task list"]' },
  { name: "Ambient sound", selector: 'button[aria-label="Ambient sound"]' },
  { name: "Focus stats", selector: 'a[aria-label="Focus stats"]' },
  { name: "Settings", selector: 'a[aria-label="Settings"]' },
] as const;

/** One whole-pixel read per point, from a single screenshot. A point outside the capture throws, never clamps. */
async function pixels(page: Page, points: { name: string; x: number; y: number }[]): Promise<Map<string, Rgb>> {
  const rects: Rect[] = points.map((p) => {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) throw new Error(`${p.name}: point (${p.x},${p.y}) is not whole-pixel`);
    return { x: p.x, y: p.y, w: 1, h: 1 };
  });
  const maps = await groundPixels(page, rects);
  const out = new Map<string, Rgb>();
  points.forEach((p, i) => {
    const m = maps[i];
    if (m.size !== 1) throw new Error(`${p.name}: point (${p.x},${p.y}) is outside the capture or not a single colour`);
    const [k] = [...m.keys()];
    out.set(p.name, k.split(",").map(Number) as Rgb);
  });
  return out;
}

async function boxOf(locator: Locator): Promise<Rect> {
  const b = await locator.boundingBox({ timeout: 5000 });
  if (!b) throw new Error("no bounding box");
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await page.waitForTimeout(60);
}

/** Same scene seeding as focus-surface-sweep.spec.ts setup(): one stored image, one theme, idle focus at cycle 1. */
async function load(page: Page, theme: Theme, viewport: { width: number; height: number }, forced: boolean, withImage: boolean) {
  await page.setViewportSize(viewport);
  await page.goto("/settings");
  const storedBackground = await page.evaluate(() => JSON.parse(window.localStorage.getItem("pomotato-preferences") ?? "{}").state?.background ?? null);
  await page.evaluate(
    ([p]) => {
      const key = "pomotato-preferences";
      const raw = JSON.parse(window.localStorage.getItem(key) ?? '{"state":{},"version":1}');
      window.localStorage.setItem(key, JSON.stringify({ ...raw, state: { ...raw.state, ...p } }));
    },
    [{ theme, gaugeStyle: "vessel", background: withImage ? storedBackground : null }] as const,
  );
  await seedTimerState(page, { mode: "focus", status: "idle", focusMinutes: 25, cyclePosition: 1, endTimestamp: null, startedAt: null, runId: null, pausedRemainingMs: null });
  await page.emulateMedia({ forcedColors: forced ? "active" : "none" });
  await page.goto("/");
  if (withImage && !forced) await waitActive(page);
  await expect(page.locator('[data-gauge-ready="true"]')).toHaveCount(1);
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: NO_TRANSITION });
  await settle(page);
}

interface Row {
  criterion: string;
  theme: Theme;
  image: string;
  viewport: string;
  state: string;
  element: string;
  pixel: string;
  ground: string;
  coords: string;
  ratio: number;
  note?: string;
}
const rows: Row[] = [];
function record(r: Row) {
  rows.push(r);
  console.log(`c${r.criterion} | ${r.theme} | ${r.image} | ${r.viewport} | ${r.state} | ${r.element} | pixel ${r.pixel} @ ${r.coords} | ground ${r.ground} | ${r.ratio.toFixed(3)}:1${r.note ? ` | ${r.note}` : ""}`);
}

/**
 * One page load. Phase A reads the theme chip ring and the header fill at the top of the page. Phase B scrolls the
 * bottom cluster into view (a no-op at 1280 px, where the cluster is fixed; at 320 x 720 it is in flow below the
 * fold, y 768) and reads the four triggers at rest, then the Stats focus ring. Each phase is its own screenshot.
 */
async function measureImageLoad(page: Page, theme: Theme, imageName: string, imageRgb: Rgb, viewport: (typeof VIEWPORTS)[number]) {
  const base = { theme, image: imageName, viewport: viewport.name };
  await load(page, theme, viewport, false, true);
  expect(await page.locator(".control-edge").count(), "four .control-edge triggers").toBe(4);

  // ---- Phase A: theme chip focused, page at the top. ----
  const chipInput = page.locator('input[name="theme"]:checked');
  await chipInput.focus();
  await settle(page);
  const chipSpan = page.locator('fieldset:has(input[name="theme"]) label:has(input[name="theme"]:checked) span');
  const chipBox = await boxOf(chipSpan);
  const chipOutline = await chipSpan.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset), colour: cs.outlineColor };
  });
  const chipFocusVisible = await chipInput.evaluate((el) => el.matches(":focus-visible"));
  expect(chipFocusVisible, `${theme} ${imageName} ${viewport.name}: theme chip is :focus-visible`).toBe(true);
  expect(chipOutline.style, "theme chip has an outline").toBe("solid");

  // Ring: outer edge inset = -(offset + width) from the chip box. Offset 2, width 2 gives an outer edge 4 px outside.
  // Two-tone read (owner ruling 2026-11-06; PLAN "Re-point control-edge-measure to read the halo flank"):
  //   ink     = the outer ring row,
  //   flank   = the 5 px --popover band painted outside the ring (e9380df, .glyph-halo focus box-shadow),
  //   ground  = the photograph one pixel beyond the flank.
  // Criterion 14 passes when max(ink, flank) clears 3:1 against the ground, and the two clear 3:1 against each
  // other (the second half of the rule, which was asserted nowhere before this re-point). The bare ring is allowed
  // to read 1.27:1 over grey by design: the flank carries it.
  // Retired (task 015, owner ruling 2026-11-06): the "chip focus ring lies inside the header border box" assertion.
  // Its premise died with the header panel, and the flank now sits outside the chip by design.
  const chipCx = Math.floor(chipBox.x + chipBox.w / 2);
  // Fully covered pixels only (DECISIONS 2026-10-27: a stroke is measured at its fully-covered pixel, never its
  // antialiasing fringe). ceil() is the first row wholly inside the 2 px ring. The 1 px flank band outside it has a
  // fully covered row ONLY when the box is pixel-aligned, so alignment is asserted, not assumed.
  // Known failure, not a sampling artefact (2026-11-10 diagnosis): at 320 x 720 in dark, the wordmark's .glyph-halo
  // (the H1, painted by its 2 px --popover stroke) sits over the chip's outer ring row and its flank band, so the
  // ring row reads 142,98,50 (a 59% blend with the halo) and the rows beyond it are contaminated too. There is no
  // fully covered ground row to measure against. The assertion stays red and is reported as an app layout finding.
  const chipOuterRow = Math.ceil(chipBox.y - (chipOutline.offset + chipOutline.width));
  expect.soft(Number.isInteger(chipBox.y), `${theme} ${imageName} ${viewport.name}: chip box is pixel-aligned (y ${chipBox.y}), so ring, flank and photograph each have a fully covered row`).toBe(true);

  const chipPx = await pixels(page, [
    { name: "chip ring outer row", x: chipCx, y: chipOuterRow },
    { name: "chip flank (5 px --popover)", x: chipCx, y: chipOuterRow - 1 },
    { name: "chip photograph beyond flank", x: chipCx, y: chipOuterRow - 2 },
  ]);
  const chipRing = chipPx.get("chip ring outer row")!;
  const chipFlank = chipPx.get("chip flank (5 px --popover)")!;
  const chipGround = chipPx.get("chip photograph beyond flank")!;
  expect(chipRing, `${theme} ${imageName} ${viewport.name}: painted chip ring is the computed outline colour`).toEqual(
    (chipOutline.colour.match(/\d+/g) ?? []).slice(0, 3).map(Number),
  );
  const chipInk = contrastRatio(chipRing, chipGround);
  const chipFlankRatio = contrastRatio(chipFlank, chipGround);
  const chipHalf1 = Math.max(chipInk, chipFlankRatio);
  const chipHalf2 = contrastRatio(chipRing, chipFlank);
  record({
    criterion: "14",
    ...base,
    state: "theme chip focus (focus-visible), page at top",
    element: "theme chip focus ring with 5 px flank, two-tone",
    pixel: `ring ${fmt(chipRing)} (computed ${chipOutline.colour}) / flank ${fmt(chipFlank)}`,
    ground: fmt(chipGround),
    coords: `outer ring row ${chipOuterRow}, centre column; chip box top ${Math.round(chipBox.y)}`,
    ratio: chipHalf1,
    note: `half 1 max(ring ${chipInk.toFixed(3)}, flank ${chipFlankRatio.toFixed(3)}) vs photograph; half 2 ring vs flank ${chipHalf2.toFixed(3)}; outline ${chipOutline.width}px, offset ${chipOutline.offset}px`,
  });
  expect.soft(chipHalf1, `criterion 14 ${theme} ${imageName} ${viewport.name}: theme chip max(ring, flank) vs photograph >= 3`).toBeGreaterThanOrEqual(3);
  expect.soft(chipHalf2, `criterion 14 ${theme} ${imageName} ${viewport.name}: theme chip ring vs flank >= 3 (half 2 of the two-tone rule)`).toBeGreaterThanOrEqual(3);

  // ---- Phase B: the bottom cluster in view. ----
  await page.locator(TRIGGERS[0].selector).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(page);
  const triggerBoxes = await Promise.all(TRIGGERS.map((t) => boxOf(page.locator(t.selector))));
  const triggerPoints = TRIGGERS.flatMap((t, i) => {
    const b = triggerBoxes[i];
    const cx = Math.floor(b.x + b.w / 2);
    const top = Math.floor(b.y);
    return [
      { name: `${t.name} border`, x: cx, y: top },
      { name: `${t.name} halo`, x: cx, y: top - 1 },
      { name: `${t.name} ground`, x: cx, y: top - 3 },
    ];
  });
  const restPx = await pixels(page, triggerPoints);
  // Ground under each trigger must be the flat image itself: grain is suppressed while the image shows (tolerance 0).
  for (const t of TRIGGERS) {
    expect(restPx.get(`${t.name} ground`), `${theme} ${imageName} ${viewport.name}: ground under ${t.name} is the flat image`).toEqual(imageRgb);
  }
  // Criterion 4: border row (top edge), halo row (1 px above), ground (3 px above). Integer-aligned boxes only.
  TRIGGERS.forEach((t, i) => {
    const border = restPx.get(`${t.name} border`)!;
    const halo = restPx.get(`${t.name} halo`)!;
    const ground = restPx.get(`${t.name} ground`)!;
    const rBorder = contrastRatio(border, ground);
    const rHalo = contrastRatio(halo, ground);
    const max = Math.max(rBorder, rHalo);
    const aligned = Number.isInteger(triggerBoxes[i].y);
    record({
      criterion: "4",
      ...base,
      state: "rest (cluster in view)",
      element: `${t.name} two-tone edge`,
      pixel: `border ${fmt(border)} / halo ${fmt(halo)}`,
      ground: fmt(ground),
      coords: `top row ${Math.floor(triggerBoxes[i].y)}${aligned ? "" : " (box NOT integer-aligned)"}, centre column`,
      ratio: max,
      note: `border ${rBorder.toFixed(3)} / halo ${rHalo.toFixed(3)} (larger rules); border vs halo ${contrastRatio(border, halo).toFixed(3)}`,
    });
    expect.soft(max, `criterion 4 ${theme} ${imageName} ${viewport.name} ${t.name}: max(border, halo) >= 3`).toBeGreaterThanOrEqual(3);
    // Half 2 of the two-tone rule: the two tones clear 3:1 against each other. Asserted nowhere before this
    // re-point (012 review R-3, logged three times; PLAN "Nothing asserts half 2 of the two-tone rule").
    expect.soft(contrastRatio(border, halo), `criterion 4 ${theme} ${imageName} ${viewport.name} ${t.name}: border vs halo >= 3 (half 2)`).toBeGreaterThanOrEqual(3);
  });

  // ---- Criterion 14, Stats focus: the same two-tone read as the chip. 2 px ring at offset 2, 5 px --popover flank. ----
  const statsLink = page.locator('a[aria-label="Focus stats"]');
  await statsLink.focus();
  await settle(page);
  const statsBox = await boxOf(statsLink);
  const statsVisible = await statsLink.evaluate((el) => el.matches(":focus-visible"));
  const statsOutline = await statsLink.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset), colour: cs.outlineColor };
  });
  // Same fully-covered-pixel rule as the chip above (ceil to the first row wholly inside the ring).
  const statsOuter = Math.ceil(statsBox.y - (statsOutline.offset + statsOutline.width));
  expect.soft(Number.isInteger(statsBox.y), `${theme} ${imageName} ${viewport.name}: Stats box is pixel-aligned (y ${statsBox.y})`).toBe(true);
  const statsCx = Math.floor(statsBox.x + statsBox.w / 2);
  const statsPx = await pixels(page, [
    { name: "stats ring outer row", x: statsCx, y: statsOuter },
    { name: "stats flank (5 px --popover)", x: statsCx, y: statsOuter - 1 },
    { name: "stats photograph beyond flank", x: statsCx, y: statsOuter - 2 },
  ]);
  const statsRing = statsPx.get("stats ring outer row")!;
  const statsFlank = statsPx.get("stats flank (5 px --popover)")!;
  const statsGround = statsPx.get("stats photograph beyond flank")!;
  const statsInk = contrastRatio(statsRing, statsGround);
  const statsFlankRatio = contrastRatio(statsFlank, statsGround);
  const statsHalf1 = Math.max(statsInk, statsFlankRatio);
  const statsHalf2 = contrastRatio(statsRing, statsFlank);
  record({
    criterion: "14",
    ...base,
    state: `Stats focus (${statsVisible ? "focus-visible" : "NOT focus-visible"})`,
    element: "Stats focus ring with 5 px flank, two-tone",
    pixel: `ring ${fmt(statsRing)} (computed ${statsOutline.colour}) / flank ${fmt(statsFlank)}`,
    ground: fmt(statsGround),
    coords: `outer ring row ${statsOuter}, centre column`,
    ratio: statsHalf1,
    note: `half 1 max(ring ${statsInk.toFixed(3)}, flank ${statsFlankRatio.toFixed(3)}) vs photograph; half 2 ring vs flank ${statsHalf2.toFixed(3)}; outline ${statsOutline.width}px, offset ${statsOutline.offset}px`,
  });
  expect.soft(statsHalf1, `criterion 14 ${theme} ${imageName} ${viewport.name}: Stats max(ring, flank) vs photograph >= 3`).toBeGreaterThanOrEqual(3);
  expect.soft(statsHalf2, `criterion 14 ${theme} ${imageName} ${viewport.name}: Stats ring vs flank >= 3 (half 2 of the two-tone rule)`).toBeGreaterThanOrEqual(3);
}

test.describe("task 012 round 3: criteria 4 and 14 on the photograph (one load per image, theme and viewport)", () => {
  test.setTimeout(600_000);
  for (const [imageName, imageRgb] of Object.entries(IMAGES)) {
    test(`image ${imageName}: triggers' two-tone edges and both focus rings`, async ({ page }) => {
      const flat = makePng(DESKTOP.width, DESKTOP.height, () => imageRgb);
      await page.setViewportSize(DESKTOP);
      await chooseOnSettings(page, flat, `r3-${imageName.replace(/[^a-z0-9]+/gi, "-")}.png`);
      for (const theme of ["light", "dark"] as Theme[]) {
        for (const viewport of VIEWPORTS) {
          await measureImageLoad(page, theme, imageName, imageRgb, viewport);
        }
      }
    });
  }
});

test.describe("task 012 round 3: criterion 20 forced colours (one load per theme and viewport)", () => {
  test.setTimeout(300_000);
  test("forced colours: each of the four triggers keeps a visible system-colour edge over Canvas", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await chooseOnSettings(page, makePng(DESKTOP.width, DESKTOP.height, () => [255, 255, 255]), "r3-forced-white.png");
    for (const theme of ["light", "dark"] as Theme[]) {
      for (const viewport of VIEWPORTS) {
        const base = { theme, image: "white (image hidden under forced)", viewport: viewport.name };
        await load(page, theme, viewport, true, true);
        const canvasHex = await page.evaluate(() => {
          const probe = document.createElement("div");
          probe.style.color = "Canvas";
          document.body.appendChild(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        });
        await page.locator(TRIGGERS[0].selector).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await settle(page);
        const boxes = await Promise.all(TRIGGERS.map((t) => boxOf(page.locator(t.selector))));
        const points = TRIGGERS.flatMap((t, i) => {
          const b = boxes[i];
          const cx = Math.floor(b.x + b.w / 2);
          const top = Math.floor(b.y);
          return [
            { name: `${t.name} border`, x: cx, y: top },
            { name: `${t.name} ground`, x: cx, y: top - 3 },
          ];
        });
        const px = await pixels(page, points);
        const borderCss = await Promise.all(
          TRIGGERS.map((t) => page.locator(t.selector).evaluate((el) => getComputedStyle(el).borderTopColor + " / " + getComputedStyle(el).borderTopWidth + " " + getComputedStyle(el).borderTopStyle)),
        );
        TRIGGERS.forEach((t, i) => {
          const border = px.get(`${t.name} border`)!;
          const ground = px.get(`${t.name} ground`)!;
          const ratio = contrastRatio(border, ground);
          record({
            criterion: "20",
            ...base,
            state: "forced colours active",
            element: `${t.name} edge`,
            pixel: fmt(border),
            ground: fmt(ground),
            coords: `top row ${Math.floor(boxes[i].y)}, centre column`,
            ratio,
            note: `computed border ${borderCss[i]}; Canvas probe ${canvasHex}`,
          });
          expect.soft(ratio, `criterion 20 ${theme} ${viewport.name} ${t.name} edge under forced colours >= 3`).toBeGreaterThanOrEqual(3);
        });
      }
    }
  });
});

test.afterAll(() => {
  const worst = rows.reduce((m, r) => Math.min(m, r.ratio), Infinity);
  console.log(`control-edge-measure: ${rows.length} rows, lowest ${worst.toFixed(3)}:1`);
});
