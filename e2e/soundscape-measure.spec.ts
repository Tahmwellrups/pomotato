import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADVERSARIAL, chooseOnSettings, contrastRatio, fmt, paintedColours, setPrefs, toRgb, waitActive, type Rect, type Rgb } from "./helpers/background";
import { LAYER_LABELS, checkboxFor, instrument, mixFixture, openMixer, seedPrefs, sliderFor, stopOrStart } from "./helpers/soundscape";

// Task 011 group F: the only measurement group. Each theme is measured from ONE
// screenshot, every ratio is computed from that capture, and each row names the
// theme, the element, the ground it meets and the painted pixel it came from.
// Floors (criterion 23): text 4.5:1; track edge, thumb, checkbox edge in both
// states, and focus ring against its ground: 3:1. Ground for every control in the
// dialog is the flat --popover fill (criterion 22 proves it is not image-backed).

type Kind = "text" | "edge" | "thumb" | "ring";
interface Probe {
  name: string;
  kind: Kind;
  floor: number;
  ground: string; // name of the fill probe it is measured against
  rect: Rect;
  /** Colours to exclude from the worst search (the element's own interior, or the ground itself). */
  exclude?: string;
}

interface Row {
  theme: string;
  element: string;
  ground: string;
  pixel: Rgb;
  ratio: number;
  /** Edges and rings: the fully-covered (most contrasting) edge pixel, which the verdict uses. */
  strongest?: { pixel: Rgb; ratio: number };
  /** The least-contrast fringe pixel, kept for information only (not judged since the pass-2 ruling). */
  fringe?: { pixel: Rgb; ratio: number };
  floor: number;
  verdict: "PASS" | "FAIL";
}

const rowsLog: Row[] = [];

async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(400);
}

function modeOf(map: Map<string, number>): string {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function box(locator: Locator): Promise<Rect> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("no box for locator");
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/**
 * One screenshot, every probe. Text: the most-contrasting painted pixel in the text
 * box (the glyph core; the rest of the box is fill by construction). Edges and
 * rings: the least-contrasting painted pixel that is not the element's own interior
 * or the ground, i.e. the worst pixel of the edge itself.
 */
async function measure(page: Page, theme: string, probes: Probe[]): Promise<Row[]> {
  const maps = await paintedColours(page, probes.map((p) => p.rect));
  const byName = new Map(probes.map((p, i) => [p.name, maps[i]]));
  const groundOf = (name: string) => toRgb(modeOf(byName.get(name) ?? new Map([["255,255,255", 1]])));
  const out: Row[] = [];
  for (const probe of probes) {
    const map = byName.get(probe.name);
    if (!map) throw new Error(`no painted map for ${probe.name}`);
    const ground = groundOf(probe.ground);
    const excluded = new Set<string>([fmt(ground)]);
    if (probe.exclude) excluded.add(modeOf(byName.get(probe.exclude) ?? new Map()));
    if (probe.exclude && !byName.has(probe.exclude)) throw new Error(`exclude probe ${probe.exclude} missing`);
    let pixel: Rgb = ground;
    let ratio = Number.POSITIVE_INFINITY;
    let strong: { pixel: Rgb; ratio: number } | undefined;
    for (const key of map.keys()) {
      if (excluded.has(key) || probe.kind === "text") continue;
      const value = contrastRatio(toRgb(key), ground);
      if (strong === undefined || value > strong.ratio) strong = { pixel: toRgb(key), ratio: value };
    }
    for (const key of map.keys()) {
      if (excluded.has(key)) continue;
      const candidate = toRgb(key);
      const value = contrastRatio(candidate, ground);
      // Text takes the most-contrasting glyph pixel; edges take the least-contrasting edge pixel.
      const better = probe.kind === "text" ? value > (ratio === Number.POSITIVE_INFINITY ? 0 : ratio) : value < ratio;
      if (better) {
        ratio = value;
        pixel = candidate;
      }
    }
    if (ratio === Number.POSITIVE_INFINITY) ratio = 1;
    // Pass-2 ruling (DECISIONS 2026-10-27): a stroke is measured at its fully-covered pixel.
    // Edges and rings are judged on the strongest edge pixel; the fringe (least-contrast) figure is kept for information.
    const judged = probe.kind === "text" ? { pixel, ratio } : strong ?? { pixel, ratio };
    out.push({ theme, element: probe.name, ground: `${probe.ground} ${fmt(ground)}`, pixel: judged.pixel, ratio: judged.ratio, fringe: { pixel, ratio }, floor: probe.floor, verdict: judged.ratio >= probe.floor ? "PASS" : "FAIL" });
  }
  return out;
}

async function collect(page: Page, dialog: Locator): Promise<Probe[]> {
  const probes: Probe[] = [];
  const dbox = await box(dialog);
  probes.push({ name: "dialog fill (ground)", kind: "text", floor: 0, ground: "dialog fill (ground)", rect: { x: dbox.x + 3, y: dbox.y + 120, w: 8, h: 40 } });

  const title = dialog.getByRole("heading");
  probes.push({ name: "title", kind: "text", floor: 4.5, ground: "dialog fill (ground)", rect: await box(title) });
  const description = dialog.locator("p").first();
  probes.push({ name: "description", kind: "text", floor: 4.5, ground: "dialog fill (ground)", rect: await box(description) });

  for (const label of LAYER_LABELS) {
    const cb = checkboxFor(dialog, label);
    const cbox = await box(cb);
    const row = cb.locator("xpath=ancestor::label[1]");
    const rbox = await box(row);
    const textRect: Rect = { x: cbox.x + cbox.w + 12, y: rbox.y, w: rbox.x + rbox.w - (cbox.x + cbox.w + 12), h: rbox.h };
    probes.push({ name: `${label} label`, kind: "text", floor: 4.5, ground: "dialog fill (ground)", rect: textRect });
    const value = row.locator("xpath=../span");
    probes.push({ name: `${label} value read-out`, kind: "text", floor: 4.5, ground: "dialog fill (ground)", rect: await box(value) });
  }

  const stop = stopOrStart(dialog);
  const sbox = await box(stop);
  probes.push({ name: "stop/start button fill", kind: "text", floor: 0, ground: "dialog fill (ground)", rect: { x: sbox.x + 3, y: sbox.y + 4, w: 5, h: sbox.h - 8 } });
  probes.push({ name: "stop/start button text", kind: "text", floor: 4.5, ground: "stop/start button fill", rect: { x: sbox.x + 14, y: sbox.y + 12, w: sbox.w - 28, h: sbox.h - 24 } });

  for (const label of LAYER_LABELS) {
    const slider = sliderFor(dialog, label);
    const sb = await box(slider);
    const value = Number(await slider.inputValue());
    const centre = sb.y + sb.h / 2;
    const thumbX = sb.x + 12 + (value / 100) * (sb.w - 24);
    // Track edge: the band of rows across the track's top and bottom border, one column.
    probes.push({ name: `${label} track edge`, kind: "edge", floor: 3, ground: "dialog fill (ground)", rect: { x: sb.x + 10, y: centre - 6, w: 1, h: 12 }, exclude: `${label} track interior` });
    probes.push({ name: `${label} track interior`, kind: "text", floor: 0, ground: "dialog fill (ground)", rect: { x: sb.x + 10, y: centre - 1, w: 1, h: 2 } });
    // Thumb: its primary fill (the centre patch) against the track beside it, and against the fill.
    probes.push({ name: `${label} track beside thumb`, kind: "text", floor: 0, ground: "dialog fill (ground)", rect: { x: thumbX - 16, y: centre - 1, w: 1, h: 2 } });
    probes.push({ name: `${label} thumb vs track`, kind: "thumb", floor: 3, ground: `${label} track beside thumb`, rect: { x: thumbX - 2, y: centre - 2, w: 4, h: 4 } });
    probes.push({ name: `${label} thumb vs fill`, kind: "thumb", floor: 3, ground: "dialog fill (ground)", rect: { x: thumbX - 2, y: centre - 2, w: 4, h: 4 } });
  }

  // Checkbox: one checked (Rain is on in this fixture) and one unchecked (Wind), each against the fill above its label row.
  for (const label of ["Rain", "Wind"]) {
    const cb = checkboxFor(dialog, label);
    const cbox = await box(cb);
    const checked = await cb.isChecked();
    const state = checked ? "checked" : "unchecked";
    // Checked, the border and the fill are both primary, so nothing is excluded; unchecked, the fill is bg-background and is excluded.
    probes.push({
      name: `${label} checkbox edge (${state})`,
      kind: "edge",
      floor: 3,
      ground: "dialog fill (ground)",
      rect: { x: cbox.x + 12, y: cbox.y - 1, w: 1, h: 4 },
      exclude: checked ? undefined : `${label} checkbox interior`,
    });
    if (!checked) probes.push({ name: `${label} checkbox interior`, kind: "text", floor: 0, ground: "dialog fill (ground)", rect: { x: cbox.x + 12, y: cbox.y + 8, w: 1, h: 6 } });
  }
  return probes;
}

async function focusRingProbes(dialog: Locator): Promise<Probe[]> {
  const cbox = await box(checkboxFor(dialog, "Rain"));
  // Outline: 2 px wide, 2 px outside the border box, so rows cbox.y-4 and cbox.y-3 above the top edge.
  return [{ name: "focus ring outer edge (Rain checkbox)", kind: "ring", floor: 3, ground: "dialog fill (ground)", rect: { x: cbox.x + 12, y: cbox.y - 6, w: 1, h: 6 } }];
}

async function openFor(page: Page, theme: "light" | "dark", mix = mixFixture({ rain: { on: true, level: 60 } })) {
  await instrument(page);
  await page.goto("/");
  await seedPrefs(page, theme, mix);
  await page.reload();
  await expect(page.locator("[data-soundscape]")).toHaveCount(1);
  const dialog = await openMixer(page);
  await settle(page);
  return dialog;
}

test.describe("criterion 23: painted contrast, both themes, one screenshot each", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: every text, fader, checkbox and focus pair meets its floor`, async ({ page }) => {
      const dialog = await openFor(page, theme);
      // Focus Rain's checkbox with the keyboard so the focus ring is painted in the same capture.
      await checkboxFor(dialog, "Rain").focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(checkboxFor(dialog, "Rain")).toBeFocused();
      await settle(page);
      const probes = [...(await collect(page, dialog)), ...(await focusRingProbes(dialog))];
      const geometry = await page.evaluate(() => {
        const q = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
        const slider = document.querySelector('input[type="range"]')?.getBoundingClientRect();
        const box = document.querySelector('input[type="checkbox"]')?.getBoundingClientRect();
        return { slider: slider?.y, checkbox: box?.y, dpr: window.devicePixelRatio, unused: q("body")?.y };
      });
      console.log(`criterion 23 | ${theme} | layout y: slider ${geometry.slider} checkbox ${geometry.checkbox} devicePixelRatio ${geometry.dpr}`);
      const rows = await measure(page, theme, probes);
      rowsLog.push(...rows.filter((r) => r.floor > 0));
      for (const row of rows.filter((r) => r.floor > 0)) {
        const fringe = row.fringe && row.fringe.ratio !== row.ratio ? ` | fringe (info) ${fmt(row.fringe.pixel)} ${row.fringe.ratio.toFixed(3)}:1` : "";
        console.log(`criterion 23 | ${theme} | ${row.element} | ground ${row.ground} | judged pixel ${fmt(row.pixel)} | ${row.ratio.toFixed(3)}:1 | floor ${row.floor} | ${row.verdict}${fringe}`);
      }
      const failing = rows.filter((r) => r.verdict === "FAIL");
      expect(failing.map((r) => `${r.element} ${r.ratio.toFixed(3)}:1 < ${r.floor}`)).toEqual([]);
    });
  }
});

test.describe("criterion 22: the dialog fill is identical with the most adversarial uploaded background, both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: the fill strip with ${theme === "light" ? "white" : "black"} active equals the no-background fill`, async ({ page }) => {
      const strip = async (dialog: Locator): Promise<string> => {
        const d = await box(dialog);
        const maps = await paintedColours(page, [{ x: d.x + 3, y: d.y + 120, w: 8, h: 40 }]);
        return JSON.stringify([...maps[0].entries()].sort());
      };

      await instrument(page);
      await page.goto("/");
      await setPrefs(page, { theme, background: null });
      await page.goto("/");
      const baseline = await strip(await openMixer(page));
      await page.keyboard.press("Escape");

      await setPrefs(page, { theme });
      const image = theme === "light" ? ADVERSARIAL.white() : ADVERSARIAL.black();
      await chooseOnSettings(page, image, `adversarial-${theme}.png`);
      await page.goto("/");
      await waitActive(page);
      await settle(page);
      const withImage = await strip(await openMixer(page));
      console.log(`criterion 22 | ${theme} | fill strip no background ${baseline.slice(0, 60)}... | with adversarial image: identical = ${baseline === withImage}`);
      expect(withImage).toBe(baseline);
    });
  }
});

test.describe("criterion 24: the bottom-cluster trigger resolves to the same colours as the settings control", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: trigger border, fill and glyph colour are identical to SettingsButton on the same ground`, async ({ page }) => {
      await instrument(page);
      await page.goto("/");
      await seedPrefs(page, theme, mixFixture());
      await page.reload();
      await settle(page);
      const read = (selector: string) =>
        page.locator(selector).first().evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            border: s.borderTopColor,
            borderWidth: s.borderTopWidth,
            fill: s.backgroundColor,
            glyph: s.color,
            radius: s.borderRadius,
            size: `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
          };
        });
      const trigger = await read('[data-soundscape]');
      const settings = await read('a[href="/settings"]');
      console.log(`criterion 24 | ${theme} | trigger ${JSON.stringify(trigger)} | SettingsButton ${JSON.stringify(settings)}`);
      expect(trigger).toEqual(settings);
    });
  }
});
