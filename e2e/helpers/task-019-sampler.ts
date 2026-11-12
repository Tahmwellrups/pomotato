import type { Page } from "@playwright/test";
import type { Rgb } from "./painted";

// Task 019 painted-pixel sampler. One screenshot, many regions: every region is
// read from the same PNG the browser painted, and each reports its brightest and
// darkest pixel with coordinates, so a figure can name the pixels it came from.
// Reusable by later measurement tasks (CLAUDE.md "Measurement ordering").

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Picked {
  rgb: Rgb;
  x: number;
  y: number;
}

export interface Region {
  brightest: Picked;
  darkest: Picked;
  /** Most frequent colour in the region, with its count. */
  mode: { rgb: Rgb; count: number };
}

/** Takes one screenshot of the page at DPR 1 and samples every named region from it. */
export async function sampleRegions(page: Page, regions: Record<string, Box>): Promise<Record<string, Region>> {
  const png = await page.screenshot({ type: "png", caret: "hide" });
  return page.evaluate(
    async ([b64, boxes]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      const luminance = (r: number, g: number, b: number) => {
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const out: Record<string, Region> = {};
      for (const [name, box] of Object.entries(boxes)) {
        const x0 = Math.max(0, Math.floor(box.x));
        const y0 = Math.max(0, Math.floor(box.y));
        const w = Math.max(1, Math.min(img.width - x0, Math.ceil(box.width)));
        const h = Math.max(1, Math.min(img.height - y0, Math.ceil(box.height)));
        const data = ctx.getImageData(x0, y0, w, h).data;
        let bright = { rgb: [0, 0, 0] as [number, number, number], x: x0, y: y0, l: -1 };
        let dark = { rgb: [0, 0, 0] as [number, number, number], x: x0, y: y0, l: 2 };
        const counts = new Map<string, number>();
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const k = (j * w + i) * 4;
            const r = data[k];
            const g = data[k + 1];
            const b = data[k + 2];
            const l = luminance(r, g, b);
            if (l > bright.l) bright = { rgb: [r, g, b], x: x0 + i, y: y0 + j, l };
            if (l < dark.l) dark = { rgb: [r, g, b], x: x0 + i, y: y0 + j, l };
            const key = `${r},${g},${b}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        let modeKey = "0,0,0";
        let modeCount = 0;
        for (const [key, count] of counts) {
          if (count > modeCount) {
            modeKey = key;
            modeCount = count;
          }
        }
        out[name] = {
          brightest: { rgb: bright.rgb, x: bright.x, y: bright.y },
          darkest: { rgb: dark.rgb, x: dark.x, y: dark.y },
          mode: { rgb: modeKey.split(",").map(Number) as [number, number, number], count: modeCount },
        };
      }
      return out;
    },
    [png.toString("base64"), regions] as const,
  );
}

export function hex(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Computed box of the first element matching the selector, or null. */
export async function boxOf(page: Page, selector: string): Promise<Box | null> {
  const handle = page.locator(selector).first();
  if ((await handle.count()) === 0) return null;
  return handle.boundingBox();
}
