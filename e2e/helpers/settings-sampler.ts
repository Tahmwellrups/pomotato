import type { Locator, Page } from "@playwright/test";
import { groundPixels } from "./surface-sampler";
import { contrastRatio, type Rect, type Rgb } from "./background";

// Task 017 group I sampler, kept for the next task that measures a settings-style
// route. One page load and one screenshot per theme: every boundary and every
// text ground on /settings is read from that single capture (CLAUDE.md
// "Measurement ordering" and qa.md cost rule 2). /settings is an opaque token
// surface, so the figures do not depend on any uploaded background.
//
// Boundaries: a 1 px row at the top edge of the stroke, read inside the box
// (a fully covered pixel at an integer row), against the 1 px row just above the
// box on the same ground. Fills (toggle on, thumb, track) are read at their
// centre against the pixel just outside them.
// Text: the computed ink colour against the painted ground pixel beside the text.
// The ink is the computed colour, not a sampled glyph pixel; that is stated in the
// report, and the ground is always a painted pixel.

export interface SettingsReading {
  kind: "boundary" | "text";
  label: string;
  /** The painted pixel (or the computed ink, for text) and the ground pixel it is read against. */
  ink: Rgb;
  pixel: Rgb;
  ground: Rgb;
  ratio: number;
  /** Where the pixel was read, in integer CSS px, so a reviewer can re-read the same spot. */
  coords: string;
}

interface Target {
  kind: "boundary" | "text";
  label: string;
  /** Computed colour for the ink (text) or the stroke/fill token resolved by the browser (boundary). */
  css: string;
  /** Rect of the one pixel row/column being read. */
  read: Rect;
  /** Rect of the ground pixel row/column read against it. */
  ground: Rect;
  coords: string;
}

async function boxOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("no bounding box");
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

/** The 1 px top-edge row of a box, inset from the corners so the corner radius is not read. */
function topEdge(box: Rect, inset = 6): Rect {
  return { x: Math.round(box.x + inset), y: Math.round(box.y), w: Math.max(1, Math.round(box.w - inset * 2)), h: 1 };
}

/** The 1 px row just above a box, on the same ground. */
function aboveEdge(box: Rect, inset = 6): Rect {
  return { x: Math.round(box.x + inset), y: Math.round(box.y) - 2, w: Math.max(1, Math.round(box.w - inset * 2)), h: 1 };
}

/** A 1 px sample at a single point. */
function point(x: number, y: number): Rect {
  return { x: Math.round(x), y: Math.round(y), w: 1, h: 1 };
}

function parseCss(value: string): Rgb {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`not an rgb colour: ${value}`);
  const [r, g, b] = match[1].split(",").map((part) => Number(part.trim().split(/\s+/)[0]));
  return [r, g, b];
}

/**
 * Reads every /settings boundary and text ground in ONE screenshot. The caller
 * has already navigated, settled, and set the state it wants measured.
 */
export async function sampleSettingsOnce(page: Page): Promise<SettingsReading[]> {
  const targets: Target[] = [];
  const fieldIds = ["focus-length", "short-break-length", "long-break-length"] as const;

  for (const id of fieldIds) {
    const box = await boxOf(page.locator(`input#${id}`));
    targets.push({ kind: "boundary", label: `${id} field border`, css: "", read: topEdge(box), ground: aboveEdge(box), coords: `#${id} top row` });
  }

  const checkbox = page.locator("input[type='checkbox']").first();
  const cbBox = await boxOf(checkbox);
  targets.push({ kind: "boundary", label: "toggle border (off/on box edge)", css: "", read: topEdge(cbBox, 4), ground: aboveEdge(cbBox, 4), coords: "toggle box top row" });
  const cbCentre = { x: cbBox.x + cbBox.w / 2, y: cbBox.y + cbBox.h / 2 };
  targets.push({ kind: "boundary", label: "toggle on-state fill", css: "", read: point(cbCentre.x, cbCentre.y), ground: point(cbBox.x - 4, cbCentre.y), coords: "toggle box centre vs 4 px left" });

  const slider = page.getByRole("slider", { name: "Chime volume" });
  const sBox = await boxOf(slider);
  // Read past the thumb (value 50 sits at the middle): the left half of the track is the filled --primary run,
  // the right half is the unfilled --control-border edge. Reading the filled run measured the fill, not the edge.
  const trackTop = sBox.y + sBox.h / 2 - 4;
  const trackX = sBox.x + sBox.w - 14;
  targets.push({ kind: "boundary", label: "slider track edge (unfilled side)", css: "", read: point(trackX, trackTop), ground: point(trackX, trackTop - 3), coords: "slider track top edge, right of the thumb" });
  const thumbX = sBox.x + 12 + (sBox.w - 24) * 0.5;
  targets.push({ kind: "boundary", label: "slider thumb fill", css: "", read: point(thumbX, sBox.y + sBox.h / 2), ground: point(thumbX - 16, sBox.y + sBox.h / 2 - 12), coords: "thumb centre vs ground beside it" });

  const reset = await boxOf(page.getByRole("button", { name: "Reset to defaults" }));
  targets.push({ kind: "boundary", label: "Reset button edge", css: "", read: topEdge(reset), ground: aboveEdge(reset), coords: "Reset top row" });
  const preview = await boxOf(page.getByRole("button", { name: "Preview chime" }));
  targets.push({ kind: "boundary", label: "Preview button edge", css: "", read: topEdge(preview), ground: aboveEdge(preview), coords: "Preview top row" });

  // Text grounds. The ink is read from the computed colour of the element itself.
  const texts: [string, Locator][] = [
    ["Focus length label", page.locator("label[for='focus-length']")],
    ["Short break label", page.locator("label[for='short-break-length']")],
    ["Long break label", page.locator("label[for='long-break-length']")],
    ["Chime volume label", page.locator("label[for='chime-volume']")],
    ["error text (short break)", page.locator("#short-break-length-error")],
  ];
  const textInks: { label: string; ink: Rgb; box: Rect }[] = [];
  for (const [label, locator] of texts) {
    const box = await boxOf(locator);
    const ink = parseCss(await locator.evaluate((el) => getComputedStyle(el).color));
    textInks.push({ label, ink, box });
    targets.push({ kind: "text", label, css: "", read: point(box.x - 2, box.y + box.h / 2), ground: point(box.x - 2, box.y + box.h / 2), coords: `${label}: 2 px left of the text box, mid-height` });
  }

  const maps = await groundPixels(page, targets.flatMap((t) => [t.read, t.ground]));
  const readings: SettingsReading[] = [];
  let textIndex = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const pixelMap = maps[i * 2];
    const groundMap = maps[i * 2 + 1];
    const pixel = dominant(pixelMap);
    const ground = dominant(groundMap);
    if (target.kind === "text") {
      const { ink } = textInks[textIndex];
      textIndex += 1;
      readings.push({ kind: "text", label: target.label, ink, pixel: ground, ground, ratio: contrastRatio(ink, ground), coords: target.coords });
    } else {
      readings.push({ kind: "boundary", label: target.label, ink: pixel, pixel, ground, ratio: contrastRatio(pixel, ground), coords: target.coords });
    }
  }
  return readings;
}

function dominant(map: Map<string, number> | undefined): Rgb {
  if (!map || map.size === 0) throw new Error("no pixels read");
  let best = "";
  let count = -1;
  for (const [key, n] of map) {
    if (n > count) {
      best = key;
      count = n;
    }
  }
  const [r, g, b] = best.split(",").map(Number);
  return [r, g, b];
}
