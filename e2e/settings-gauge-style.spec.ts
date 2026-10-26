import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { DESKTOP, NARROW, THEME_KEY, record } from "./helpers/dark";
import { contrast, readPainted, tokenRgb, type Rgb } from "./helpers/painted";
import { readTimerState, seedTimerState, TIMER_STORAGE_KEY, holdResetWithPointer } from "./helpers/timer-hold";

// Task 008 e2e: the /settings surface, the gauge-style preference, and the in-digits
// rendering. Ratios come from decoded screenshots, and each classifier has a positive control.

type Theme = "light" | "dark";
type Style = "vessel" | "glyph";
type Status = "idle" | "running" | "paused" | "complete";

const LEVELS = [100, 75, 50, 25, 0] as const;
const FULL_CUSTOM_MS = 60_000;

const gauge = (page: Page) => page.getByTestId("timer-gauge");
const readout = (page: Page) => page.locator('[data-testid="timer-gauge"] + p');
const frameOf = (page: Page) => page.locator('[data-testid="timer-gauge"]').locator("xpath=..");
const settingsLink = (page: Page) => page.getByRole("link", { name: "Settings", exact: true });
const backLink = (page: Page) => page.getByRole("link", { name: "Back to the timer", exact: true });
const optionLabel = (page: Page, style: Style) =>
  page.locator("label", { hasText: style === "vessel" ? "Vessel" : "In the digits" });
const optionRadio = (page: Page, style: Style) =>
  page.getByRole("radio", { name: style === "vessel" ? /^Vessel/ : /^In the digits/ });

interface TimerSeed {
  status: Status;
  mode?: "focus" | "custom";
  customMinutes?: number;
  endInMs?: number;
  pausedRemainingMs?: number;
}

function timerOverrides(seed: TimerSeed) {
  const now = Date.now();
  const base = { mode: seed.mode ?? "focus", customMinutes: seed.customMinutes ?? 25 };
  if (seed.status === "running") {
    return { ...base, status: "running" as const, endTimestamp: now + (seed.endInMs ?? 300_000), startedAt: now, runId: "qa-run-running", pausedRemainingMs: null };
  }
  if (seed.status === "paused") {
    return { ...base, status: "paused" as const, endTimestamp: null, pausedRemainingMs: seed.pausedRemainingMs ?? 90_000, startedAt: now, runId: "qa-run-paused" };
  }
  if (seed.status === "complete") {
    return { ...base, status: "complete" as const, endTimestamp: null, pausedRemainingMs: null, startedAt: null, runId: null };
  }
  return { ...base, status: "idle" as const, endTimestamp: null, pausedRemainingMs: null, startedAt: null, runId: null };
}

/** Seeds the preference (and optionally the timer) at origin, then loads `path`. */
async function open(
  page: Page,
  opts: { theme?: Theme; style?: Style; timer?: TimerSeed; viewport?: { width: number; height: number }; path?: string; raw?: string } = {},
) {
  const theme = opts.theme ?? "light";
  const style = opts.style ?? "vessel";
  await page.emulateMedia({ colorScheme: theme });
  if (opts.viewport) await page.setViewportSize(opts.viewport);
  await page.goto("/");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [THEME_KEY, opts.raw ?? JSON.stringify({ state: { theme, gaugeStyle: style }, version: 1 })] as const,
  );
  if (opts.timer) await seedTimerState(page, timerOverrides(opts.timer));
  await page.goto(opts.path ?? "/");
  await page.waitForLoadState("networkidle");
  if ((opts.path ?? "/") === "/") {
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", style);
  }
}

function collectConsole(page: Page): string[] {
  const bad: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") bad.push(`${message.type()}: ${message.text()}`);
  });
  return bad;
}

async function readSessionCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("pomotato");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("sessions")) {
            db.close();
            resolve(0);
            return;
          }
          const query = db.transaction(["sessions"], "readonly").objectStore("sessions").count();
          query.onsuccess = () => {
            db.close();
            resolve(query.result);
          };
          query.onerror = () => reject(query.error);
        };
      }),
  );
}

async function setSurface(page: Page, value: number) {
  await page.evaluate((v) => {
    const frame = document.querySelector('[data-testid="timer-gauge"]')?.parentElement;
    if (!frame) throw new Error("gauge frame not found");
    frame.style.setProperty("--gauge-surface", String(v));
  }, value);
  await expect
    .poll(() => page.evaluate(() => document.querySelector('[data-testid="timer-gauge"]')?.parentElement?.style.getPropertyValue("--gauge-surface") ?? ""))
    .toBe(String(value));
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`);
}

// Pixel classifier shared by the glyph measurements

interface Pix {
  w: number;
  h: number;
  data: number[];
}

async function digitPixels(page: Page): Promise<Pix> {
  const png = await readout(page).screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    return { w: canvas.width, h: canvas.height, data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
  }, png.toString("base64"));
}

function at(p: Pix, x: number, y: number): Rgb {
  const i = (y * p.w + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
}

function chebyshev(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** Mean of the four 3x3 corner blocks: the painted ground around the digits (grain averaged out). */
function groundOf(p: Pix): Rgb {
  const blocks: [number, number][] = [
    [0, 0],
    [p.w - 3, 0],
    [0, p.h - 3],
    [p.w - 3, p.h - 3],
  ];
  const sum: Rgb = [0, 0, 0];
  let n = 0;
  for (const [bx, by] of blocks) {
    for (let y = by; y < by + 3; y++) {
      for (let x = bx; x < bx + 3; x++) {
        const c = at(p, x, y);
        sum[0] += c[0];
        sum[1] += c[1];
        sum[2] += c[2];
        n++;
      }
    }
  }
  return [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)];
}

interface GlyphReading {
  ground: Rgb;
  accent: Rgb;
  muted: Rgb;
  edgeY: number | null;
  filled: { n: number; ratio: number | null };
  unfilled: { n: number; ratio: number | null };
  band: { n: number; ratio: number | null };
}

/**
 * Splits the painted digits at the gradient stop. Only hard accent or muted pixels count,
 * so anti-aliased outlines near the ground cannot pass as ink.
 */
function readGlyph(p: Pix, accent: Rgb, muted: Rgb, level: number): GlyphReading {
  const ground = groundOf(p);
  const pct = 14 + 0.7 * level; // stop position, percent from the bottom of the box
  const edgeY = level === 100 || level === 0 ? null : p.h * (1 - pct / 100);
  const filled: Rgb[] = [];
  const unfilled: Rgb[] = [];
  const band: Rgb[] = [];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const c = at(p, x, y);
      const isAccent = chebyshev(c, accent) <= 8;
      const isMuted = chebyshev(c, muted) <= 8;
      if (!isAccent && !isMuted) continue;
      if (edgeY !== null && Math.abs(y + 0.5 - edgeY) <= 2) {
        band.push(c);
      } else if (isAccent && (edgeY === null || y + 0.5 > edgeY)) {
        filled.push(c);
      } else if (isMuted && (edgeY === null || y + 0.5 < edgeY)) {
        unfilled.push(c);
      }
    }
  }
  const meanOf = (cs: Rgb[]): Rgb => {
    const s: Rgb = [0, 0, 0];
    for (const c of cs) {
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
    }
    return [Math.round(s[0] / cs.length), Math.round(s[1] / cs.length), Math.round(s[2] / cs.length)];
  };
  const side = (cs: Rgb[]) => ({ n: cs.length, ratio: cs.length === 0 ? null : contrast(meanOf(cs), ground) });
  const bandRatio = band.length === 0 ? null : Math.min(...band.map((c) => contrast(c, ground)));
  return {
    ground,
    accent,
    muted,
    edgeY,
    filled: side(filled),
    unfilled: side(unfilled),
    band: { n: band.length, ratio: bandRatio },
  };
}

/** Ink against whatever is painted: any pixel far from the ground, measured at its extreme. */
function inkExtreme(p: Pix): { ink: number; maxRatio: number } {
  const ground = groundOf(p);
  let ink = 0;
  let maxRatio = 1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const c = at(p, x, y);
      if (chebyshev(c, ground) < 40) continue;
      ink++;
      maxRatio = Math.max(maxRatio, contrast(c, ground));
    }
  }
  return { ink, maxRatio };
}

// Entry point on /

test.describe("criterion 13: one settings control on /, real link, 44 px, focus ring", () => {
  for (const viewport of [NARROW, DESKTOP]) {
    test(`at ${viewport.width}px exactly one Settings link, at least 44x44`, async ({ page }) => {
      await open(page, { viewport });
      await expect(settingsLink(page)).toHaveCount(1);
      await expect(page.getByRole("button", { name: /settings/i })).toHaveCount(0);
      const box = await settingsLink(page).boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
  }

  // Settings and Focus stats share one indicator. Asserting both keeps the pair from diverging again.
  const entryButtons: [string, string][] = [
    ["Settings", "Settings"],
    ["Focus stats", "Focus stats"],
  ];
  for (const [name] of entryButtons) {
    test(`${name} button: keyboard focus paints a 2 px outline at 2 px offset in --ring`, async ({ page }) => {
      await open(page);
      const button = page.getByRole("link", { name, exact: true });
      for (let i = 0; i < 60; i++) {
        if (await button.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press("Tab");
      }
      await expect(button).toBeFocused();
      const reading = await readPainted(page, button);
      expect(reading.outlineStyle).toBe("solid");
      expect(reading.outlineWidth).toBe("2px");
      expect(reading.outlineOffset).toBe("2px");
      expect(reading.outlineColor).toEqual(await tokenRgb(page, "--ring"));
    });
  }
});

// Surface structure and keyboard

test.describe("criterion 19, 23: the surface is a main with one h1, a native radio group, and no theme control", () => {
  test("/settings: one main, one h1, a fieldset legend and two native radios; no theme input", async ({ page }) => {
    await open(page, { path: "/settings" });
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("Settings");
    await expect(page.locator("fieldset legend")).toHaveText("Timer gauge");
    await expect(page.locator('input[type="radio"][name="gauge-style"]')).toHaveCount(2);
    expect(await page.evaluate(() => document.querySelectorAll('input[name="theme"]').length)).toBe(0);
  });

  test("every interactive element on /settings acts: the back link and both radios, nothing else", async ({ page }) => {
    await open(page, { path: "/settings" });
    const names = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].map(
        (el) => `${el.tagName.toLowerCase()}:${(el as HTMLInputElement).type ?? ""}:${el.textContent?.trim() ?? el.getAttribute("aria-label") ?? ""}`,
      ),
    );
    expect(names.sort()).toEqual(
      ["a::Back to the timer", "input:radio:", "input:radio:"].sort(),
    );
    await backLink(page).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("keyboard only: Tab enters the group once on the checked radio, arrows change it, the back link returns", async ({ page }) => {
    await open(page, { path: "/settings", style: "vessel" });
    await backLink(page).focus();
    await page.keyboard.press("Tab");
    await expect(optionRadio(page, "vessel")).toBeFocused();
    await expect(optionRadio(page, "vessel")).toBeChecked();
    await page.keyboard.press("ArrowDown");
    await expect(optionRadio(page, "glyph")).toBeChecked();
    await expect(optionRadio(page, "glyph")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(optionRadio(page, "glyph")).not.toBeFocused();
    await backLink(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "glyph");
  });

  test("the surface's entry is reachable from / by keyboard, and browser Back returns to /", async ({ page }) => {
    await open(page);
    await settingsLink(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
  });
});

test.describe("criterion 19, 20: labels say what each option does", () => {
  test("the group label is visible and each option states its behaviour", async ({ page }) => {
    await open(page, { path: "/settings" });
    await expect(page.locator("fieldset legend")).toBeVisible();
    const glyph = optionLabel(page, "glyph");
    await expect(glyph).toContainText("At full and at empty they are one flat colour, so no level shows then.");
    const vessel = optionLabel(page, "vessel");
    await expect(vessel).toContainText("The level shows the whole way down, including at full and at empty.");
  });
});

// Persistence and the real timer

test.describe("criterion 24: a chosen option reaches the real timer and survives reload and a new tab", () => {
  test("fresh visitor gets the vessel, picks the in-digits option, and it persists", async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "vessel");
    await settingsLink(page).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(optionRadio(page, "vessel")).toBeChecked();
    await optionLabel(page, "glyph").click();
    await expect(optionRadio(page, "glyph")).toBeChecked();
    await backLink(page).click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "glyph");
    await page.reload();
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "glyph");
    const tab = await context.newPage();
    await tab.goto("/");
    await expect(gauge(tab)).toHaveAttribute("data-gauge-style", "glyph");
    await tab.close();
  });

  test("the stored entry is one key whose state holds exactly theme and gaugeStyle", async ({ page }) => {
    await open(page, { path: "/settings", style: "vessel" });
    await optionLabel(page, "glyph").click();
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), THEME_KEY);
    const parsed = JSON.parse(raw ?? "null") as { state: Record<string, unknown>; version: number };
    expect(Object.keys(parsed).sort()).toEqual(["state", "version"]);
    expect(Object.keys(parsed.state).sort()).toEqual(["gaugeStyle", "theme"]);
    expect(parsed.state.gaugeStyle).toBe("glyph");
    expect(parsed.version).toBe(1);
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb|oklch|class/i);
  });
});

test.describe("criterion 16, 25: the trip and a mid-session change leave the timer untouched", () => {
  for (const status of ["running", "paused"] as const) {
    test(`${status}: navigating to /settings, changing the option and returning changes no timer state`, async ({ page }) => {
      await open(page, { timer: { status } });
      const before = await page.evaluate((key) => window.localStorage.getItem(key), TIMER_STORAGE_KEY);
      const readoutBefore = await readout(page).textContent();
      const levelBefore = await gauge(page).getAttribute("data-gauge-level");
      const sessionsBefore = await readSessionCount(page);

      await settingsLink(page).click();
      await expect(page).toHaveURL(/\/settings$/);
      await optionLabel(page, "glyph").click();
      await expect(optionRadio(page, "glyph")).toBeChecked();
      await backLink(page).click();
      await expect(gauge(page)).toHaveAttribute("data-gauge-style", "glyph");

      const after = await page.evaluate((key) => window.localStorage.getItem(key), TIMER_STORAGE_KEY);
      expect(after).toBe(before);
      expect(await readout(page).textContent()).toBe(readoutBefore);
      expect(await gauge(page).getAttribute("data-gauge-level")).toBe(levelBefore);
      expect(await readSessionCount(page)).toBe(sessionsBefore);
      expect((await readTimerState(page))?.status).toBe(status);
    });
  }

  test("running: remaining time is continuous across the trip and a browser Back", async ({ page }) => {
    await open(page, { timer: { status: "running", endInMs: 120_000 } });
    const before = await readTimerState(page);
    await settingsLink(page).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.waitForTimeout(1200);
    await page.goBack();
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
    const after = await readTimerState(page);
    expect(after).toEqual(before);
    const expected = Math.max(0, (before?.endTimestamp ?? 0) - Date.now());
    const [mm, ss] = (await readout(page).textContent() ?? "").split(":").map(Number);
    expect(Math.abs((mm * 60 + ss) * 1000 - expected)).toBeLessThan(1500);
    await expect(readout(page)).not.toHaveText("00:00");
  });
});

// Layout, axe, and the cluster

test.describe("criterion 45, 27: /settings in both themes, 320 and 1280 px", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of [NARROW, DESKTOP]) {
      test(`${theme} at ${viewport.width}px: no serious axe violation, no horizontal scroll, controls >= 44 px`, async ({ page }) => {
        await open(page, { theme, viewport, path: "/settings" });
        expect(await seriousViolations(page)).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        for (const locator of [backLink(page), optionLabel(page, "vessel"), optionLabel(page, "glyph")]) {
          const box = await locator.boundingBox();
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
      });
    }
  }
});

test.describe("criterion 27: / with each option in each status, both themes, both viewports", () => {
  const statuses: Status[] = ["idle", "running", "paused", "complete"];
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of [NARROW, DESKTOP]) {
      for (const style of ["vessel", "glyph"] as const) {
        for (const status of statuses) {
          test(`${theme} ${viewport.width}px ${style} ${status}: axe clean, cluster 44 px and on one row, no overflow`, async ({ page }) => {
            const bad = collectConsole(page);
            await open(page, { theme, style, viewport, timer: { status, pausedRemainingMs: 90_000 } });
            expect(await seriousViolations(page)).toEqual([]);
            const cluster = await page.evaluate(() => {
              const link = document.querySelector<HTMLElement>('a[aria-label="Settings"]');
              const container = link?.closest<HTMLElement>(".fixed");
              if (!container) return null;
              const controls = [...container.querySelectorAll<HTMLElement>("a, button")].map((el) => el.getBoundingClientRect());
              return {
                count: controls.length,
                minW: Math.min(...controls.map((r) => r.width)),
                minH: Math.min(...controls.map((r) => r.height)),
                tops: [...new Set(controls.map((r) => Math.round(r.top)))],
                overflow: container.scrollWidth - container.clientWidth,
                left: Math.min(...controls.map((r) => r.left)),
              };
            });
            expect(cluster).not.toBeNull();
            expect(cluster?.count ?? 0).toBeGreaterThanOrEqual(3);
            expect(cluster?.minW ?? 0).toBeGreaterThanOrEqual(44);
            expect(cluster?.minH ?? 0).toBeGreaterThanOrEqual(44);
            expect(cluster?.tops.length ?? 0).toBe(1);
            expect(cluster?.overflow ?? 1).toBeLessThanOrEqual(0);
            expect(cluster?.left ?? -1).toBeGreaterThanOrEqual(0);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
            expect(await page.locator("main").count()).toBe(1);
            expect(await page.locator("h1").count()).toBe(1);
            expect(bad).toEqual([]);
          });
        }
      }
    }
  }
});

// Glyph contrast, measured on painted pixels (criterion 32)

/** Records one side of the digits. An absent side (no pixels) is noted, not asserted here. */
function noteSide(testInfo: TestInfo, label: string, side: { n: number; ratio: number | null }) {
  if (side.ratio === null) {
    testInfo.annotations.push({ type: "measure", description: `${label} | absent (n=0), see the flat-colour tests` });
    return;
  }
  record(testInfo, `${label} (n=${side.n})`, side.ratio, 4.5);
}

test.describe("criterion 32: in-digits option, painted contrast per level, per theme", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: filled, unfilled and waterline against the painted ground at 100, 75, 50, 25, 0`, async ({ page }, testInfo: TestInfo) => {
      await open(page, { theme, style: "glyph" });
      const accent = await tokenRgb(page, "--accent-foreground");
      const muted = await tokenRgb(page, "--muted-foreground");
      for (const level of LEVELS) {
        await setSurface(page, level);
        const r = readGlyph(await digitPixels(page), accent, muted, level);
        const label = `glyph ${theme} level ${level}`;
        noteSide(testInfo, `${label} filled`, r.filled);
        noteSide(testInfo, `${label} unfilled`, r.unfilled);
        noteSide(testInfo, `${label} waterline`, { n: r.band.n, ratio: r.band.ratio });
        // A missing side passes here. The flat-colour tests below require it to be missing.
        expect.soft(r.filled.ratio ?? 4.5, `${label} filled`).toBeGreaterThanOrEqual(4.5);
        expect.soft(r.unfilled.ratio ?? 4.5, `${label} unfilled`).toBeGreaterThanOrEqual(4.5);
        expect.soft(r.band.ratio ?? 4.5, `${label} waterline`).toBeGreaterThanOrEqual(4.5);
      }
    });

    test(`${theme}: at full the digits are one flat colour (expected per criterion 20, measured)`, async ({ page }) => {
      await open(page, { theme, style: "glyph" });
      const accent = await tokenRgb(page, "--accent-foreground");
      const muted = await tokenRgb(page, "--muted-foreground");
      await setSurface(page, 100);
      const r = readGlyph(await digitPixels(page), accent, muted, 100);
      // Measured: a 2 px muted cap at the top of the digits. Contrast is still >= 4.5.
      expect(r.unfilled.n, "muted pixels at level 100").toBe(0);
    });

    test(`${theme}: at empty the digits are one flat colour (expected per criterion 20, measured)`, async ({ page }) => {
      await open(page, { theme, style: "glyph" });
      const accent = await tokenRgb(page, "--accent-foreground");
      const muted = await tokenRgb(page, "--muted-foreground");
      await setSurface(page, 0);
      const r = readGlyph(await digitPixels(page), accent, muted, 0);
      expect(r.filled.n, "accent pixels at level 0").toBe(0);
    });

    test(`${theme}: classifier positive control, both sides and a waterline present at 50`, async ({ page }) => {
      await open(page, { theme, style: "glyph" });
      const accent = await tokenRgb(page, "--accent-foreground");
      const muted = await tokenRgb(page, "--muted-foreground");
      await setSurface(page, 50);
      const r = readGlyph(await digitPixels(page), accent, muted, 50);
      expect(r.filled.n).toBeGreaterThan(50);
      expect(r.unfilled.n).toBeGreaterThan(50);
      expect(r.band.n).toBeGreaterThan(0);
    });
  }
});

// Forced colours and missing backgrounds (criterion 31)

test.describe("criterion 31: the digits stay visible under forced colours and without background images", () => {
  test("detector positive control: the normal glyph render shows ink well above the ground", async ({ page }) => {
    await open(page, { theme: "light", style: "glyph" });
    const pix = await digitPixels(page);
    const { ink, maxRatio } = inkExtreme(pix);
    expect(ink).toBeGreaterThan(200);
    expect(maxRatio).toBeGreaterThanOrEqual(4.5);
  });

  // Our fallback is `forced-colors:hidden` on the overlay host. Pixels cannot show it,
  // because Chromium's forced-colour override paints the digits either way.
  test("forced-colors: the two-tone overlay is dropped and the solid digits remain (display-based, not pixels)", async ({ page }) => {
    await open(page, { theme: "light", style: "glyph" });
    const overlayDisplay = () =>
      readout(page).evaluate((el) => {
        const host = el.querySelector<HTMLElement>("span[aria-hidden='true'][data-time]");
        return host ? getComputedStyle(host).display : "no-host";
      });
    // Positive control: outside forced colours the overlay host is displayed.
    expect(await overlayDisplay()).not.toBe("none");
    await page.emulateMedia({ forcedColors: "active", colorScheme: "light" });
    await expect.poll(overlayDisplay).toBe("none");
    // The solid digits are still a painted text layer in a real colour, not transparent.
    const digitColour = await readout(page).evaluate((el) => getComputedStyle(el).color);
    expect(digitColour).not.toMatch(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/);
    const pix = await digitPixels(page);
    const { ink, maxRatio } = inkExtreme(pix);
    expect(ink).toBeGreaterThan(200);
    expect(maxRatio).toBeGreaterThanOrEqual(4.5);
  });

  test("forced-colors active: vessel digits stay legible too (pair)", async ({ page }) => {
    await open(page, { theme: "light", style: "vessel" });
    await page.emulateMedia({ forcedColors: "active", colorScheme: "light" });
    await page.waitForTimeout(200);
    const pix = await digitPixels(page);
    const { ink, maxRatio } = inkExtreme(pix);
    expect(ink).toBeGreaterThan(200);
    expect(maxRatio).toBeGreaterThanOrEqual(3);
  });

  test("background images unavailable: glyph digits stay visible (solid text layer, overlay only lost)", async ({ page }) => {
    await open(page, { theme: "light", style: "glyph" });
    await page.addStyleTag({ content: "*, *::before, *::after { background-image: none !important; }" });
    await page.waitForTimeout(200);
    const pix = await digitPixels(page);
    const { ink, maxRatio } = inkExtreme(pix);
    expect(ink, "painted digit pixels that differ from the ground").toBeGreaterThan(200);
    expect(maxRatio).toBeGreaterThanOrEqual(3);
  });

  test("background images unavailable: vessel digits stay visible (pair)", async ({ page }) => {
    await open(page, { theme: "light", style: "vessel" });
    await page.addStyleTag({ content: "*, *::before, *::after { background-image: none !important; }" });
    await page.waitForTimeout(200);
    const pix = await digitPixels(page);
    const { ink, maxRatio } = inkExtreme(pix);
    expect(ink).toBeGreaterThan(200);
    expect(maxRatio).toBeGreaterThanOrEqual(3);
  });
});

// Reduced motion, idle loops, readout (criteria 29, 34, 40)

test.describe("criterion 29: the readout is the single real-text source of truth for both options", () => {
  for (const style of ["vessel", "glyph"] as const) {
    test(`${style}: gauge is aria-hidden, carries no digits, and the mm:ss text appears once`, async ({ page }) => {
      await open(page, { style, timer: { status: "running" } });
      await expect(gauge(page)).toHaveAttribute("aria-hidden", "true");
      const gaugeText = await gauge(page).textContent();
      expect(gaugeText ?? "").not.toMatch(/\d/);
      const text = (await readout(page).textContent()) ?? "";
      expect(text).toMatch(/^\d{2}:\d{2}$/);
      const bodyText = await page.locator("main").innerText();
      expect(bodyText.split(text).length - 1).toBe(1);
    });
  }

  test("the digits keep the same box in both options, so the glyph fill does not reflow the readout", async ({ page }) => {
    await open(page, { style: "vessel" });
    const vessel = await readout(page).boundingBox();
    await open(page, { style: "glyph" });
    const glyph = await readout(page).boundingBox();
    expect(glyph).toEqual(vessel);
  });
});

test.describe("criterion 34: reduced motion still tracks the level, with lean suppressed (default-motion pair)", () => {
  for (const motion of ["reduce", "no-preference"] as const) {
    test(`${motion}: the level follows the derived remaining time for both options`, async ({ page }) => {
      for (const style of ["vessel", "glyph"] as const) {
        await page.emulateMedia({ reducedMotion: motion, colorScheme: "light" });
        await open(page, { style, timer: { status: "running", mode: "custom", customMinutes: 1, endInMs: 30_000 } });
        const sampleLevel = async () => {
          const state = await readTimerState(page);
          const level = Number(await gauge(page).getAttribute("data-gauge-level"));
          return { level, expected: ((state?.endTimestamp ?? 0) - Date.now()) / FULL_CUSTOM_MS * 100 };
        };
        const samples = [await sampleLevel()];
        await page.waitForTimeout(2500);
        samples.push(await sampleLevel());
        for (const s of samples) expect(Math.abs(s.level - s.expected), `${style} ${motion}`).toBeLessThanOrEqual(3);
        expect(samples[1].level).toBeLessThan(samples[0].level);
      }
    });
  }

  test("reduce: glyph lean stays zero through a pause, default motion does move it (positive control)", async ({ page }) => {
    const leans = async (motion: "reduce" | "no-preference") => {
      await page.emulateMedia({ reducedMotion: motion, colorScheme: "light" });
      await open(page, { style: "glyph", timer: { status: "running", mode: "custom", customMinutes: 1, endInMs: 30_000 } });
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const seen: number[] = [];
      for (let i = 0; i < 8; i++) {
        seen.push(
          parseFloat(
            await frameOf(page).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--gauge-lean") || "0"),
          ),
        );
        await page.waitForTimeout(150);
      }
      return seen;
    };
    const reduced = await leans("reduce");
    expect(reduced.every((v) => v === 0)).toBe(true);
    const moving = await leans("no-preference");
    expect(moving.some((v) => Math.abs(v) > 0)).toBe(true);
  });
});

test.describe("criterion 40: no perpetual idle loop, per option", () => {
  const statuses: Status[] = ["idle", "paused", "complete"];
  for (const style of ["vessel", "glyph"] as const) {
    for (const status of statuses) {
      test(`${style} ${status}: zero requestAnimationFrame callbacks in the second after a 1 s settle`, async ({ page }) => {
        await open(page, { style, timer: { status, pausedRemainingMs: 90_000 } });
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
          const w = window as Window & { __raf?: number };
          w.__raf = 0;
          const original = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb: FrameRequestCallback) => {
            w.__raf = (w.__raf ?? 0) + 1;
            return original(cb);
          };
        });
        await page.waitForTimeout(1000);
        const count = await page.evaluate(() => (window as Window & { __raf?: number }).__raf ?? 0);
        expect(count).toBe(0);
      });
    }
    test(`${style} running: requestAnimationFrame is active (positive control)`, async ({ page }) => {
      await open(page, { style, timer: { status: "running" } });
      await page.evaluate(() => {
        const w = window as Window & { __raf?: number };
        w.__raf = 0;
        const original = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb: FrameRequestCallback) => {
          w.__raf = (w.__raf ?? 0) + 1;
          return original(cb);
        };
      });
      await page.waitForTimeout(1000);
      expect(await page.evaluate(() => (window as Window & { __raf?: number }).__raf ?? 0)).toBeGreaterThan(0);
    });
  }
});

// Accessibility tree: the time is announced once (the doubled-readout regression)

test.describe("accessibility tree: the time is exposed exactly once", () => {
  /** Non-ignored StaticText names in the full AX tree, read over CDP. */
  async function staticTextNames(page: Page): Promise<string[]> {
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
      nodes: { ignored?: boolean; role?: { value?: string }; name?: { value?: string } }[];
    };
    await cdp.detach();
    return nodes
      .filter((n) => n.ignored !== true && n.role?.value === "StaticText")
      .map((n) => n.name?.value ?? "");
  }

  for (const style of ["vessel", "glyph"] as const) {
    test(`${style}: the mm:ss readout is one StaticText in the accessibility tree`, async ({ page }) => {
      await open(page, { style, timer: { status: "running", endInMs: 125_000 } });
      const time = ((await readout(page).textContent()) ?? "").trim();
      expect(time).toMatch(/^\d{2}:\d{2}$/);
      const names = await staticTextNames(page);
      // Positive control: the readout is exposed at all.
      expect(names).toContain(time);
      expect(names.filter((name) => name === time)).toHaveLength(1);
    });
  }
});

// The spring moves the drawn level, in both renderings (criterion 52)

/**
 * One reading per animation frame for `ms` milliseconds. Runs in the page, so it
 * is self-contained: the drawn level is the glyph surface, or the vessel
 * clip-path's top percentage (100 = full).
 */
function sampleDrawnLevel([kind, ms]: [Style, number]): Promise<number[]> {
  const read = (): number => {
    if (kind === "glyph") {
      const frame = document.querySelector('[data-testid="timer-gauge"]')?.parentElement as HTMLElement | undefined;
      return parseFloat(frame?.style.getPropertyValue("--gauge-surface") || "NaN");
    }
    const liquid = document.querySelector('[data-testid="timer-gauge"] [role="meter"] > div') as HTMLElement | null;
    const clip = liquid ? getComputedStyle(liquid).clipPath : "";
    const match = /calc\(([-\d.]+)%/.exec(clip) ?? /polygon\(0px ([-\d.]+)%/.exec(clip);
    return match ? 100 - parseFloat(match[1]) : NaN;
  };
  return new Promise((resolve) => {
    const out: number[] = [];
    const started = performance.now();
    const tick = () => {
      out.push(read());
      if (performance.now() - started < ms) requestAnimationFrame(tick);
      else resolve(out);
    };
    requestAnimationFrame(tick);
  });
}

/** The same drawn-level read, once, in the page. */
function readDrawnLevel(kind: Style): number {
  if (kind === "glyph") {
    const frame = document.querySelector('[data-testid="timer-gauge"]')?.parentElement as HTMLElement | undefined;
    return parseFloat(frame?.style.getPropertyValue("--gauge-surface") || "NaN");
  }
  const liquid = document.querySelector('[data-testid="timer-gauge"] [role="meter"] > div') as HTMLElement | null;
  const clip = liquid ? getComputedStyle(liquid).clipPath : "";
  const match = /calc\(([-\d.]+)%/.exec(clip) ?? /polygon\(0px ([-\d.]+)%/.exec(clip);
  return match ? 100 - parseFloat(match[1]) : NaN;
}

test.describe("criterion 52: a level change is drawn through several frames and settles, for both options", () => {
  for (const style of ["vessel", "glyph"] as const) {
    test(`${style}: switching from Custom (about half) to Focus (full) is drawn over several frames and settles`, async ({ page }) => {
      await open(page, { style, timer: { status: "running", mode: "custom", customMinutes: 1, endInMs: 30_000 } });
      await page.waitForTimeout(300);
      const before = await page.evaluate(readDrawnLevel, style);
      expect(Number.isNaN(before), `${style}: a drawn level exists before the switch`).toBe(false);
      await page.locator('input[name="timer-mode"][value="focus"]').check({ force: true });
      const frames = (await page.evaluate(sampleDrawnLevel, [style, 1200] as [Style, number])).filter((v) => Number.isFinite(v));
      const distinct = new Set(frames.map((v) => v.toFixed(2))).size;
      // Drawn through several distinct frames, not a single jump and not frozen.
      expect(distinct, `${style}: distinct drawn levels across the switch`).toBeGreaterThanOrEqual(3);
      // And it lands on the new level (full).
      expect(Math.abs((frames[frames.length - 1] ?? NaN) - 100), `${style}: settled drawn level`).toBeLessThanOrEqual(1);
    });
  }
});

// Console, hydration, logging (criteria 10, 48, 49)

test.describe("criteria 10, 49: zero console errors or warnings on the settings flow, both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: load /, open settings, change, return, reload, start, pause, resume`, async ({ page }) => {
      const bad = collectConsole(page);
      await open(page, { theme });
      await settingsLink(page).click();
      await optionLabel(page, "glyph").click();
      await backLink(page).click();
      await expect(page).toHaveURL(/\/$/);
      await page.reload();
      await expect(gauge(page)).toHaveAttribute("data-gauge-style", "glyph");
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await page.waitForTimeout(500);
      expect(bad).toEqual([]);
    });
  }

  for (const style of ["vessel", "glyph"] as const) {
    for (const status of ["idle", "running", "paused"] as const) {
      test(`hydration: ${style} ${status} on / and /settings logs nothing`, async ({ page }) => {
        const bad = collectConsole(page);
        await open(page, { style, timer: { status } });
        await page.goto("/settings");
        await page.waitForLoadState("networkidle");
        expect(bad.filter((line) => /hydrat/i.test(line))).toEqual([]);
        expect(bad).toEqual([]);
      });
    }
  }
});

test.describe("criterion 48: a completed run logs exactly one session row under both options, a reset run logs none", () => {
  for (const style of ["vessel", "glyph"] as const) {
    test(`${style}: completion logs one row and does not double-count`, async ({ page }) => {
      await open(page, { style, timer: { status: "running", endInMs: 1500 } });
      const before = await readSessionCount(page);
      await expect(readout(page)).toHaveText("00:00", { timeout: 10_000 });
      await expect.poll(() => readSessionCount(page), { timeout: 5000 }).toBe(before + 1);
      await page.waitForTimeout(1500);
      expect(await readSessionCount(page)).toBe(before + 1);
    });

    test(`${style}: a reset run logs no session row`, async ({ page }) => {
      await open(page, { style, timer: { status: "running", endInMs: 60_000 } });
      const before = await readSessionCount(page);
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await holdResetWithPointer(page);
      await page.waitForTimeout(500);
      expect(await readSessionCount(page)).toBe(before);
    });
  }
});
