import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { DESKTOP, NARROW, chooseOnSettings, makePng, mergeColours, waitActive, worstAgainst, contrastRatio, type Rect, type Rgb } from "./helpers/background";
import { clipToSurface, groundPixels } from "./helpers/surface-sampler";
import { compositeOver } from "./helpers/painted";
import { seedTimerState } from "./helpers/timer-hold";

// Task 012 round 2 and task 013 round 2: the ONE measurement spec (CLAUDE.md "Measurement ordering",
// qa cost rules 2-4). It samples through groundPixels only. Every figure is a painted pixel from one
// capture, named with its theme, image, viewport and state, so the table in the task files can say
// where each number came from.
//
// Images are bounded (rule 3): white and black bound the range, split defeats a mean. Flat (no image)
// is the solid-surface measurement (012 criterion 15). Blur-off, reduced-transparency, forced colours
// and greyscale are re-runs of the same captures under one changed condition each.
//
// Scratch-only by intent: it writes readings to QA_SWEEP_OUT (default in the QA scratchpad) and the
// task files' tables are assembled from that JSON by hand, so a figure is never typed from memory.

type Theme = "light" | "dark";
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const IMAGES: Record<string, () => Buffer> = {
  white: () => makePng(DESKTOP.width, DESKTOP.height, () => WHITE),
  black: () => makePng(DESKTOP.width, DESKTOP.height, () => BLACK),
  split: () => makePng(DESKTOP.width, DESKTOP.height, (x) => (x < DESKTOP.width / 2 ? WHITE : BLACK)),
};
const VIEWPORTS = [
  { name: "1280x800", ...DESKTOP },
  { name: "320x720", ...NARROW },
] as const;
// Each worker writes its own part file (tests run in parallel, so one shared file would keep only the last
// worker's readings). The parts are merged by hand from the scratchpad: see the round-2 QA Report.
const OUT_DIR = process.env.QA_SWEEP_OUT ?? "/private/tmp/claude-501/-Users-ramwelltupas-pomotato/52379638-e509-40b8-ac59-80f4452e8fbf/scratchpad/sweep-parts";
const HIDE_TEXT = "*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }";
const BLUR_OFF = '[data-surface="frosted"] { backdrop-filter: none !important; }';
const GREY = "html { filter: grayscale(1) !important; }";
const NO_TRANSITION = "*, *::before, *::after { transition: none !important; }";
const FULL_MS = 25 * 60 * 1000;
const n_ok = (n: number, total: number) => n / total >= 0.02;

interface Reading {
  criterion: string;
  theme: Theme | "n/a";
  image: string;
  viewport: string;
  state: string;
  element: string;
  ink: string;
  pixel: string;
  ground: string;
  coords: string;
  ratio: number;
  floor: number | null;
  note?: string;
}
const readings: Reading[] = [];
const fmt = (c: Rgb) => `${c[0]},${c[1]},${c[2]}`;
const pxOf = (m: Map<string, number>) => {
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  return top[0].split(",").map(Number) as Rgb;
};

/**
 * Known findings, recorded as test.fail blocks below so the suite stays green while each stays visible: the
 * 1 px border findings (012 criterion 17, asserted in its own block). Criteria 14 (theme focus ring) and 20
 * (forced-colour trigger edges) were healed in 012 round 3 and are real assertions now, so they no longer
 * appear here.
 */
const KNOWN = [
  (r: Reading) => r.criterion === "012-c17",
];
function assertFloors(from: number) {
  for (const r of readings.slice(from)) {
    if (r.floor === null || KNOWN.some((k) => k(r))) continue;
    expect.soft(r.ratio, `${r.criterion} | ${r.element} | ${r.theme} | ${r.image} | ${r.viewport} | ${r.state}`).toBeGreaterThanOrEqual(r.floor);
  }
}

function record(r: Reading) {
  readings.push(r);
  const pass = r.floor === null ? "-" : r.ratio >= r.floor ? "PASS" : "FAIL";
  console.log(`${pass} c${r.criterion} | ${r.theme} | ${r.image} | ${r.viewport} | ${r.state} | ${r.element} | ink ${r.ink} | pixel ${r.pixel} @ ${r.coords} | ground ${r.ground} | ${r.ratio.toFixed(3)}:1${r.floor === null ? "" : ` vs ${r.floor}`}${r.note ? ` | ${r.note}` : ""}`);
}

test.afterAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/part-${process.pid}.json`, JSON.stringify(readings, null, 2));
});

// ---------------------------------------------------------------------------------------------
// Geometry and locators
// ---------------------------------------------------------------------------------------------

async function boxOf(locator: Locator): Promise<Rect> {
  const b = await locator.boundingBox({ timeout: 5000 });
  if (!b) throw new Error("no bounding box");
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
/** The whole-pixel rect that covers a box: floor the origin, ceil the far edge. */
function whole(r: Rect): Rect {
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
}
function centre(r: Rect): Rect {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2), w: 1, h: 1 };
}
/** A dot's paint pixels: the centre (a fill's colour) and one row below the top edge (a ring's 2 px stroke). */
function dotPaint(r: Rect): Rect {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2), w: 1, h: 1 };
}
function dotStroke(r: Rect): Rect {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y) + 1, w: 1, h: 1 };
}
/**
 * Waits for every finite CSS transition and animation to finish. A colour transition that is still running
 * reads as a blend with transparent (the chips read 0.3 x their colour mid-fade), so no figure is taken before this.
 */
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
function inset(r: Rect, d: number): Rect {
  return { x: Math.floor(r.x + d), y: Math.floor(r.y + d), w: 1, h: 1 };
}
function ringOf(r: Rect, pad: number): Rect[] {
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  const w = Math.ceil(r.x + r.w) - x;
  const h = Math.ceil(r.y + r.h) - y;
  return [
    { x: x - pad, y: y - pad, w: w + 2 * pad, h: pad },
    { x: x - pad, y: y + h, w: w + 2 * pad, h: pad },
    { x: x - pad, y, w: pad, h },
    { x: x + w, y, w: pad, h },
  ];
}

/** Collects rects under names so each figure reads its own slice of one groundPixels call. */
class Plan {
  private rects: Rect[] = [];
  private index: Record<string, number[]> = {};
  add(name: string, rs: Rect[]) {
    this.index[name] = rs.map((r) => this.rects.push(r) - 1);
  }
  async sample(page: Page, hide = true): Promise<(name: string) => Map<string, number>> {
    if (hide) await page.addStyleTag({ content: HIDE_TEXT });
    let maps: Map<string, number>[];
    try {
      maps = await groundPixels(page, this.rects);
    } finally {
      if (hide)
        await page.evaluate(() =>
          document.querySelectorAll("style").forEach((s) => {
            if (s.textContent?.includes("-webkit-text-fill-color: transparent !important")) s.remove();
          }),
        );
    }
    // groundPixels clamps an off-screen origin silently, so an empty read is a rect outside the capture.
    for (const [name, idxs] of Object.entries(this.index)) {
      for (const i of idxs) {
        if (maps[i].size === 0) throw new Error(`${name}: rect ${JSON.stringify(this.rects[i])} is outside the capture; scroll it into view or drop it`);
      }
    }
    return (name) => {
      if (!this.index[name]) throw new Error(`sample: no rect named ${name} was planned`);
      return mergeColours(this.index[name].map((i) => maps[i]));
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------------------------

interface Setup {
  theme: Theme;
  image: string | null;
  viewport: { width: number; height: number };
  gaugeStyle?: "vessel" | "glyph";
  timer?: Parameters<typeof seedTimerState>[1];
  blurOff?: boolean;
  reducedTransparency?: boolean;
  forced?: boolean;
  grey?: boolean;
}

async function applyMedia(page: Page, o: Setup) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: o.reducedTransparency ? "reduce" : "no-preference" }],
  });
  await page.emulateMedia({ forcedColors: o.forced ? "active" : "none" });
}

async function setup(page: Page, o: Setup) {
  await page.setViewportSize(o.viewport);
  await page.goto("/settings");
  // The stored background id is read back from prefs, so the image set by chooseOnSettings is the one used.
  const storedBackground = await page.evaluate(() => JSON.parse(window.localStorage.getItem("pomotato-preferences") ?? "{}").state?.background ?? null);
  await page.evaluate(
    ([p]) => {
      const key = "pomotato-preferences";
      const raw = JSON.parse(window.localStorage.getItem(key) ?? '{"state":{},"version":1}');
      window.localStorage.setItem(key, JSON.stringify({ ...raw, state: { ...raw.state, ...p } }));
    },
    [{ theme: o.theme, gaugeStyle: o.gaugeStyle ?? "vessel", background: o.image ? storedBackground : null }] as const,
  );
  await seedTimerState(page, o.timer ?? { mode: "focus", status: "idle", focusMinutes: 25, cyclePosition: 1, endTimestamp: null, startedAt: null, runId: null, pausedRemainingMs: null });
  await applyMedia(page, o);
  await page.goto("/");
  if (o.image) await waitActive(page);
  await expect(page.locator('[data-gauge-ready="true"]')).toHaveCount(1);
  await page.waitForTimeout(800);
  // Measurement pages carry no transitions: a colour transition still running at read time gave the chips
  // alpha values of 0.31 to 0.60 between captures of the same state. transition:none jumps each computed
  // colour to its final value, so every read is the settled paint.
  await page.addStyleTag({ content: NO_TRANSITION });
  await settle(page);
  if (o.blurOff) await page.addStyleTag({ content: BLUR_OFF });
  if (o.grey) await page.addStyleTag({ content: GREY });
}

/** Elements every capture needs. Read once per capture so no figure reads a stale box. */
async function layout(page: Page) {
  const frosted = await boxOf(page.locator('[data-surface="frosted"]'));
  const solid = await boxOf(page.locator('[data-surface="solid"]').first());
  const readoutEl = page.locator("p.tabular-nums").first();
  const start = page.getByRole("button", { name: "Start", exact: true });
  const reset = page.getByRole("button", { name: "Reset", exact: true });
  // RETIRED (task 017 criterion 70): the duration field left / (criterion 2). Its ring is measured on /settings instead.
  const h1 = page.locator("main h1").first();
  const chipFocus = page.locator('fieldset label:has(input[value="focus"]) span');
  const chipShort = page.locator('fieldset label:has(input[value="shortBreak"]) span');
  const title = page.locator('[data-surface="frosted"] p').first();
  const themeChecked = page.locator('fieldset:has(input[name="theme"]) label:has(input[name="theme"]:checked) span');
  const cluster = page.locator('a[href="/settings"]').locator("xpath=../..");
  const triggers = cluster.locator("button, a");
  const dots = page.locator("[data-treatment]");
  const boxes = {
    frosted,
    solid,
    readout: await boxOf(readoutEl),
    start: await boxOf(start),
    reset: await boxOf(reset),
    input: { x: 0, y: 0, w: 0, h: 0 },
    h1: await boxOf(h1),
    chipFocus: await boxOf(chipFocus),
    chipShort: await boxOf(chipShort),
    title: await boxOf(title),
    themeChecked: await boxOf(themeChecked),
    triggers: await Promise.all([0, 1, 2, 3].map((i) => boxOf(triggers.nth(i)))),
    dots: await Promise.all([0, 1, 2, 3].map((i) => boxOf(dots.nth(i)))),
  };
  return { boxes, readoutEl, start, reset, h1, chipFocus, chipShort, title, themeChecked, triggers, dots };
}

async function inkOf(page: Page, locator: Locator): Promise<string> {
  const raw = await locator.evaluate((el) => getComputedStyle(el).color);
  return raw;
}
async function toRgb(page: Page, css: string): Promise<Rgb> {
  return compositeOver(page, css, "#000000");
}
/** A computed colour as rgb plus alpha. Non-rgb colours (oklab) are resolved over black and taken as opaque. */
async function inkRgba(page: Page, css: string): Promise<{ rgb: Rgb; a: number }> {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { rgb: [parts[0], parts[1], parts[2]], a: parts.length === 4 ? parts[3] : 1 };
  }
  return { rgb: await toRgb(page, css), a: 1 };
}
/** The worst contrast of a text colour, blended over each ground pixel it can sit on (alpha-aware). */
function worstText(ground: Map<string, number>, ink: { rgb: Rgb; a: number }): { ratio: number; ground: Rgb; ink: Rgb } {
  let worst = { ratio: Number.POSITIVE_INFINITY, ground: [0, 0, 0] as Rgb, ink: [0, 0, 0] as Rgb };
  for (const key of ground.keys()) {
    const g = key.split(",").map(Number) as Rgb;
    const blended = g.map((c, i) => ink.a * ink.rgb[i] + (1 - ink.a) * c) as Rgb;
    const r = contrastRatio(blended, g);
    if (r < worst.ratio) worst = { ratio: r, ground: g, ink: blended };
  }
  return worst;
}

// ---------------------------------------------------------------------------------------------
// Capture A: the base ground set. One capture per (image, theme, viewport), text hidden.
// ---------------------------------------------------------------------------------------------

async function captureBase(page: Page, theme: Theme, image: string, viewport: { name: string; width: number; height: number }, tag: { crit: string; state: string; reduced?: boolean; blurOff?: boolean }) {
  const L = await layout(page);
  const { boxes } = L;
  const plan = new Plan();
  plan.add("frostedInterior", [inset(boxes.frosted, 12)]);
  plan.add("solidCentre", [centre(boxes.solid)]);
  plan.add("corner", [{ x: 2, y: 2, w: 1, h: 1 }]);
  plan.add("readout", [whole(boxes.readout)]);
  plan.add("start", [whole(boxes.start)]);
  plan.add("startFlat", [{ x: Math.floor(boxes.start.x) + 8, y: Math.floor(boxes.start.y) + 8, w: Math.ceil(boxes.start.w) - 16, h: Math.ceil(boxes.start.h) - 16 }]);
  plan.add("resetStroke", [{ x: Math.floor(boxes.reset.x) + 4, y: Math.floor(boxes.reset.y), w: Math.ceil(boxes.reset.w) - 8, h: 1 }]);
  plan.add("resetRing", ringOf(boxes.reset, 3));
  // (inputStroke and inputRing were the duration field on /; retired with it, task 017.)
  // (inputRing: retired with the duration field, task 017.)
  // Clipped to the solid header's padding box: the theme control's 44 px hit box can overhang the header at
  // 320 px, and a text box that crosses the surface edge reads the photograph (round 1 ruling, 012 criterion 15).
  const solidPad = { x: boxes.solid.x + 1, y: boxes.solid.y + 1, w: boxes.solid.w - 2, h: boxes.solid.h - 2 };
  plan.add("wordmark", clipToSurface([whole(boxes.h1)], solidPad, "wordmark"));
  // The label's 44 px box reaches the header's rounded bottom corners at 320 px (the photograph shows through
  // the corner). The glyph band is inset 10 px top and bottom, which clears the corner and holds the text.
  const t = boxes.themeChecked;
  const themeBand = { x: t.x + 2, y: t.y + 10, w: t.w - 4, h: t.h - 20 };
  plan.add("themeChecked", clipToSurface([whole(themeBand)], solidPad, "theme control"));
  plan.add("chipFocus", [whole(boxes.chipFocus)]);
  plan.add("chipShort", [whole(boxes.chipShort)]);
  plan.add("title", [whole(boxes.title)]);
  boxes.dots.forEach((d, i) => {
    plan.add(`dot${i}`, [dotPaint(d)]);
    plan.add(`dot${i}Stroke`, [dotStroke(d)]);
    plan.add(`dot${i}Ring`, ringOf(d, 6));
  });
  const px = await plan.sample(page);

  const A = { theme, image, viewport: viewport.name, state: tag.state };
  const cond = tag.reduced ? "reduced-transparency" : tag.blurOff ? "blur off" : "default";
  const stateLabel = `${tag.state} (${cond})`;

  // 012 criterion 3: the exposed ground is the image's own value (255 under white, 0 under black).
  record({ criterion: "012-c3", ...A, state: stateLabel, element: "exposed ground (2,2)", ink: "n/a", pixel: fmt(pxOf(px("corner"))), ground: fmt(pxOf(px("corner"))), coords: "2,2", ratio: 1, floor: null });

  // 012 criterion 9 inputs: frosted interior and solid centre, to diff across images.
  record({ criterion: "012-c9", ...A, state: stateLabel, element: "frosted interior (12 px in)", ink: "n/a", pixel: fmt(pxOf(px("frostedInterior"))), ground: fmt(pxOf(px("frostedInterior"))), coords: `${Math.round(boxes.frosted.x + 12)},${Math.round(boxes.frosted.y + 12)}`, ratio: 1, floor: null });
  record({ criterion: "012-c9", ...A, state: stateLabel, element: "solid header centre", ink: "n/a", pixel: fmt(pxOf(px("solidCentre"))), ground: fmt(pxOf(px("solidCentre"))), coords: `${Math.floor(boxes.solid.x + boxes.solid.w / 2)},${Math.floor(boxes.solid.y + boxes.solid.h / 2)}`, ratio: 1, floor: null });

  // Text floors (012 criterion 14 and 15; 016 gauge at 100 is the same readout).
  const textRows: { crit: string; element: string; loc: Locator; name: string; box: Rect; floor: number; note?: string }[] = [
    { crit: "012-c14", element: "mm:ss readout (vessel/glyph as set)", loc: L.readoutEl, name: "readout", box: boxes.readout, floor: 4.5 },
    { crit: "012-c14", element: "current-task title", loc: L.title, name: "title", box: boxes.title, floor: 4.5 },
    { crit: "012-c14", element: "mode chip Focus (checked, #78350f)", loc: L.chipFocus, name: "chipFocus", box: boxes.chipFocus, floor: 4.5 },
    { crit: "012-c14", element: "mode chip Short break (unchecked, #44403c)", loc: L.chipShort, name: "chipShort", box: boxes.chipShort, floor: 4.5 },
    { crit: "012-c15", element: "wordmark --primary (large text)", loc: L.h1, name: "wordmark", box: boxes.h1, floor: 3, note: "solid header, flat" },
    { crit: "012-c15", element: "theme control, checked (solid header)", loc: L.themeChecked, name: "themeChecked", box: boxes.themeChecked, floor: 4.5, note: "solid header, flat" },
  ];
  for (const row of textRows) {
    const raw = await inkOf(page, row.loc);
    const ink = await inkRgba(page, raw);
    const worst = worstText(px(row.name), ink);
    record({ criterion: row.crit, ...A, state: stateLabel, element: row.element, ink: `${fmt(ink.rgb)} a${ink.a}`, pixel: fmt(worst.ground), ground: fmt(worst.ground), coords: `box ${whole(row.box).x},${whole(row.box).y} ${whole(row.box).w}x${whole(row.box).h}`, ratio: worst.ratio, floor: row.floor, note: `${row.note ?? ""} raw ${raw}`.trim() });
  }

  // Start: primary-foreground on its own fill. The fill is the opaque --primary, so the reference is the
  // computed fill (alpha checked) and the painted pixel is the sample of the same rect.
  const startRaw = await inkOf(page, L.start);
  const startInk = await inkRgba(page, startRaw);
  const startFillCss = await L.start.evaluate((el) => getComputedStyle(el).backgroundColor);
  const startFill = await toRgb(page, startFillCss);
  const startAlpha = await inkRgba(page, startFillCss);
  const startPainted = worstText(px("startFlat"), startInk);
  record({ criterion: "012-c14", ...A, state: stateLabel, element: "Start primary-foreground on --primary fill", ink: `${fmt(startInk.rgb)} a${startInk.a}`, pixel: fmt(pxOf(px("startFlat"))), ground: fmt(startFill), coords: `fill interior, box ${whole(boxes.start).x},${whole(boxes.start).y}`, ratio: contrastRatio(startInk.a === 1 ? startInk.rgb : startPainted.ink, startFill), floor: 4.5, note: `computed fill alpha ${startAlpha.a}; painted interior worst ${startPainted.ratio.toFixed(3)} (${fmt(startPainted.ground)}); raw ${startRaw}` });

  // 012 criterion 14/15: --control-border on Reset, painted stroke vs worst ring pixel. (The focus-length field left / in task 017.)
  for (const [name, stroke, ring] of [
    ["Reset --control-border", "resetStroke", "resetRing"],
  ] as const) {
    const edgeCss = await L.reset.evaluate((el) => getComputedStyle(el).borderTopColor);
    const worst = worstAgainst(px(ring), pxOf(px(stroke)));
    record({ criterion: "012-c14", ...A, state: stateLabel, element: name, ink: fmt(await toRgb(page, edgeCss)), pixel: fmt(pxOf(px(stroke))), ground: fmt(worst.pixel), coords: "top row, 3 px ring", ratio: worst.ratio, floor: 3 });
  }

  // 013 group H (criterion 50): dot fills and the ring stroke against the frosted ground around each dot.
  // The ring on the active-idle dot is sampled at its top stroke row; the fill dots at their centre.
  const dotTreat = await page.locator("[data-treatment]").evaluateAll((els) => els.map((e) => e.getAttribute("data-treatment")));
  for (let i = 0; i < 4; i += 1) {
    // A fill is read at its centre; the active-idle ring is read on its top stroke row.
    const ring = dotTreat[i] === "active-idle";
    const painted = pxOf(px(ring ? `dot${i}Stroke` : `dot${i}`));
    const g = worstAgainst(px(`dot${i}Ring`), painted);
    record({ criterion: "013-c50", ...A, state: stateLabel, element: `dot ${i} (${dotTreat[i]})`, ink: "n/a", pixel: fmt(painted), ground: fmt(g.pixel), coords: ring ? "top stroke row, centre x" : "centre", ratio: g.ratio, floor: 3 });
  }

  // 012 criterion 15 (flat) and criterion 4 (on the photograph): the four outline triggers, in their own capture.
  await triggerRing(page, { theme, image, viewport: viewport.name, state: stateLabel, flat: image === "flat" });
}

/**
 * The four outline triggers, painted stroke vs the worst pixel of a 3 px ring. The cluster sits in flow
 * below the content at narrow widths, so it is scrolled into view first and sampled in its own capture.
 */
async function triggerRing(page: Page, o: { theme: Theme; image: string; viewport: string; state: string; flat: boolean; mode?: string }): Promise<number[]> {
  const triggers = page.locator('a[href="/settings"]').locator("xpath=../..").locator("button, a");
  await triggers.nth(0).evaluate((el) => el.scrollIntoView({ block: "center" }));
  const boxes = await Promise.all([0, 1, 2, 3].map((i) => boxOf(triggers.nth(i))));
  const plan = new Plan();
  boxes.forEach((t, i) => {
    plan.add(`t${i}Stroke`, [{ x: Math.floor(t.x) + 6, y: Math.floor(t.y), w: Math.ceil(t.w) - 12, h: 1 }]);
    plan.add(`t${i}Ring`, ringOf(t, 3));
  });
  const px = await plan.sample(page);
  return boxes.map((t, i) => {
    const stroke = pxOf(px(`t${i}Stroke`));
    const worst = worstAgainst(px(`t${i}Ring`), stroke);
    record({ criterion: "012-c15", theme: o.theme, image: o.image, viewport: o.viewport, state: o.mode ?? o.state, element: `outline trigger ${i} --control-border`, ink: fmt(stroke), pixel: fmt(stroke), ground: fmt(worst.pixel), coords: `top row ${Math.round(t.y)}`, ratio: worst.ratio, floor: o.flat ? 3 : null, note: o.flat ? "flat, no image in the loop" : "sits on the photograph (criterion 4, deferred)" });
    return worst.ratio;
  });
}

// ---------------------------------------------------------------------------------------------
// Capture B/C/D: focus indicator outer edge (012 criterion 14 clause; criterion 15 edges of the theme control)
// ---------------------------------------------------------------------------------------------

async function captureFocus(page: Page, theme: Theme, image: string, viewport: { name: string; width: number; height: number }, target: "chip" | "start" | "theme") {
  const L = await layout(page);
  void L;
  const el = target === "chip" ? page.locator('fieldset label:has(input[value="focus"]) input') : target === "start" ? L.start : page.locator('input[name="theme"]:checked');
  const focusEl = el.first();
  await focusEl.focus();
  await settle(page);
  const focusVisible = await focusEl.evaluate((e) => e.matches(":focus-visible"));
  const outline = await focusEl.evaluate((e) => {
    const target = e.tagName === "INPUT" ? (e.closest("label")?.querySelector("span") ?? e) : e;
    const cs = getComputedStyle(target);
    const r = target.getBoundingClientRect();
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset), colour: cs.outlineColor, x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const measured = outline.style !== "none" && outline.width > 0;
  const off = outline.offset + outline.width;
  const T = outline.y - off;
  const plan = new Plan();
  // Outer edge: the outermost painted outline row (top side) at the centre column. Ground: the two rows
  // just outside it, across the element's own width. One side only, so no other element can sit in the band.
  const sx = Math.floor(outline.x + outline.w / 2);
  plan.add("stroke", [{ x: sx, y: Math.floor(T), w: 1, h: 1 }]);
  plan.add("outside", [{ x: Math.floor(outline.x), y: Math.floor(T) - 2, w: Math.ceil(outline.w), h: 2 }]);
  const px = await plan.sample(page);
  const colour = await toRgb(page, outline.colour);
  const painted = pxOf(px("stroke"));
  const worst = worstAgainst(px("outside"), painted);
  const aligned = Number.isInteger(T);
  record({
    criterion: "012-c14",
    theme,
    image,
    viewport: viewport.name,
    state: `focus ${target} (${focusVisible ? "focus-visible" : "NOT focus-visible"})`,
    element: `focus outline outer edge, ${target}`,
    ink: fmt(colour),
    pixel: fmt(painted),
    ground: fmt(worst.pixel),
    coords: `outer row ${T}${aligned ? " (integer, fully covered)" : " (NOT pixel-aligned)"}`,
    ratio: measured ? worst.ratio : 0,
    floor: 3,
    note: measured ? `outline ${outline.width}px, offset ${outline.offset}px, ${outline.style}` : "NO OUTLINE",
  });
}

// ---------------------------------------------------------------------------------------------
// Capture E: gauge matrix (012 criterion 16), 100 / 50 / 0 for both styles
// ---------------------------------------------------------------------------------------------

const LEVELS: { level: number; timer: Parameters<typeof seedTimerState>[1]; label: string }[] = [
  { level: 100, label: "level 100 idle", timer: { mode: "focus", status: "idle", focusMinutes: 25, cyclePosition: 0, endTimestamp: null, startedAt: null, runId: null, pausedRemainingMs: null } },
  { level: 50, label: "level 50 paused", timer: { mode: "focus", status: "paused", focusMinutes: 25, cyclePosition: 0, endTimestamp: null, startedAt: Date.now() - 1000, runId: "qa-r2-50", pausedRemainingMs: FULL_MS / 2 } },
  { level: 0, label: "level 0 paused", timer: { mode: "focus", status: "paused", focusMinutes: 25, cyclePosition: 0, endTimestamp: null, startedAt: Date.now() - 1000, runId: "qa-r2-0", pausedRemainingMs: 1 } },
];

async function captureGauge(page: Page, theme: Theme, image: string, viewport: { name: string; width: number; height: number }, style: "vessel" | "glyph", lv: (typeof LEVELS)[number], blurOff: boolean) {
  await setup(page, { theme, image, viewport, gaugeStyle: style, timer: lv.timer, blurOff });
  const readoutEl = page.locator("p.tabular-nums").first();
  const box = await boxOf(readoutEl);
  const level = await page.locator("[data-gauge-level]").first().getAttribute("data-gauge-level");
  const plan = new Plan();
  plan.add("readout", [whole(box)]);
  const raw = await inkOf(page, readoutEl);
  const inkA = await inkRgba(page, raw);
  if (style === "glyph") {
    // The glyph digits are painted through a background clip, so hiding text does not hide them: the digits
    // ARE the fill (verified visually, e2e probe crop). Their ground is the panel ring around the readout.
    // Foreground = every colour inside the box that is not the panel; ground = the worst ring pixel.
    plan.add("ring", ringOf(box, 6));
    const pxv = await plan.sample(page, false);
    const inBox = pxv("readout");
    const ringMap = pxv("ring");
    const total = [...inBox.values()].reduce((a, b) => a + b, 0);
    const ringRgb = [...ringMap.entries()].filter(([, n]) => n >= 0.02 * [...ringMap.values()].reduce((a, b) => a + b, 0)).map(([k]) => k.split(",").map(Number) as Rgb);
    const nearPanel = (c: Rgb) => ringRgb.some((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) <= 12);
    const fgs = [...inBox.entries()].map(([k, n]) => ({ c: k.split(",").map(Number) as Rgb, n })).filter((x) => n_ok(x.n, total) && !nearPanel(x.c)).map((x) => x.c);
    const scored = fgs.map((fg) => ({ fg, ...worstAgainst(ringMap, fg) }));
    const low = scored.reduce((a, b) => (b.ratio < a.ratio ? b : a), scored[0]);
    record({
      criterion: "012-c16",
      theme,
      image,
      viewport: viewport.name,
      state: `${lv.label}, glyph${blurOff ? ", blur off" : ""}`,
      element: "mm:ss digits (glyph fill, unhidden capture vs panel ring)",
      ink: fmt(low.fg),
      pixel: fmt(low.fg),
      ground: fmt(low.pixel),
      coords: `box ${whole(box).x},${whole(box).y} ${whole(box).w}x${whole(box).h}; ring 6 px; data-gauge-level=${level}; fg colours ${scored.map((x) => fmt(x.fg)).join(" | ")}`,
      ratio: low.ratio,
      floor: 4.5,
    });
    return;
  }
  const px = await plan.sample(page);
  const worst = worstText(px("readout"), inkA);
  const ink = inkA.rgb;
  record({
    criterion: "012-c16",
    theme,
    image,
    viewport: viewport.name,
    state: `${lv.label}, ${style}${blurOff ? ", blur off" : ""}`,
    element: "mm:ss digits",
    ink: fmt(ink),
    pixel: fmt(worst.ground),
    ground: fmt(worst.ground),
    coords: `box ${whole(box).x},${whole(box).y} ${whole(box).w}x${whole(box).h}; data-gauge-level=${level}; raw ${raw}`,
    ratio: worst.ratio,
    floor: 4.5,
  });
}

// ---------------------------------------------------------------------------------------------
// Greyscale (013 criterion 52) and forced colours (012 criterion 20; 013 criterion 53)
// ---------------------------------------------------------------------------------------------

async function captureDots(page: Page, tag: { theme: Theme; image: string; viewport: string; state: string; crit: string }) {
  const L = await layout(page);
  const plan = new Plan();
  L.boxes.dots.forEach((d, i) => {
    plan.add(`dot${i}`, [dotPaint(d)]);
    plan.add(`dot${i}Stroke`, [dotStroke(d)]);
    plan.add(`dot${i}Ring`, ringOf(d, 6));
  });
  const px = await plan.sample(page);
  const treat = await page.locator("[data-treatment]").evaluateAll((els) => els.map((e) => e.getAttribute("data-treatment")));
  const sizes = L.boxes.dots.map((d) => `${Math.round(d.w)}x${Math.round(d.h)}`);
  const note = `box sizes ${sizes.join(",")}`;
  const centres = treat.map((t, i) => ({ t, painted: pxOf(px(t === "active-idle" ? `dot${i}Stroke` : `dot${i}`)) }));
  for (let i = 0; i < 4; i += 1) {
    const c = centres[i];
    const g = worstAgainst(px(`dot${i}Ring`), c.painted);
    record({ criterion: tag.crit, theme: tag.theme, image: tag.image, viewport: tag.viewport, state: `${tag.state}, dot ${i}`, element: `dot ${i} (${c.t})`, ink: "n/a", pixel: fmt(c.painted), ground: fmt(g.pixel), coords: c.t === "active-idle" ? "top stroke row" : "centre", ratio: g.ratio, floor: null, note });
  }
  return { px, treat, centres, note };
}

// ---------------------------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------------------------

test.describe("012 round 2 and 013 round 2: one measurement sweep, groundPixels only", () => {
  test.setTimeout(1_200_000);

  for (const [imageName, makeImage] of Object.entries(IMAGES)) {
    test(`image ${imageName}: base ground, focus, gauge matrix, blur off, reduced transparency, 1 px borders`, async ({ page }) => {
      const from = readings.length;
      await page.setViewportSize(DESKTOP);
      await chooseOnSettings(page, makeImage(), `qa-r2-${imageName}.png`);

      for (const theme of ["light", "dark"] as Theme[]) {
        for (const viewport of VIEWPORTS) {
          await setup(page, { theme, image: imageName, viewport });
          await captureBase(page, theme, imageName, viewport, { crit: "base", state: "idle focus, cycle 1" });
          if (viewport.name === "1280x800") await borderCoverage(page, { theme, image: imageName, viewport: viewport.name, state: "idle focus, cycle 1" });
          await captureFocus(page, theme, imageName, viewport, "chip");
          await captureFocus(page, theme, imageName, viewport, "start");
          await captureFocus(page, theme, imageName, viewport, "theme");
        }
        // Gauge matrix (016) at both viewports, both styles, all three levels.
        for (const viewport of VIEWPORTS) {
          for (const style of ["vessel", "glyph"] as const) {
            for (const lv of LEVELS) await captureGauge(page, theme, imageName, viewport, style, lv, false);
          }
        }
        // Criterion 18 re-run (blur off, 1280) for the base set and, for white and black, the gauge matrix.
        await setup(page, { theme, image: imageName, viewport: DESKTOP, blurOff: true });
        await captureBase(page, theme, imageName, VIEWPORTS[0], { crit: "blur-off", state: "idle focus, cycle 1", blurOff: true });
        if (imageName !== "split") {
          for (const style of ["vessel", "glyph"] as const) {
            for (const lv of LEVELS) await captureGauge(page, theme, imageName, VIEWPORTS[0], style, lv, true);
          }
        }
        // Criterion 19: reduced transparency, the thin pairs at 1280 (CDP emulation).
        await setup(page, { theme, image: imageName, viewport: DESKTOP, reducedTransparency: true });
        await captureBase(page, theme, imageName, VIEWPORTS[0], { crit: "reduced-transparency", state: "idle focus, cycle 1", reduced: true });
        await applyMedia(page, { theme, image: null, viewport: DESKTOP });
        // Criterion 52: greyscale dots (013), 1280 only.
        await setup(page, { theme, image: imageName, viewport: DESKTOP, grey: true });
        await captureDots(page, { theme, image: imageName, viewport: "1280x800", state: "greyscale idle", crit: "013-c52" });
        await setup(page, { theme, image: imageName, viewport: DESKTOP });
        await captureBase(page, theme, imageName, VIEWPORTS[0], { crit: "base", state: "idle focus, cycle 1" });
      }
      assertFloors(from);
    });
  }

  // Flat: no uploaded background at all. Solid surfaces are image-independent (012 criterion 15).
  test("flat (no image): solid surfaces, outline triggers, forced colours, dots, greyscale", async ({ page }) => {
    const from = readings.length;
    await page.setViewportSize(DESKTOP);
    for (const theme of ["light", "dark"] as Theme[]) {
      for (const viewport of VIEWPORTS) {
        await setup(page, { theme, image: null, viewport });
        await captureBase(page, theme, "flat", viewport, { crit: "flat", state: "flat, idle focus" });
        if (viewport.name === "1280x800") await borderCoverage(page, { theme, image: "flat", viewport: viewport.name, state: "flat, idle focus" });
        await captureDots(page, { theme, image: "flat", viewport: viewport.name, state: "flat idle", crit: "013-c50" });
        await captureFocus(page, theme, "flat", viewport, "theme");
        // Criterion 20 (forced colours) and its default-mode pair.
        await setup(page, { theme, image: null, viewport, forced: true });
        await captureDots(page, { theme, image: "flat", viewport: viewport.name, state: "FORCED colours, idle", crit: "013-c53" });
        await forcedSurfaces(page, { theme, viewport: viewport.name });
        await setup(page, { theme, image: null, viewport });
        await forcedSurfaces(page, { theme, viewport: viewport.name, defaultMode: true });
      }
      await setup(page, { theme, image: null, viewport: DESKTOP, grey: true });
      await captureDots(page, { theme, image: "flat", viewport: "1280x800", state: "greyscale idle", crit: "013-c52" });
    }
    assertFloors(from);
  });
});

test.describe("012 round-2 findings, recorded as expected failures (the suite stays green; each flips when healed)", () => {
  test.setTimeout(300_000);
  test("012 criterion 14: the theme control's focus outline clears 3:1 over the photograph (dark, white, 1280 px)", async ({ page }) => {
    const from = readings.length;
    await page.setViewportSize(DESKTOP);
    await chooseOnSettings(page, IMAGES.white(), "r2-finding-white.png");
    await setup(page, { theme: "dark", image: "white", viewport: DESKTOP });
    await captureFocus(page, "dark", "white", VIEWPORTS[0], "theme");
    const row = readings.slice(from).find((r) => r.element.startsWith("focus outline outer edge, theme"));
    expect(row, "theme focus row measured").toBeDefined();
    // 012 round 3: the chip's ring sits inside the header, so its ground is the header fill.
    expect(row!.ratio, `theme focus outer edge ${row!.ground}`).toBeGreaterThanOrEqual(3);
  });

  test("012 criterion 20: the Tasks trigger keeps a visible edge under forced colours", async ({ page }) => {
    await setup(page, { theme: "light", image: null, viewport: DESKTOP, forced: true });
    const ratios = await triggerRing(page, { theme: "light", image: "none", viewport: "1280x800", state: "forced colours (triggers)", flat: true });
    // 012 round 3: every trigger carries a 1 px ButtonBorder under forced colours (.control-edge).
    expect(ratios[0], "Tasks trigger edge under forced colours").toBeGreaterThanOrEqual(3);
  });

  test.fail("012 criterion 17: every 1 px border on / reaches 3:1 where it has a covered pixel (light, white image, 1280 px)", async ({ page }) => {
    const from = readings.length;
    await page.setViewportSize(DESKTOP);
    await chooseOnSettings(page, IMAGES.white(), "r2-finding-white.png");
    await setup(page, { theme: "light", image: "white", viewport: DESKTOP });
    await borderCoverage(page, { theme: "light", image: "white", viewport: "1280x800", state: "idle focus, cycle 1" });
    const below = readings.slice(from).filter((r) => r.criterion === "012-c17" && r.ratio < 3);
    // KNOWN: the surfaces' --border hairlines and the timer readout group's border sit below 3:1 on this ground.
    expect(below.map((r) => `${r.element} ${r.ratio.toFixed(3)}`), "1 px borders below 3:1").toEqual([]);
  });
});

/**
 * 012 criterion 17: every 1 px border on the page, one row or column per side. A side is measured only
 * where a fully covered pixel exists (an integer edge). Its stroke is the covered pixel; the ground is the
 * 2 px band just outside the element on that side. Nothing is thickened; the count is reported as found.
 */
async function borderCoverage(page: Page, tag: { theme: Theme; image: string; viewport: string; state: string }) {
  const sides = await page.evaluate(() => {
    const out: { label: string; side: string; covered: boolean; x: number; y: number; w: number; h: number; colour: string; offscreen: boolean }[] = [];
    const props: [string, string, string][] = [
      ["top", "borderTopWidth", "borderTopColor"],
      ["bottom", "borderBottomWidth", "borderBottomColor"],
      ["left", "borderLeftWidth", "borderLeftColor"],
      ["right", "borderRightWidth", "borderRightColor"],
    ];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      for (const [side, wp, cp] of props) {
        const width = parseFloat((cs as unknown as Record<string, string>)[wp]);
        const colour = (cs as unknown as Record<string, string>)[cp];
        if (width !== 1 || cs.getPropertyValue("border-" + side + "-style") === "none" || colour === "transparent" || /\/ 0\)$|, 0\)$/.test(colour)) continue;
        const label = `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}.${(el.className?.toString() ?? "").split(" ").slice(0, 2).join(".")}`.slice(0, 80);
        const W = window.innerWidth;
        const H = window.innerHeight;
        const onScreen = (x: number, y: number, w: number, h: number) => x >= 0 && y >= 0 && x + w <= W && y + h <= H;
        let item: { label: string; side: string; covered: boolean; x: number; y: number; w: number; h: number; colour: string; offscreen: boolean } | null = null;
        if (side === "top") item = { label, side, covered: Number.isInteger(r.top), x: r.left, y: r.top, w: r.width, h: 1, colour, offscreen: false };
        if (side === "bottom") item = { label, side, covered: Number.isInteger(r.bottom), x: r.left, y: r.bottom - 1, w: r.width, h: 1, colour, offscreen: false };
        if (side === "left") item = { label, side, covered: Number.isInteger(r.left), x: r.left, y: r.top, w: 1, h: r.height, colour, offscreen: false };
        if (side === "right") item = { label, side, covered: Number.isInteger(r.right), x: r.right - 1, y: r.top, w: 1, h: r.height, colour, offscreen: false };
        if (item) {
          // The stroke and the 2 px band outside it must both be on screen to be read from this capture.
          item.offscreen = !onScreen(item.x, item.y, item.w, item.h) || !onScreen(item.x - 2, item.y - 2, item.w + 4, item.h + 4);
          out.push(item);
        }
      }
    }
    return out;
  });
  const plan = new Plan();
  sides.forEach((s, i) => {
    if (!s.covered || s.offscreen) return;
    const sx = Math.floor(s.x + s.w / 2);
    const sy = Math.floor(s.y + s.h / 2);
    plan.add(`s${i}`, [{ x: sx, y: sy, w: 1, h: 1 }]);
    const outside: Rect = s.side === "top" ? { x: Math.floor(s.x), y: Math.floor(s.y) - 2, w: Math.ceil(s.w), h: 2 }
      : s.side === "bottom" ? { x: Math.floor(s.x), y: Math.floor(s.y) + 1, w: Math.ceil(s.w), h: 2 }
      : s.side === "left" ? { x: Math.floor(s.x) - 2, y: Math.floor(s.y), w: 2, h: Math.ceil(s.h) }
      : { x: Math.floor(s.x) + 1, y: Math.floor(s.y), w: 2, h: Math.ceil(s.h) };
    plan.add(`o${i}`, [outside]);
  });
  const px = await plan.sample(page);
  let covered = 0;
  const findings: string[] = [];
  let offscreen = 0;
  sides.forEach((s, i) => {
    if (s.offscreen) {
      offscreen += 1;
      return;
    }
    if (!s.covered) {
      findings.push(`NO COVERED PIXEL ${s.label} ${s.side} at ${s.x},${s.y}`);
      return;
    }
    covered += 1;
    const stroke = pxOf(px(`s${i}`));
    const worst = worstAgainst(px(`o${i}`), stroke);
    record({ criterion: "012-c17", theme: tag.theme, image: tag.image, viewport: tag.viewport, state: tag.state, element: `${s.label} ${s.side}`, ink: s.colour, pixel: fmt(stroke), ground: fmt(worst.pixel), coords: `${s.x},${s.y} (fully covered)`, ratio: worst.ratio, floor: 3 });
  });
  console.log(`012-c17 ${tag.theme} ${tag.image}: ${sides.length} 1 px sides in the DOM, ${offscreen} off this capture, ${covered} measured with a fully covered pixel, ${sides.length - covered - offscreen} without`);
  findings.slice(0, 40).forEach((f) => console.log(`  ${f}`));
}

/**
 * Forced colours (012 criterion 20): no text invisible, no control loses its edge, no surface reads as an
 * empty box. Measured as painted pixels: the readout, Start, the wordmark, the Reset and focus-length edges,
 * the four triggers' edges, and each surface's boundary against the canvas. The default-mode pair is the
 * same measurement with no forced colours, so the two can be read side by side.
 */
async function forcedSurfaces(page: Page, o: { theme: Theme; viewport: string; defaultMode?: boolean }) {
  const L = await layout(page);
  const plan = new Plan();
  // Forced colours override the measurement's text hiding (color: transparent is not honoured), so these reads
  // are unhidden: the ink against a 6 px ring of canvas, and the Start label against a corner of its fill.
  plan.add("readout", ringOf(L.boxes.readout, 6));
  plan.add("wordmark", ringOf(L.boxes.h1, 6));
  plan.add("start", [{ x: Math.floor(L.boxes.start.x) + 6, y: Math.floor(L.boxes.start.y) + 6, w: 4, h: 4 }]);
  plan.add("frostedEdge", [{ x: Math.floor(L.boxes.frosted.x), y: Math.floor(L.boxes.frosted.y) + 20, w: 1, h: 1 }]);
  plan.add("frostedLeftEdge", [{ x: Math.floor(L.boxes.frosted.x) + 0, y: Math.floor(L.boxes.frosted.y) + 60, w: 1, h: 1 }]);
  plan.add("solidBottom", [{ x: Math.floor(L.boxes.solid.x) + 40, y: Math.floor(L.boxes.solid.y + L.boxes.solid.h) - 1, w: 1, h: 1 }]);
  plan.add("canvas", [{ x: 2, y: 2, w: 1, h: 1 }]);
  plan.add("reset", [{ x: Math.floor(L.boxes.reset.x) + 4, y: Math.floor(L.boxes.reset.y), w: Math.ceil(L.boxes.reset.w) - 8, h: 1 }]);
  plan.add("resetRing", ringOf(L.boxes.reset, 3));
  // (input edge: retired with the duration field, task 017.)
  // (inputRing: retired with the duration field, task 017.)
  const px = await plan.sample(page, false);
  const mode = o.defaultMode ? "default mode" : "forced colours";
  const canvas = pxOf(px("canvas"));
  const txt = async (loc: Locator) => toRgb(page, await inkOf(page, loc));
  const readoutInk = await txt(L.readoutEl);
  const wordInk = await txt(L.h1);
  const rr = worstAgainst(px("readout"), readoutInk);
  const wr = worstAgainst(px("wordmark"), wordInk);
  const sr = worstAgainst(px("start"), await txt(L.start));
  const triggerEdges = await triggerRing(page, { theme: o.theme, image: "none", viewport: o.viewport, state: o.defaultMode ? "default mode" : "forced colours", flat: true, mode: o.defaultMode ? "default mode (forced pair)" : "forced colours (triggers)" });
  const resetEdge = worstAgainst(px("resetRing"), pxOf(px("reset")));
  // (inputEdge: retired with the duration field, task 017.)
  const surfaceFrosted = pxOf(px("frostedEdge"));
  const surfaceFrostedLeft = pxOf(px("frostedLeftEdge"));
  const solidBottom = pxOf(px("solidBottom"));
  const common = { theme: o.theme, image: "none", viewport: o.viewport, state: mode };
  record({ criterion: "012-c20", ...common, element: "mm:ss digits", ink: fmt(readoutInk), pixel: fmt(rr.pixel), ground: fmt(rr.pixel), coords: "box", ratio: rr.ratio, floor: 4.5 });
  record({ criterion: "012-c20", ...common, element: "wordmark", ink: fmt(wordInk), pixel: fmt(wr.pixel), ground: fmt(wr.pixel), coords: "box", ratio: wr.ratio, floor: 3 });
  record({ criterion: "012-c20", ...common, element: "Start label on fill", ink: "n/a", pixel: fmt(sr.pixel), ground: fmt(sr.pixel), coords: "box", ratio: sr.ratio, floor: 4.5 });
  record({ criterion: "012-c20", ...common, element: "Reset edge vs 3 px ring", ink: "n/a", pixel: fmt(pxOf(px("reset"))), ground: fmt(resetEdge.pixel), coords: "top row", ratio: resetEdge.ratio, floor: 3 });
  // (focus-length edge row: retired with the duration field, task 017; re-measured on /settings.)
  record({ criterion: "012-c20", ...common, element: "outline trigger edges (min of 4)", ink: "n/a", pixel: "n/a", ground: "n/a", coords: "top rows", ratio: Math.min(...triggerEdges), floor: 3 });
  // A surface reads as a box only through its boundary: the painted pixel just inside the frosted or solid edge
  // against the canvas. A ratio of 1 means the boundary is not painted (Canvas border on Canvas).
  record({ criterion: "012-c20", ...common, element: "frosted boundary vs canvas", ink: fmt(canvas), pixel: fmt(surfaceFrosted), ground: fmt(canvas), coords: "frosted left-top interior", ratio: contrastRatio(canvas, surfaceFrosted), floor: null, note: `left-edge pixel ${fmt(surfaceFrostedLeft)}` });
  record({ criterion: "012-c20", ...common, element: "solid boundary vs canvas", ink: fmt(canvas), pixel: fmt(solidBottom), ground: fmt(canvas), coords: "solid bottom row", ratio: contrastRatio(canvas, solidBottom), floor: null });
}
