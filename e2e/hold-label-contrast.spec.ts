import { expect, test, type Locator, type Page } from "@playwright/test";
import { resetControl } from "./helpers/timer-hold";

// Label contrast of the Reset control measured from painted pixels, mid-hold.
//
// Why pixels: the hold fill is a second copy of the label painted over the base label. Earlier
// checks sampled fill opacity and computed token ratios, and missed a band of the hold where the
// label was unreadable. This spec screenshots the control while the text is visible and again with
// the text hidden, then reads the background behind each text pixel from the second image.
//
// Clock: the hold runs on a Playwright fake clock, so every sample lands on an exact hold time.

// Sample points across the 800 ms hold. 450-600 ms is the old failing band (55%-75%), so it is dense.
const SAMPLE_MS = [0, 100, 200, 300, 400, 450, 500, 550, 600, 650, 700, 750, 790];
const LABEL_MIN_RATIO = 4.5; // text-base (16 px, font-medium) is normal text, so 4.5:1 applies.
// A pixel counts as label text when it sits within this many 8-bit steps of the text colour.
const TEXT_TOLERANCE = 12;
// Pixels whose rendered colour differs from the text-hidden background by less than this are not text.
const TEXT_PRESENT_THRESHOLD = 60;

// The reveal edge is an anti-aliased clip-path boundary. A pixel within this many CSS px of it is
// part fill and part glass, so it is not "the label on the painted fill". Those pixels are measured
// and reported separately, with their own guard, instead of being counted against the 4.5:1 floor.
// seamX is CSS px (from getBoundingClientRect and clip-path percentages) while the pixel x in
// measureLabelPixels is image px. They coincide only because the lone Playwright project is
// devices["Desktop Chrome"] at deviceScaleFactor 1. Under any other DSF, scale seamX by the DSF first.
const SEAM_PX = 1.5;
const SEAM_GUARD = 3;

const HIDE_TEXT_CSS = ".hb-root .hb-label, .hb-root .hb-label *{color:transparent!important}";

interface LayerStat {
  /** Count of full-strength label pixels for this layer (white over fill, or dark over glass). */
  n: number;
  /** Lowest contrast of those pixels against the background painted behind them, or null if n is 0. */
  min: number | null;
  /** Where the lowest pixel sits, and what was painted behind it. */
  at?: string;
  /** Lowest contrast among pixels within SEAM_PX of the reveal edge (anti-aliased clip seam), or null. */
  seamMin?: number | null;
}

interface Sample {
  t: number;
  /** CSS transitions or animations still running on the control when the pixels were read. Must be 0. */
  inFlight: number;
  clip: string;
  baseOpacity: string;
  fillOpacity: string;
  whiteOnFill: LayerStat;
  darkOnGlass: LayerStat;
}

/** Reads the painted label pixels and the painted background behind them, in the page. */
async function measureLabelPixels(
  page: Page,
  textPng: string,
  backgroundPng: string,
  fillText: string,
  baseText: string,
  seamX: number,
): Promise<{ whiteOnFill: LayerStat; darkOnGlass: LayerStat }> {
  return page.evaluate(
    async ({ a, b, fillText, baseText, tolerance, presentThreshold, seamX, seamPx }) => {
      const load = async (b64: string): Promise<{ data: Uint8ClampedArray; width: number }> => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(bmp, 0, 0);
        return { data: ctx.getImageData(0, 0, bmp.width, bmp.height).data, width: bmp.width };
      };
      const rgb = (s: string): [number, number, number] => {
        const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s);
        if (!m) throw new Error(`unreadable colour ${s}`);
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      };
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (p: [number, number, number]) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
      const ratio = (x: [number, number, number], y: [number, number, number]) => {
        const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
        return (hi + 0.05) / (lo + 0.05);
      };
      const near = (p: number[], c: [number, number, number]) =>
        Math.abs(p[0] - c[0]) <= tolerance && Math.abs(p[1] - c[1]) <= tolerance && Math.abs(p[2] - c[2]) <= tolerance;

      const loadedA = await load(a);
      const loadedB = await load(b);
      const A = loadedA.data;
      const B = loadedB.data;
      const bmpWidth = loadedA.width;
      const layers = {
        whiteOnFill: { colour: rgb(fillText), n: 0, min: null as number | null, at: "", seamMin: null as number | null },
        darkOnGlass: { colour: rgb(baseText), n: 0, min: null as number | null, at: "", seamMin: null as number | null },
      };
      for (let i = 0; i < A.length; i += 4) {
        if (A[i + 3] === 0) continue;
        const pa = [A[i], A[i + 1], A[i + 2]];
        const pb: [number, number, number] = [B[i], B[i + 1], B[i + 2]];
        const diff = Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]);
        if (diff <= presentThreshold) continue;
        for (const layer of [layers.whiteOnFill, layers.darkOnGlass]) {
          if (!near(pa, layer.colour)) continue;
          const r = ratio([pa[0], pa[1], pa[2]], pb);
          const x = (i / 4) % bmpWidth;
          if (Math.abs(x - seamX) <= seamPx) {
            // Seam pixels do not count toward n: the non-vacuity guard must be satisfied by interior pixels.
            layer.seamMin = layer.seamMin === null ? r : Math.min(layer.seamMin, r);
            continue;
          }
          layer.n += 1;
          if (layer.min === null || r < layer.min) {
            layer.min = r;
            layer.at = `x=${x} y=${Math.floor(i / 4 / bmpWidth)} text=${pa.join(",")} behind=${pb.join(",")}`;
          }
        }
      }
      const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
      return {
        whiteOnFill: { n: layers.whiteOnFill.n, min: round(layers.whiteOnFill.min), at: layers.whiteOnFill.at, seamMin: round(layers.whiteOnFill.seamMin) },
        darkOnGlass: { n: layers.darkOnGlass.n, min: round(layers.darkOnGlass.min), at: layers.darkOnGlass.at, seamMin: round(layers.darkOnGlass.seamMin) },
      };
    },
    { a: textPng, b: backgroundPng, fillText, baseText, tolerance: TEXT_TOLERANCE, presentThreshold: TEXT_PRESENT_THRESHOLD, seamX, seamPx: SEAM_PX },
  );
}

/**
 * CSS transitions and animations run on real time, not on the Playwright fake clock, so a
 * screenshot taken straight after `clock.runFor` can catch the clip edge or a colour mid-flight.
 * The text-visible and text-hidden screenshots then disagree about where the edge is, and a
 * pixel that is really 4.7:1 reads as 4.4:1. Poll from Node (real time) until no finite
 * animation on the control or its children is still running, then return the count left.
 * Polling from Node matters: the page's timers and rAF are faked, so a page-side wait would hang.
 */
async function waitForStill(page: Page, reset: Locator): Promise<number> {
  const count = () =>
    reset.evaluate(
      (el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.playState !== "finished" && (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity).length,
    );
  let running = await count();
  for (let i = 0; i < 100 && running > 0; i++) {
    await page.waitForTimeout(20);
    running = await count();
  }
  return running;
}

/**
 * Holds Reset with a pointer on a fake clock and samples the state at each point in SAMPLE_MS.
 * Call after `page.clock.install()` and before any navigation.
 */
async function sampleHold(page: Page, reset: Locator, withPixels: boolean): Promise<Sample[]> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 2000);
  const box = await reset.boundingBox();
  if (!box) throw new Error("Reset has no bounding box");

  const hideTag = await page.addStyleTag({ content: HIDE_TEXT_CSS });
  const sheet = await hideTag.evaluateHandle((el) => (el as HTMLStyleElement).sheet as CSSStyleSheet);
  await sheet.evaluate((s) => {
    s.disabled = true;
  });

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const samples: Sample[] = [];
  let prev = 0;
  for (const t of SAMPLE_MS) {
    if (t > prev) await page.clock.runFor(t - prev);
    prev = t;
    const inFlight = await waitForStill(page, reset);
    const state = await reset.evaluate((el) => {
      const base = el.querySelector(":scope > .hb-label > span");
      const fillLabel = el.querySelector(".hb-fill > .hb-label > span");
      const fill = el.querySelector(".hb-fill");
      if (!base || !fillLabel || !fill) throw new Error("hold structure (.hb-fill, .hb-label) not found");
      const rb = el.getBoundingClientRect();
      const fb = fill.getBoundingClientRect();
      const rightInset = /inset\(\s*0(px)?\s+([\d.]+)%/.exec(getComputedStyle(fill).clipPath);
      // Reset reveals left to right. Anything else must fail loudly, not park the guard on a text-free strip.
      if (!rightInset) throw new Error(`clip-path is not a right-edge percentage inset: ${getComputedStyle(fill).clipPath}`);
      const revealedFrac = (100 - Number(rightInset[2])) / 100;
      return {
        seamX: fb.x - rb.x + revealedFrac * fb.width,
        clip: getComputedStyle(fill).clipPath,
        baseOpacity: getComputedStyle(base).opacity,
        fillOpacity: getComputedStyle(fillLabel).opacity,
        baseText: getComputedStyle(base).color,
        fillText: getComputedStyle(fillLabel).color,
      };
    });
    const empty: LayerStat = { n: 0, min: null, seamMin: null };
    let pixels: { whiteOnFill: LayerStat; darkOnGlass: LayerStat } = { whiteOnFill: empty, darkOnGlass: empty };
    if (withPixels) {
      // Text visible (sheet disabled), then text hidden (sheet enabled) for the background image.
      const textShot = await reset.screenshot();
      await sheet.evaluate((s) => {
        s.disabled = false;
      });
      const bgShot = await reset.screenshot();
      await sheet.evaluate((s) => {
        s.disabled = true;
      });
      // Both screenshots must have seen a still control, or the pair is not one frame.
      const stillAfter = await waitForStill(page, reset);
      if (inFlight !== 0 || stillAfter !== 0) {
        throw new Error(`t=${t}: animations in flight around the screenshot pair (before ${inFlight}, after ${stillAfter})`);
      }
      pixels = await measureLabelPixels(
        page,
        textShot.toString("base64"),
        bgShot.toString("base64"),
        state.fillText,
        state.baseText,
        state.seamX,
      );
    }
    samples.push({ t, inFlight, clip: state.clip, baseOpacity: state.baseOpacity, fillOpacity: state.fillOpacity, ...pixels });
  }
  await page.mouse.up();
  return samples;
}

/** Revealed width of the fill, as a percentage, parsed from the computed clip-path inset. */
function revealedPercent(clip: string): number {
  const m = /^inset\(\s*0(px)?\s+([\d.]+)%\s+0(px)?\s+0(px)?\s*\)$/.exec(clip);
  if (!m) throw new Error(`clip-path is not a right-edge percentage inset: ${clip}`);
  return Math.round((100 - Number(m[2])) * 100) / 100;
}

async function openFreshWithClock(page: Page, reducedMotion: "reduce" | "no-preference") {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  const reduced = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  expect(reduced).toBe(reducedMotion === "reduce");
}

test.describe("Hold-to-confirm Reset: label contrast mid-hold, measured from pixels (paired)", () => {
  const motionCases = [
    { label: "default motion (paired control)", media: "no-preference" as const },
    { label: "reduced motion", media: "reduce" as const },
  ];

  for (const motion of motionCases) {
    test.describe(motion.label, () => {
      test("the Reset label is at least 4.5:1 against the painted background at every sampled point of the hold", async ({ page }) => {
        await openFreshWithClock(page, motion.media);
        const samples = await sampleHold(page, resetControl(page), true);
        const table = samples.map(
          (s) => `t=${s.t} clip=${s.clip} white n=${s.whiteOnFill.n} min=${s.whiteOnFill.min} [${s.whiteOnFill.at ?? ""}] dark n=${s.darkOnGlass.n} min=${s.darkOnGlass.min}`,
        );

        for (const s of samples) {
          // Not vacuous: every sample must find label pixels to measure, in at least one layer.
          expect(s.whiteOnFill.n + s.darkOnGlass.n, `no label pixels measured at t=${s.t}\n${table.join("\n")}`).toBeGreaterThan(0);
          if (s.whiteOnFill.min !== null) {
            expect(s.whiteOnFill.min, `white label on fill at t=${s.t}\n${table.join("\n")}`).toBeGreaterThanOrEqual(LABEL_MIN_RATIO);
          }
          if (s.darkOnGlass.min !== null) {
            expect(s.darkOnGlass.min, `dark label on glass at t=${s.t}\n${table.join("\n")}`).toBeGreaterThanOrEqual(LABEL_MIN_RATIO);
          }
          // Reveal-edge pixels (part fill, part glass) are not the label's background. They are held to a
          // separate guard so a real break at the edge still fails, and they are reported in the table.
          for (const layer of [s.whiteOnFill, s.darkOnGlass]) {
            if (layer.seamMin !== null && layer.seamMin !== undefined) {
              expect(layer.seamMin, `reveal-edge pixel at t=${s.t} (guard ${SEAM_GUARD}:1, floor for edge pixels only)\n${table.join("\n")}`).toBeGreaterThanOrEqual(SEAM_GUARD);
            }
          }
        }
        // Both layers really were measured somewhere in the hold, so neither check is vacuous.
        expect(samples.some((s) => s.whiteOnFill.n > 0), table.join("\n")).toBe(true);
        expect(samples.some((s) => s.darkOnGlass.n > 0), table.join("\n")).toBe(true);
      });

      test("the label is never drawn at partial opacity during the hold", async ({ page }) => {
        await openFreshWithClock(page, motion.media);
        const samples = await sampleHold(page, resetControl(page), false);
        for (const s of samples) {
          expect(s.baseOpacity, `base label opacity at t=${s.t}`).toBe("1");
          expect(s.fillOpacity, `fill label opacity at t=${s.t}`).toBe("1");
        }
      });
    });
  }
});

test.describe("Hold-to-confirm Reset: the fill edge steps under reduced motion and slides under default motion", () => {
  test("reduced motion: the edge takes the four quarter positions 25, 50, 75, 100% and nothing in between", async ({ page }) => {
    await openFreshWithClock(page, "reduce");
    // Fails here, not later, if the browser drops round(), so the step check cannot pass against the fallback.
    const roundSupported = await page.evaluate(() => CSS.supports("width", "round(up, 1.5px, 1px)"));
    expect(roundSupported, "CSS round() is required for the stepped reveal").toBe(true);

    const samples = await sampleHold(page, resetControl(page), false);
    const revealed = samples.map((s) => revealedPercent(s.clip));
    const steps = [...new Set(revealed.filter((v) => v > 0))].sort((a, b) => a - b);
    expect(steps, `revealed percentages seen: ${revealed.join(", ")}`).toEqual([25, 50, 75, 100]);
    // Non-decreasing over the hold: it only ever steps forward while the press is held.
    for (let i = 1; i < revealed.length; i++) {
      expect(revealed[i], `edge moved backwards between ${samples[i - 1].t} and ${samples[i].t} ms`).toBeGreaterThanOrEqual(revealed[i - 1]);
    }
  });

  test("default motion (paired control): the edge slides, with many distinct positions", async ({ page }) => {
    await openFreshWithClock(page, "no-preference");
    const samples = await sampleHold(page, resetControl(page), false);
    const distinct = new Set(samples.map((s) => s.clip));
    expect(distinct.size, `distinct clip positions: ${distinct.size}`).toBeGreaterThan(8);
  });
});

test.describe("Hold-to-confirm Reset: detector sanity under reduced motion", () => {
  test("control: with the old opacity fade put back, the same pixel check finds a label band below 4.5:1 or with no full-strength pixels", async ({ page }) => {
    await openFreshWithClock(page, "reduce");
    // Injected here, in the test only: the pre-fix fade on the fill layer.
    await page.addStyleTag({ content: ".hb-fill{clip-path:none!important;opacity:var(--hb-p)!important}" });
    const samples = await sampleHold(page, resetControl(page), true);
    const failing = samples.filter(
      (s) =>
        s.whiteOnFill.n + s.darkOnGlass.n === 0 ||
        (s.whiteOnFill.min !== null && s.whiteOnFill.min < LABEL_MIN_RATIO) ||
        (s.darkOnGlass.min !== null && s.darkOnGlass.min < LABEL_MIN_RATIO),
    );
    expect(failing.length, "the faded label must be caught by the pixel check").toBeGreaterThan(0);
  });
});
