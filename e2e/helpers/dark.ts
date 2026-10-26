import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { compositeOver, contrast, readPainted, rgbString, type PaintedReading, type Rgb } from "./painted";

// Task 009 QA helpers. Every ratio these return is composited from computed
// styles or from pixels the browser actually painted; none is arithmetic on
// token strings. Probes are real DOM nodes inside a ground that is itself a
// real element, so they go through the same compositing as the app.

export const THEME_KEY = "pomotato-preferences";
export const TIMER_KEY = "pomotato-timer";
export const DESKTOP = { width: 1280, height: 800 };
export const NARROW = { width: 320, height: 720 };

export type Preference = "light" | "dark" | "system";

/** Stored value written in the zustand envelope, or a raw string for a malformed case. */
export function envelope(theme: Preference): string {
  return JSON.stringify({ state: { theme }, version: 1 });
}

/**
 * Opens `path` with the OS colour scheme set and the preference seeded before the
 * app reads it. `stored` null clears the entry. `raw` writes an arbitrary string.
 */
export async function openThemed(
  page: Page,
  opts: { stored: Preference | null; raw?: string; osDark: boolean; path?: string; viewport?: { width: number; height: number } },
) {
  await page.emulateMedia({ colorScheme: opts.osDark ? "dark" : "light" });
  if (opts.viewport) await page.setViewportSize(opts.viewport);
  await page.goto(opts.path ?? "/");
  await page.evaluate(
    ([key, value]) => {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    },
    [THEME_KEY, opts.raw !== undefined ? opts.raw : opts.stored === null ? null : envelope(opts.stored)] as const,
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/** Waits for in-flight CSS transitions and animations, then a short tail. Frontend's 50 ms reads were mid-fade. */
export async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(400);
}

export function themeRadio(page: Page, label: "Light" | "Dark" | "System"): Locator {
  return page.getByRole("radio", { name: label, exact: true });
}

/** The visible label is the hit target; the radio is sr-only (criterion 37, R-2 precedent). */
export function themeLabel(page: Page, label: "Light" | "Dark" | "System"): Locator {
  const value = label.toLowerCase();
  return page.locator(`label:has(input[name="theme"][value="${value}"])`);
}

export async function htmlHasDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("dark"));
}

/**
 * Paints `html` inside a probe wrapper appended to <body>, reads the element that
 * matches `selector` through the shared painted reader, then removes the probe.
 * The probe sits on the real body, so its ground is the real page ground.
 */
export async function probeReading(page: Page, html: string, selector: string): Promise<PaintedReading> {
  await page.evaluate((markup) => {
    const probe = document.createElement("div");
    probe.id = "qa-probe";
    probe.style.position = "fixed";
    probe.style.top = "0";
    probe.style.left = "0";
    probe.style.zIndex = "2147483647";
    probe.innerHTML = markup;
    document.body.appendChild(probe);
  }, html);
  try {
    return await readPainted(page, page.locator("#qa-probe").locator(selector));
  } finally {
    await page.evaluate(() => document.getElementById("qa-probe")?.remove());
  }
}

export interface PairResult {
  ratio: number;
  fg: Rgb;
  ground: Rgb;
}

/** Text colour `fg` over the ground `ground` (both CSS colour strings, e.g. "var(--card)"). */
export async function textPair(page: Page, ground: string, fg: string): Promise<PairResult> {
  const reading = await probeReading(
    page,
    `<div style="background:${ground};padding:4px"><span class="t" style="color:${fg}">Aa</span></div>`,
    ".t",
  );
  return { ratio: contrast(reading.color, reading.fill), fg: reading.color, ground: reading.fill };
}

/** A 2 px border `edge` drawn on a box sitting on `ground`. Returns the ratio of edge to ground. */
export async function boundaryPair(page: Page, ground: string, edge: string): Promise<PairResult> {
  const reading = await probeReading(
    page,
    `<div style="background:${ground};padding:4px"><span class="b" style="display:inline-block;width:24px;height:24px;border:2px solid ${edge}"></span></div>`,
    ".b",
  );
  if (!reading.borderColor) throw new Error(`border not painted for ${edge} on ${ground}`);
  return { ratio: contrast(reading.borderColor, reading.ground), fg: reading.borderColor, ground: reading.ground };
}

/** Records a measured figure for the QA Report. Annotations survive in the JSON reporter output. */
export function record(testInfo: Pick<TestInfo, "annotations">, label: string, ratio: number, threshold: number) {
  const verdict = ratio >= threshold ? "pass" : "FAIL";
  testInfo.annotations.push({ type: "measure", description: `${label} | ${ratio.toFixed(2)}:1 | floor ${threshold}:1 | ${verdict}` });
}

/** Painted pixels from a real screenshot, decoded in the browser. Points are CSS pixels at DPR 1. */
export async function pixelsAt(page: Page, points: [number, number][]): Promise<Rgb[]> {
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  return page.evaluate(
    async ([b64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      return pts.map(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]] as [number, number, number];
      });
    },
    [png.toString("base64"), points] as const,
  );
}

/** Painted colour of a CSS colour string over a known opaque ground, for pixel comparisons. */
export async function paint(page: Page, fg: string, ground: Rgb): Promise<Rgb> {
  return compositeOver(page, fg, rgbString(ground));
}

/** Luminance-free contrast for two painted triples. */
export function ratio(a: Rgb, b: Rgb): number {
  return contrast(a, b);
}

/** The timer readout (`mm:ss`), the element criterion 21 measures. */
export function readout(page: Page): Locator {
  return page.locator("p.tabular-nums").first();
}

/** Asserts a value is a finite number before it is compared to a floor, so NaN cannot pass. */
export function expectRatio(value: number, floor: number, what: string) {
  expect(Number.isFinite(value), `${what}: ratio is not finite`).toBe(true);
  expect(value, what).toBeGreaterThanOrEqual(floor);
}

/**
 * Seeds one focus session per hour from 09:00 to 13:00 for today, so /stats renders
 * its chart. Same seed shape as e2e/stats.spec.ts. The app must have opened the
 * database first (load / or /stats), or the `sessions` store does not exist yet.
 */
export async function seedStatsSessions(page: Page) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = today.getTime();
  await page.evaluate((base: number) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pomotato");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["sessions"], "readwrite");
        const sessions = tx.objectStore("sessions");
        for (let hour = 9; hour < 14; hour++) {
          const endedAt = base + hour * 60 * 60 * 1000;
          sessions.put({
            id: `qa-${hour}`,
            runId: `qa-run-${hour}`,
            mode: "focus",
            startedAt: endedAt - 25 * 60 * 1000,
            endedAt,
            plannedDurationMs: 25 * 60 * 1000,
            taskId: null,
            taskTitle: null,
          });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, startMs);
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/** Throws if a value is missing. Replaces non-null assertions so a missing node fails loudly. */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}`);
  return value;
}
