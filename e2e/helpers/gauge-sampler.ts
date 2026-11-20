import type { Locator, Page } from "@playwright/test";
import type { Rgb } from "./painted";

// Task 022 measurement helper (criteria 41-43). One screenshot per scenario,
// then every point is read back from that single capture, so the numbers in a
// table all come from the same painted frame. Reusable by any gauge or flat-
// colour surface check: the caller supplies the points, this supplies the pixels.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One full-viewport PNG, base64. Device scale is 1 in the Desktop Chrome project, so pixel = CSS px. */
export async function captureOnce(page: Page): Promise<string> {
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  return png.toString("base64");
}

/** Reads the painted colour at each page point from a capture. */
export async function pixelsFrom(page: Page, b64: string, points: [number, number][]): Promise<Rgb[]> {
  return page.evaluate(
    async ([data, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      return pts.map(([x, y]) => {
        const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [d[0], d[1], d[2]] as Rgb;
      });
    },
    [b64, points] as const,
  );
}

/**
 * First pixel inside `box` whose painted colour equals `rgb` exactly. A pixel
 * that matches a flat token exactly is fully covered by that colour, never an
 * antialiased edge, which is what criterion 41 asks for.
 */
export async function findExact(page: Page, b64: string, box: Box, rgb: Rgb): Promise<[number, number] | null> {
  return page.evaluate(
    async ([data, r, rect]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const w = Math.min(img.width, Math.ceil(rect.x + rect.width)) - x0;
      const h = Math.min(img.height, Math.ceil(rect.y + rect.height)) - y0;
      if (w <= 0 || h <= 0) return null;
      const d = ctx.getImageData(x0, y0, w, h).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === r[0] && d[i + 1] === r[1] && d[i + 2] === r[2]) {
          const p = i / 4;
          return [x0 + (p % w), y0 + Math.floor(p / w)] as [number, number];
        }
      }
      return null;
    },
    [b64, rgb, box] as const,
  );
}

/** The top edge of the painted liquid, in percent of the layer height, from its clip-path. */
export async function liquidTopPercent(layer: Locator): Promise<number> {
  const clip = await layer.locator('[role="meter"] > div').first().evaluate((el) => getComputedStyle(el).clipPath);
  // Settled: `polygon(0px X%, ...)`. Moving (tilt on): `polygon(0px calc(X% - Ypx), ...)`, X is the mean edge.
  const match = /polygon\(0px (?:calc\()?([-+\d.eE]+)%/.exec(clip);
  if (!match) throw new Error(`no polygon clip-path on the liquid: ${clip}`);
  return Number(match[1]);
}
