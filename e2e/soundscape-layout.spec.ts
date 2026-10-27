import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { LAYER_LABELS, checkboxFor, instrument, mixFixture, openMixer, seedPrefs, sliderFor, snapshot, stopOrStart } from "./helpers/soundscape";
import { fmt, paintedColours, type Rect } from "./helpers/background";

// Chromium returns no computed style for ::-webkit-slider-runnable-track, so the
// track edge is read from one screenshot: the edge row against the row inside the
// track and the row of fill above it, the same way the painted measurements are read.
async function settleDialog(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(400);
}

// Task 011 criteria 27 (forced colours), 28 (axe) and 29 (320 px). Each forced
// colour assertion is paired with a default-mode equivalent so it cannot pass
// vacuously. Layout is measured from getBoundingClientRect, not from pixels.

async function open(page: Page, theme: "light" | "dark", viewport: { width: number; height: number }, mix = mixFixture()) {
  await instrument(page);
  await page.setViewportSize(viewport);
  await page.goto("/");
  await seedPrefs(page, theme, mix);
  await page.reload();
  await expect(page.locator("[data-soundscape]")).toHaveCount(1);
}

async function edges(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.borderTopWidth, style: s.borderTopStyle, outline: s.outlineStyle };
  });
}

/** Distinct painted colours of the track's edge row, the row inside it, and the fill row above it, in one screenshot per layer. */
async function trackRows(page: Page, locator: Locator): Promise<{ edge: string; inside: string; fill: string }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no slider box");
  const centre = box.y + box.height / 2;
  const rows: Rect[] = [
    { x: box.x + 4, y: centre - 4, w: 30, h: 1 },
    { x: box.x + 4, y: centre, w: 30, h: 1 },
    { x: box.x + 4, y: centre - 8, w: 30, h: 1 },
  ];
  const [edge, inside, fill] = await paintedColours(page, rows);
  const mode = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { edge: mode(edge), inside: mode(inside), fill: mode(fill) };
}

test.describe("criterion 27: forced colours keep an edge and a state on every new control", () => {
  for (const mode of ["active", "none"] as const) {
    test(`controls keep a visible edge under forced-colors=${mode} (paired with the default mode)`, async ({ page }) => {
      await open(page, "light", { width: 1280, height: 800 }, mixFixture({ rain: { on: true, level: 60 } }));
      await page.emulateMedia({ forcedColors: mode });
      const dialog = await openMixer(page);
      await settleDialog(page);
      const rain = checkboxFor(dialog, "Rain");
      const edge = await edges(rain);
      expect(edge.width).not.toBe("0px");
      expect(edge.style).not.toBe("none");
      await expect(rain).toBeChecked();
      await expect(dialog.getByText("On, 60%")).toBeVisible();
      for (const label of LAYER_LABELS) {
        const rows = await trackRows(page, sliderFor(dialog, label));
        // The edge must be a painted colour distinct from both the track's interior and the fill around it.
        expect(rows.edge, `${label} track edge is distinct from its interior`).not.toBe(rows.inside);
        expect(rows.edge, `${label} track edge is distinct from the fill`).not.toBe(rows.fill);
        console.log(`criterion 27 ${mode} ${label} track rows: edge ${fmt(rows.edge.split(",").map(Number) as [number, number, number])} inside ${rows.inside} fill ${rows.fill}`);
      }
      const stop = stopOrStart(dialog);
      const stopEdge = await edges(stop);
      expect(stopEdge.width).not.toBe("0px");
    });
  }
});

test.describe("criterion 28: no serious or critical axe violation, both themes, both viewports, playing and stopped", () => {
  const viewports = [
    { width: 320, height: 720 },
    { width: 1280, height: 800 },
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of viewports) {
      for (const playing of [true, false]) {
        test(`${theme} ${viewport.width}px ${playing ? "playing" : "stopped"}`, async ({ page }) => {
          await open(page, theme, viewport, mixFixture({ rain: { on: true, level: 50 } }));
          const dialog = await openMixer(page);
          await settleDialog(page);
          if (playing) {
            await stopOrStart(dialog).click();
            await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
          }
          await settleDialog(page);
          const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          const severe = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          expect(severe.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
        });
      }
    }
  }
});

test.describe("criterion 29: 320 px survives a fourth control", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of [
      { width: 320, height: 720 },
      { width: 1280, height: 800 },
    ]) {
      test(`${theme} ${viewport.width}px: four cluster controls at least 44 px, none overlapping, no horizontal scroll, dialog fits`, async ({ page }) => {
        await open(page, theme, viewport);
        const cluster = page.locator("div.fixed.bottom-0").first();
        const controls = cluster.locator("button, a");
        const count = await controls.count();
        expect(count).toBe(4);
        const boxes: { x: number; y: number; width: number; height: number }[] = [];
        for (let i = 0; i < count; i += 1) {
          const box = await controls.nth(i).boundingBox();
          if (!box) throw new Error(`control ${i} has no box`);
          expect(box.width, `control ${i} width`).toBeGreaterThanOrEqual(44);
          expect(box.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
          boxes.push(box);
        }
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i];
            const b = boxes[j];
            const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
            expect(overlap, `controls ${i} and ${j} overlap`).toBe(false);
          }
        }
        const clusterWidth = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x));
        console.log(`criterion 29 cluster width at ${viewport.width}px, ${theme}: ${Math.round(clusterWidth)} px, four controls, min target 44 px`);
        const scrollFits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
        expect(await scrollFits()).toBe(true);
        const dialog = await openMixer(page);
        expect(await scrollFits()).toBe(true);
        const dialogBox = await dialog.boundingBox();
        if (!dialogBox) throw new Error("no dialog box");
        expect(dialogBox.height).toBeLessThanOrEqual(viewport.height);
        for (const label of LAYER_LABELS) {
          const slider = sliderFor(dialog, label);
          // Reachable either inside the viewport or through the dialog's own scroll region, which is allowed.
          const reachable = await slider.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0;
            const dialogEl = el.closest('[role="dialog"]');
            const scrolls = dialogEl instanceof HTMLElement && dialogEl.scrollHeight > dialogEl.clientHeight;
            return inView || scrolls;
          });
          expect(reachable, `${label} slider is clipped with no scroll region`).toBe(true);
        }
      });
    }
  }
});
