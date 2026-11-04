import type { Page } from "@playwright/test";
import type { Rect } from "./background";

// Task 012/013 QA sampler: painted colours inside each rect, from ONE plain viewport
// screenshot. This is the only sampler the measurement specs use; background.ts's
// paintedColours delegates here.
//
// It must NOT pass animations: "disabled". That flag cancels infinite animations to their
// INITIAL keyframe, so an element with a live pulse (013's cycle dots) is sampled at its
// pending base colour, not the paint on screen. e2e/sampler-agreement.spec.ts is the guard
// for this trap. Pixels are read at the integer device pixel that contains each rect's
// origin, so callers pass integer rects for full-coverage reads.
export async function groundPixels(page: Page, rects: Rect[]): Promise<Map<string, number>[]> {
  const png = await page.screenshot({ type: "png", caret: "hide" });
  const raw = await page.evaluate(
    async ([b64, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      return list.map((r) => {
        const x0 = Math.max(0, Math.floor(r.x));
        const y0 = Math.max(0, Math.floor(r.y));
        const w = Math.min(img.width - x0, Math.max(1, Math.ceil(r.w)));
        const h = Math.min(img.height - y0, Math.max(1, Math.ceil(r.h)));
        if (w <= 0 || h <= 0) return [] as [string, number][];
        const data = ctx.getImageData(x0, y0, w, h).data;
        const counts = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts.entries()];
      });
    },
    [png.toString("base64"), rects] as const,
  );
  return raw.map((entries) => new Map(entries));
}

/**
 * Clips each ring side to the whole pixels inside the surface it must stay within (task 012
 * round 2 ruling). A ring that crosses the surface edge reads the photograph beyond it, so a side
 * is measured only where it lies inside the surface. A side with no pixel left inside throws:
 * silently keeping it would measure a different ground.
 */
export function clipToSurface(sides: Rect[], surface: Rect, label: string): Rect[] {
  const sx0 = Math.ceil(surface.x);
  const sy0 = Math.ceil(surface.y);
  const sx1 = Math.floor(surface.x + surface.w);
  const sy1 = Math.floor(surface.y + surface.h);
  return sides.map((side, i) => {
    const x0 = Math.max(Math.round(side.x), sx0);
    const y0 = Math.max(Math.round(side.y), sy0);
    const x1 = Math.min(Math.round(side.x + side.w), sx1);
    const y1 = Math.min(Math.round(side.y + side.h), sy1);
    if (x1 <= x0 || y1 <= y0) {
      throw new Error(`${label}: ring side ${i} has no pixel inside its surface (side ${JSON.stringify(side)}, surface ${JSON.stringify(surface)})`);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
}
