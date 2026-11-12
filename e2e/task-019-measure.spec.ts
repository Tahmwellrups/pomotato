import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ADVERSARIAL, chooseOnSettings } from "./helpers/background";
import { DESKTOP, ratio } from "./helpers/dark";
import { hex, sampleRegions, type Box } from "./helpers/task-019-sampler";
import type { Rgb } from "./helpers/painted";

// Task 019 group F, measured on three grounds with the corrected methods (coordinator's correction, 2026-11-12).
//   Text (timer digits, mode chips): the pixels each text run covers, from Range.getClientRects(). The bounding
//   box of a full-width host is not used: it can contain pixels no glyph sits on.
//   UI boundaries (Start/Pause and Tasks edges): the painted boundary pixel just inside the element's edge
//   against the painted ground pixel immediately outside it. Boundary and ground are both sampled.
//   Focus ring: the ring pixels against the nearest painted ground pixel outside them, on three rows.
// Grounds: none, white, busy 1px checker. One screenshot per ground for text and edges (text hidden), one more
// with the Start control keyboard-focused for the ring. Dark is the only palette, stated once here.
// Floors (3, 4.5) are asserted on the plain page only, which is the state 019 ships. The image grounds are
// recorded for task 020 and do not fail this spec.

const GROUNDS: { name: string; buffer: (() => Buffer) | null }[] = [
  { name: "no image", buffer: null },
  { name: "white", buffer: ADVERSARIAL.white },
  { name: "busy 1px checker", buffer: ADVERSARIAL["1px checker"] },
];

const OUT_DIR = resolve(process.cwd(), "test-results");

function hexRgb(hexValue: string): Rgb {
  const v = hexValue.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function parseRgb(css: string): Rgb {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not an rgb colour: ${css}`);
  const parts = m[1].split(",").map((v) => Number(v.trim()));
  return [parts[0], parts[1], parts[2]];
}

async function focusPrimary(page: Page) {
  for (let i = 0; i < 40; i++) {
    const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (label === "Start" || label === "Pause") return;
    await page.keyboard.press("Tab");
  }
  throw new Error("primary control not reachable by Tab");
}

type Rect = { x: number; y: number; width: number; height: number };

for (const ground of GROUNDS) {
  test(`ground: ${ground.name}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    if (ground.buffer) await chooseOnSettings(page, ground.buffer(), `${ground.name.replace(/\s+/g, "-")}.png`);
    await page.goto("/");
    if (ground.buffer) {
      await page.waitForFunction(() => document.querySelector("[data-background]")?.getAttribute("data-background") === "active", null, { timeout: 15_000 });
    }
    await page.waitForTimeout(700);

    // Geometry and colours, read before the text is hidden.
    const geo = await page.evaluate(() => {
      const runs = (el: Element | null): Rect[] => {
        if (!el) return [];
        const range = document.createRange();
        range.selectNodeContents(el);
        return Array.from(range.getClientRects())
          .filter((r) => r.width >= 1 && r.height >= 1)
          .map((r) => ({ x: r.left, y: r.top, width: r.width, height: r.height }));
      };
      const box = (el: Element | null): Rect | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      };
      const colour = (el: Element | null, prop: "color" | "backgroundColor") => (el ? getComputedStyle(el)[prop] : "");
      const popover = getComputedStyle(document.documentElement).getPropertyValue("--popover").trim();
      const digits = Array.from(document.querySelectorAll<HTMLElement>("p,span,div,h1,h2")).find((el) =>
        Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && /\d\d:\d\d/.test(n.textContent ?? ""))
      ) ?? null;
      const checked = document.querySelector('input[name="timer-mode"]:checked + span');
      const unchecked = document.querySelector('input[name="timer-mode"]:not(:checked) + span');
      const start = document.querySelector('button[aria-label="Start"], button[aria-label="Pause"]');
      const tasks = document.querySelector('button[aria-label="Tasks"]');
      return {
        digits: { runs: runs(digits), fg: colour(digits, "color") },
        chipChecked: { runs: runs(checked), fg: colour(checked, "color") },
        chipUnchecked: { runs: runs(unchecked), fg: colour(unchecked, "color") },
        start: { box: box(start), fill: colour(start, "backgroundColor") },
        tasks: { box: box(tasks), fill: colour(tasks, "backgroundColor") },
        popover,
      };
    });
    const parsed = {
      digits: parseRgb(geo.digits.fg),
      chipChecked: parseRgb(geo.chipChecked.fg),
      chipUnchecked: parseRgb(geo.chipUnchecked.fg),
      startFill: parseRgb(geo.start.fill),
      tasksFill: parseRgb(geo.tasks.fill),
      popover: hexRgb(geo.popover),
    };

    // Hide every glyph once; the screenshot then holds only the painted ground, fills and edges.
    await page.addStyleTag({ content: "* { color: transparent !important; caret-color: transparent !important; } input, textarea { color: transparent !important; }" });
    await page.waitForTimeout(100);

    // Regions: every text run, plus a 1px inner and outer strip beside each control's left edge.
    const regions: Record<string, Rect> = {};
    const addRuns = (prefix: string, runs: Rect[]) => runs.forEach((r, i) => (regions[`${prefix}.${i}`] = r));
    addRuns("digits", geo.digits.runs);
    addRuns("chipChecked", geo.chipChecked.runs);
    addRuns("chipUnchecked", geo.chipUnchecked.runs);
    for (const name of ["start", "tasks"] as const) {
      const b = geo[name].box;
      if (!b) continue;
      const midY = b.y + b.height / 2 - 4;
      for (let dx = -4; dx <= 5; dx++) regions[`${name}.col${dx}`] = { x: Math.floor(b.x) + dx, y: midY, width: 1, height: 8 };
    }
    const reading = await sampleRegions(page, regions as Record<string, Box>);

    const textWorst = (prefix: string, fg: Rgb, count: number) => {
      let worst = { ratio: Infinity, pixel: "", at: "" };
      for (let i = 0; i < count; i++) {
        const r = reading[`${prefix}.${i}`];
        for (const pick of [r.brightest, r.darkest]) {
          const value = ratio(fg, pick.rgb);
          if (value < worst.ratio) worst = { ratio: value, pixel: hex(pick.rgb), at: `(${pick.x},${pick.y})` };
        }
      }
      return { fg: hex(fg), ratio: Number(worst.ratio.toFixed(3)), worstPixel: worst.pixel, at: worst.at, runs: count };
    };
    // A control edge is the outermost painted boundary pixel: its fill, or --popover where control-edge draws its
    // one-pixel ring on an image page. Scanned outward-in, it is measured against the column immediately outside it.
    const edgeFigure = (name: "start" | "tasks") => {
      const fill = parsed[name === "start" ? "startFill" : "tasksFill"];
      const candidates = name === "tasks" ? [fill, parsed.popover] : [fill];
      const cols = Array.from({ length: 10 }, (_, i) => i - 4);
      const x0 = Math.floor(geo[name].box!.x);
      const profile = cols.map((dx) => `x=${x0 + dx}:${hex(reading[`${name}.col${dx}`].mode.rgb)}`).join(" ");
      const boundaryIdx = cols.find((dx) => {
        const m = reading[`${name}.col${dx}`].mode.rgb;
        return candidates.some((c) => c.every((v, i) => v === m[i]));
      });
      if (boundaryIdx === undefined) return { boundaryPainted: null, note: "no fill or --popover column found", profile };
      const boundary = reading[`${name}.col${boundaryIdx}`].mode.rgb;
      const ground = reading[`${name}.col${boundaryIdx - 1}`];
      const worst = [ground.brightest, ground.darkest].map((pick) => ({ value: ratio(boundary, pick.rgb), pick })).sort((p, q) => p.value - q.value)[0];
      return {
        boundaryPainted: hex(boundary),
        boundaryAt: `column x=${x0 + boundaryIdx}`,
        ground: hex(worst.pick.rgb),
        groundAt: `(${worst.pick.x},${worst.pick.y}) column x=${x0 + boundaryIdx - 1}`,
        ratio: Number(worst.value.toFixed(3)),
        computedFill: hex(fill),
        profile,
      };
    };

    // Focus ring: a second screenshot with the Start control keyboard-focused.
    await focusPrimary(page);
    await page.waitForTimeout(150);
    const focusBox = await page.evaluate(() => {
      const el = document.querySelector('button[aria-label="Start"], button[aria-label="Pause"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    let ring: Record<string, unknown> | null = null;
    if (focusBox) {
      const ringToken: Rgb = [0xf0, 0xa5, 0x50];
      const probes: Record<string, Box> = {};
      for (const row of [-1, 0, 1]) {
        for (let d = 1; d <= 8; d++) probes[`r${row}left${d}`] = { x: focusBox.x - d, y: focusBox.y + focusBox.height / 2 + row, width: 1, height: 1 };
      }
      const pixels = await sampleRegions(page, probes);
      const isRing = (rgb: Rgb) => rgb.every((c, i) => c === ringToken[i]);
      const adjacent: { row: number; ringHex: string; groundHex: string; ratio: number }[] = [];
      for (const row of [-1, 0, 1]) {
        const seq = Array.from({ length: 8 }, (_, i) => ({ d: i + 1, rgb: pixels[`r${row}left${i + 1}`].mode.rgb }));
        const lastRing = seq.filter((p) => isRing(p.rgb)).pop();
        if (!lastRing) continue;
        const ground = seq.find((p) => p.d > lastRing.d && !isRing(p.rgb));
        if (ground) adjacent.push({ row, ringHex: hex(lastRing.rgb), groundHex: hex(ground.rgb), ratio: Number(ratio(lastRing.rgb, ground.rgb).toFixed(3)) });
      }
      const worst = adjacent.reduce<(typeof adjacent)[number] | null>((m, a) => (m === null || a.ratio < m.ratio ? a : m), null);
      ring = { worstRatio: worst?.ratio ?? null, worst };
    }

    const figures = {
      ground: ground.name,
      method: "text: Range text-run rects; edges: painted inner vs outer 1px column; ring: 1px probes",
      digits: textWorst("digits", parsed.digits, geo.digits.runs.length),
      chipChecked: textWorst("chipChecked", parsed.chipChecked, geo.chipChecked.runs.length),
      chipUnchecked: textWorst("chipUnchecked", parsed.chipUnchecked, geo.chipUnchecked.runs.length),
      startEdge: edgeFigure("start"),
      tasksEdge: edgeFigure("tasks"),
      focusRing: ring,
    };
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, `task-019-measure-corrected-${ground.name.replace(/\s+/g, "-")}.json`), JSON.stringify(figures, null, 2));
    testInfo.annotations.push({ type: "figure", description: JSON.stringify(figures) });

    // Floors on the plain page only: that is the state 019 ships. Image grounds are recorded for task 020.
    if (!ground.buffer) {
      expect(figures.digits.ratio, "digits, plain page").toBeGreaterThanOrEqual(4.5);
      expect(figures.chipChecked.ratio, "checked chip, plain page").toBeGreaterThanOrEqual(4.5);
      expect(figures.chipUnchecked.ratio, "unchecked chip, plain page").toBeGreaterThanOrEqual(4.5);
      if (figures.startEdge) expect(figures.startEdge.ratio, "Start edge, plain page").toBeGreaterThanOrEqual(3);
      if (figures.tasksEdge) expect(figures.tasksEdge.ratio, "Tasks edge, plain page").toBeGreaterThanOrEqual(3);
      if (ring && typeof ring.worstRatio === "number") expect(ring.worstRatio, "focus ring, plain page").toBeGreaterThanOrEqual(3);
    }
    await context.close();
  });
}
