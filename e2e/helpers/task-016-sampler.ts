import type { Locator, Page } from "@playwright/test";

// Painted-pixel sampler for task 016 group P. One PNG per element, read back in
// the browser with a canvas, so no image library is needed.
//
// Rule, stated once for every figure it produces:
//   ground = the most common colour inside the element's box (the painted ground
//            the element sits on: the row's --card over --background, the menu's
//            --popover, the toast's --popover);
//   ink    = the painted pixel furthest from that ground in WCAG contrast (the
//            glyph core for text and icons, the edge for a border);
//   ratio  = WCAG 2.x contrast of ink against ground.
// Caret and focus rings are kept out of the capture by blurring first.

export type Rgb = [number, number, number];

export interface PaintedSample {
  label: string;
  ink: Rgb;
  ground: Rgb;
  ratio: number;
  /** Number of pixels in the box whose colour equals the ink (1 means a single-pixel extreme). */
  inkPixels: number;
  sizePx: [number, number];
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Reads the pixels of a PNG in the browser and returns the colour histogram plus the box size. */
async function readPixels(page: Page, png: Buffer): Promise<{ w: number; h: number; pixels: number[] }> {
  return page.evaluate(async (b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return { w: bitmap.width, h: bitmap.height, pixels: Array.from(data) };
  }, png.toString("base64"));
}

/**
 * Samples one element. `box` overrides the element's own box when the target is a
 * sub-region (for example the text container rather than the whole button).
 */
export async function sampleElement(page: Page, locator: Locator, label: string): Promise<PaintedSample> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const box = await locator.boundingBox();
  if (!box || box.width < 1 || box.height < 1) throw new Error(`no painted box for ${label}`);
  const png = await page.screenshot({ clip: box, animations: "disabled", caret: "hide" });
  const { w, h, pixels } = await readPixels(page, png);

  const counts = new Map<string, number>();
  const colourOf = (i: number): Rgb => [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
  for (let i = 0; i < w * h; i++) {
    const key = colourOf(i).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let groundKey = "";
  let groundCount = -1;
  for (const [key, count] of counts) {
    if (count > groundCount) {
      groundKey = key;
      groundCount = count;
    }
  }
  const ground = groundKey.split(",").map(Number) as Rgb;

  let best: Rgb = ground;
  let bestRatio = 1;
  for (let i = 0; i < w * h; i++) {
    const c = colourOf(i);
    const r = contrast(c, ground);
    if (r > bestRatio) {
      bestRatio = r;
      best = c;
    }
  }
  const inkKey = best.join(",");
  return {
    label,
    ink: best,
    ground,
    ratio: Math.round(bestRatio * 100) / 100,
    inkPixels: counts.get(inkKey) ?? 0,
    sizePx: [w, h],
  };
}

export function formatSample(theme: string, s: PaintedSample, floor: number): string {
  const verdict = s.ratio >= floor ? "PASS" : "FAIL";
  return `${theme} | ${s.label} | ink rgb(${s.ink.join(",")}) | ground rgb(${s.ground.join(",")}) | ${s.ratio}:1 | floor ${floor}:1 | ${verdict} | box ${s.sizePx[0]}x${s.sizePx[1]} px, ink pixels ${s.inkPixels}`;
}
