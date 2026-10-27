import { crc32, deflateSync } from "node:zlib";
import { expect, type Locator, type Page } from "@playwright/test";

// Task 010 QA helpers. Every image is generated here, in the test, from pixel
// functions: nothing is committed (criterion 13, 30). Measurement reads real
// screenshots, so the numbers are what a user's screen composites (criterion 15).

export type Rgb = [number, number, number];
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DESKTOP = { width: 1280, height: 800 };
export const NARROW = { width: 320, height: 720 };
export const PREFS_KEY = "pomotato-preferences";
export const TIMER_KEY = "pomotato-timer";
export const MAX_BYTES = 5 * 1024 * 1024;

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A non-interlaced 8-bit RGB PNG from a pixel function. `padBytes` adds a private ancillary chunk of that data size. */
export function makePng(width: number, height: number, pixel: (x: number, y: number) => Rgb, padBytes = 0): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const parts = [SIG, chunk("IHDR", ihdr)];
  if (padBytes > 0) parts.push(chunk("prVt", Buffer.alloc(padBytes)));
  parts.push(chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const AMBER: Rgb = [180, 83, 9]; // --primary in light, amber-700
const SCENE_W = 1280;
const SCENE_H = 800;

/** The six adversarial images of criterion 13, generated at the desktop size. */
export const ADVERSARIAL: Record<string, () => Buffer> = {
  white: () => makePng(SCENE_W, SCENE_H, () => WHITE),
  black: () => makePng(SCENE_W, SCENE_H, () => BLACK),
  "grey 50%": () => makePng(SCENE_W, SCENE_H, () => [128, 128, 128]),
  amber: () => makePng(SCENE_W, SCENE_H, () => AMBER),
  "1px checker": () => makePng(SCENE_W, SCENE_H, (x, y) => ((x + y) % 2 === 0 ? WHITE : BLACK)),
  "split white/black": () => makePng(SCENE_W, SCENE_H, (x) => (x < SCENE_W / 2 ? WHITE : BLACK)),
};

/** Portrait and landscape sources for criterion 27. */
export const PORTRAIT = () => makePng(800, 1280, (x, y) => [x % 256, y % 256, 128]);
export const LANDSCAPE = () => makePng(1600, 900, (x, y) => [x % 256, y % 256, 64]);

/** A valid still PNG of exactly the 5 MiB cap (criterion 29's maximum-size case). */
export function maxSizePng(): Buffer {
  const base = makePng(8, 8, () => WHITE, 0);
  // A private ancillary chunk adds 12 bytes of framing around its data.
  const png = makePng(8, 8, () => WHITE, MAX_BYTES - base.length - 12);
  if (png.length !== MAX_BYTES) throw new Error(`maxSizePng produced ${png.length} bytes`);
  return png;
}

/** A JPEG that passes the structural check (SOI and EOI present) but is not decodable. */
export function junkJpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
}

export async function pickImage(page: Page, buffer: Buffer, name: string, mimeType = "image/png") {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
}

export function statusLine(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: /./ }).first();
}

export async function setPrefs(page: Page, state: { theme: string; gaugeStyle?: string; background?: string | null }) {
  if (!page.url().startsWith("http")) await page.goto("/");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PREFS_KEY, JSON.stringify({ state: { gaugeStyle: "vessel", background: null, ...state }, version: 1 })] as const,
  );
}

export async function prefsRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), PREFS_KEY);
}

export async function timerRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TIMER_KEY);
}

/** Row count of the `backgrounds` store, read straight from IndexedDB (criterion 8: no DOM). 0 when the database does not exist yet. */
export async function backgroundRowCount(page: Page): Promise<number> {
  // Opening without a version creates an empty v1 database, so check that it exists first.
  const exists = await page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === "pomotato"));
  if (!exists) return 0;
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("pomotato");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("backgrounds")) {
            db.close();
            resolve(-1);
            return;
          }
          const count = db.transaction("backgrounds", "readonly").objectStore("backgrounds").count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
}

/** Painted colours inside each rect, read from a real screenshot. Each entry maps "r,g,b" to its pixel count. */
export async function paintedColours(page: Page, rects: Rect[]): Promise<Map<string, number>[]> {
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
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
        const w = Math.min(img.width - x0, Math.ceil(r.w));
        const h = Math.min(img.height - y0, Math.ceil(r.h));
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

export function toRgb(key: string): Rgb {
  const [r, g, b] = key.split(",").map(Number);
  return [r, g, b];
}

/** WCAG 2.x relative luminance and contrast ratio over 8-bit sRGB. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The worst (lowest-contrast) painted colour in a set against `fg`, with its ratio. */
export function worstAgainst(colours: Map<string, number>, fg: Rgb): { ratio: number; pixel: Rgb } {
  let worst = { ratio: Number.POSITIVE_INFINITY, pixel: [0, 0, 0] as Rgb };
  for (const key of colours.keys()) {
    const pixel = toRgb(key);
    const value = contrastRatio(fg, pixel);
    if (value < worst.ratio) worst = { ratio: value, pixel };
  }
  return worst;
}

/** The darkest and lightest painted colour of a set, by relative luminance. */
export function extremes(colours: Map<string, number>): { darkest: Rgb; lightest: Rgb } {
  const keys = [...colours.keys()].map(toRgb);
  const sorted = keys.sort((a, b) => luminance(a) - luminance(b));
  return { darkest: sorted[0], lightest: sorted[sorted.length - 1] };
}

/** A ring `pad` px wide around a rect, excluding the rect itself: the ground next to an element. */
export function ringAround(box: Rect, pad: number): Rect[] {
  return [
    { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: pad },
    { x: box.x - pad, y: box.y + box.h, w: box.w + 2 * pad, h: pad },
    { x: box.x - pad, y: box.y, w: pad, h: box.h },
    { x: box.x + box.w, y: box.y, w: pad, h: box.h },
  ];
}

export function mergeColours(maps: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const map of maps) for (const [key, count] of map) out.set(key, (out.get(key) ?? 0) + count);
  return out;
}

export function fmt(rgb: Rgb): string {
  return `${rgb[0]},${rgb[1]},${rgb[2]}`;
}

/** Picks an image on /settings through the real control and waits for the status line to confirm it. */
export async function chooseOnSettings(page: Page, buffer: Buffer, name: string, mimeType = "image/png") {
  await page.goto("/settings");
  await pickImage(page, buffer, name, mimeType);
  await expect(page.getByRole("status")).toContainText("is now your background");
}

/** Waits until the layer reports active, its opacity has reached 1, and every CSS transition has finished. */
export async function waitActive(page: Page) {
  await expect(page.locator('[data-background="active"]')).toHaveCount(1);
  await expect
    .poll(() => page.locator('[data-background="active"]').evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}
