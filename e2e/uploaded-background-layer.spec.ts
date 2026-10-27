import { expect, test, type Page } from "@playwright/test";
import {
  ADVERSARIAL,
  DESKTOP,
  LANDSCAPE,
  NARROW,
  PORTRAIT,
  chooseOnSettings,
  setPrefs,
  waitActive,
} from "./helpers/background";
import { pixelsAt } from "./helpers/dark";
import { seedTimerState } from "./helpers/timer-hold";

// Task 010 criteria 21, 22, 24, 25, 26, 27, 28 and ruling 4 (the layer is on "/" only).

const LAYER = '[data-background]';

async function boxesOf(page: Page) {
  const pick = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    return box ? [box.x, box.y, box.width, box.height].map((v) => Math.round(v * 100) / 100) : null;
  };
  return {
    readout: await pick("p.tabular-nums"),
    wordmark: await pick("main h1"),
    focus: await pick('label:has(input[name="mode"]), label:has(input[value="focus"])'),
    stats: await pick('a[href="/stats"]'),
    settings: await pick('a[href="/settings"]'),
  };
}

test.describe("criterion 22 and ruling 4: the layer is inert, sized to the viewport, and only on /", () => {
  for (const [label, viewport] of [
    ["1280 px", DESKTOP],
    ["320 px", NARROW],
  ] as const) {
    test(`geometry at ${label}: fixed, z -20, pointer-events none, the viewport box, grain at -1 on top of it`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setPrefs(page, { theme: "light" });
      await chooseOnSettings(page, ADVERSARIAL.white(), "geo.png");
      await page.goto("/");
      await waitActive(page);
      const layer = page.locator(LAYER);
      const style = await layer.evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const centre = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        return {
          position: s.position,
          zIndex: s.zIndex,
          pointerEvents: s.pointerEvents,
          rect: [r.x, r.y, r.width, r.height],
          ariaHidden: el.getAttribute("aria-hidden"),
          centreInsideMain: Boolean(centre?.closest("main")),
          centreIsLayer: centre === el || el.contains(centre),
        };
      });
      expect(style.position).toBe("fixed");
      expect(style.zIndex).toBe("-20");
      expect(style.pointerEvents).toBe("none");
      expect(style.ariaHidden).toBe("true");
      expect(style.rect).toEqual([0, 0, viewport.width, viewport.height]);
      expect(style.centreInsideMain).toBe(true);
      expect(style.centreIsLayer).toBe(false);
      const grain = await page.evaluate(() => getComputedStyle(document.body, "::before").zIndex);
      expect(grain).toBe("-1");
      const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(overflow.sw).toBeLessThanOrEqual(overflow.cw);
    });
  }

  test("ruling 4: the layer is absent on /settings and /stats, and leaving / unmounts it", async ({ page }) => {
    await setPrefs(page, { theme: "dark" });
    await chooseOnSettings(page, ADVERSARIAL.black(), "route.png");
    await expect(page.locator(LAYER)).toHaveCount(0);
    await page.goto("/stats");
    await expect(page.locator(LAYER)).toHaveCount(0);
    await page.goto("/");
    await waitActive(page);
    await page.locator('a[href="/settings"]').click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator(LAYER)).toHaveCount(0);
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await waitActive(page);
  });
});

test.describe("criterion 25: the arrival moves nothing", () => {
  for (const [label, viewport] of [
    ["320 px", NARROW],
    ["1280 px", DESKTOP],
  ] as const) {
    test(`boxes identical with and without a background, and zero layout shift attributable to arrival, at ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        type Shift = { value: number; hadRecentInput: boolean; startTime: number };
        const w = window as unknown as { __shifts: Shift[]; __marks: { state: string; t: number }[] };
        w.__shifts = [];
        w.__marks = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as (Shift & { sources: { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
            const sources = entry.sources.map((src) => {
              const el = src.node instanceof Element ? src.node : null;
              const inLayer = el ? el.closest("[data-background]") !== null : false;
              return { node: el ? `${inLayer ? "LAYER:" : ""}${el.tagName.toLowerCase()}` : "text", prev: [src.previousRect.x, src.previousRect.y, src.previousRect.width, src.previousRect.height].map(Math.round), cur: [src.currentRect.x, src.currentRect.y, src.currentRect.width, src.currentRect.height].map(Math.round) };
            });
            w.__shifts.push({ value: entry.value, hadRecentInput: entry.hadRecentInput, startTime: entry.startTime, sources } as unknown as Shift);
          }
        }).observe({ type: "layout-shift", buffered: true });
        const mark = () => {
          const state = document.querySelector("[data-background]")?.getAttribute("data-background") ?? "none";
          const last = w.__marks[w.__marks.length - 1];
          if (!last || last.state !== state) w.__marks.push({ state, t: performance.now() });
        };
        new MutationObserver(mark).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-background"] });
      });
      await setPrefs(page, { theme: "light" });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const plain = await boxesOf(page);
      // Control: the same page with no background, so the task card's own load shift is visible on its own.
      const plainShifts = await page.evaluate(() => (window as unknown as { __shifts: { value: number; hadRecentInput: boolean }[] }).__shifts.filter((s) => !s.hadRecentInput).reduce((sum, s) => sum + s.value, 0));
      await chooseOnSettings(page, ADVERSARIAL.white(), "arrive.png");
      await page.goto("/");
      await waitActive(page);
      const withImage = await boxesOf(page);
      const { shifts, marks } = await page.evaluate(() => {
        const w = window as unknown as { __shifts: { value: number; hadRecentInput: boolean; startTime: number; sources: { node: string }[] }[]; __marks: { state: string; t: number }[] };
        return { shifts: w.__shifts, marks: w.__marks };
      });
      // Attributable to the arrival means the layer or its image is a source of the shift. Nothing else counts here.
      const attributable = shifts.filter((s) => !s.hadRecentInput && s.sources.some((src) => src.node.startsWith("LAYER:"))).reduce((sum, s) => sum + s.value, 0);
      const totalLoad = shifts.filter((s) => !s.hadRecentInput).reduce((sum, s) => sum + s.value, 0);
      test.info().annotations.push({ type: "measure", description: `criterion 25 ${label}: plain=${JSON.stringify(plain)} image=${JSON.stringify(withImage)} layoutShift=${attributable} (image page total=${totalLoad}; plain page control total=${plainShifts}) marks=${JSON.stringify(marks)} shifts=${JSON.stringify(shifts.filter((s) => !s.hadRecentInput))}` });
      expect(withImage).toEqual(plain);
      expect(attributable).toBe(0);
    });
  }
});

test.describe("criterion 26: no frame where the dim paints without the image, nor the image without the dim", () => {
  test("the sequence of layer states across the arrival is recorded, and every state is one of the two stated ends", async ({ page }) => {
    await page.addInitScript(() => {
      const seq: { t: number; state: string | null; opacity: string | null; imgReady: boolean | null }[] = [];
      (window as unknown as { __seq: typeof seq }).__seq = seq;
      const record = () => {
        const layer = document.querySelector<HTMLElement>("[data-background]");
        const img = layer?.querySelector("img") ?? null;
        seq.push({
          t: Math.round(performance.now()),
          state: layer?.getAttribute("data-background") ?? null,
          opacity: layer ? getComputedStyle(layer).opacity : null,
          imgReady: img ? img.complete && img.naturalWidth > 0 : null,
        });
      };
      new MutationObserver(record).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-background", "class"] });
    });
    await setPrefs(page, { theme: "dark" });
    await chooseOnSettings(page, ADVERSARIAL["split white/black"](), "seq.png");
    await page.goto("/");
    await waitActive(page);
    const seq = await page.evaluate(() => (window as unknown as { __seq: { t: number; state: string | null; opacity: string | null; imgReady: boolean | null }[] }).__seq);
    const states = [...new Set(seq.map((s) => `${s.state ?? "none"}`))];
    test.info().annotations.push({ type: "measure", description: `criterion 26 states observed: ${states.join(" -> ")}; records=${seq.length}` });
    // A dim with no image: a pending layer must have opacity 0, and an active layer must have a decoded image.
    for (const record of seq) {
      if (record.state === "pending") expect(record.opacity).toBe("0");
      if (record.state === "active") expect(record.imgReady).toBe(true);
    }
    expect(states).toContain("active");
  });
});

test.describe("criterion 27: the image covers the viewport at the stated aspect, with no letterbox", () => {
  for (const [sourceName, make] of [
    ["portrait", PORTRAIT],
    ["landscape", LANDSCAPE],
  ] as const) {
    for (const [label, viewport] of [
      ["320 px", NARROW],
      ["1280 px", DESKTOP],
    ] as const) {
      test(`${sourceName} source at ${label}: object-fit cover, the image box is the viewport`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await setPrefs(page, { theme: "light" });
        await chooseOnSettings(page, make(), `${sourceName}.png`);
        await page.goto("/");
        await waitActive(page);
        const img = await page.locator(`${LAYER} img`).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const im = el as HTMLImageElement;
          return { fit: getComputedStyle(el).objectFit, rect: [r.x, r.y, r.width, r.height], natural: [im.naturalWidth, im.naturalHeight] };
        });
        expect(img.fit).toBe("cover");
        expect(img.rect).toEqual([0, 0, viewport.width, viewport.height]);
        // Cover keeps the source ratio: the scale on the limiting axis is the larger of the two.
        const [nw, nh] = img.natural;
        const scale = Math.max(viewport.width / nw, viewport.height / nh);
        expect(scale * nw).toBeGreaterThanOrEqual(viewport.width - 1);
        expect(scale * nh).toBeGreaterThanOrEqual(viewport.height - 1);
      });
    }
  }
});

test.describe("criterion 28: nothing animates, nothing loops, and the handle count does not grow", () => {
  test("zero rAF callbacks over an idle second, a positive control with the timer running, and identical frames 1 s apart", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __rafFired: number };
      w.__rafFired = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb: FrameRequestCallback) =>
        orig((t) => {
          w.__rafFired += 1;
          cb(t);
        });
    });
    await setPrefs(page, { theme: "dark" });
    await chooseOnSettings(page, ADVERSARIAL.amber(), "idle.png");
    await page.goto("/");
    await waitActive(page);
    await page.waitForTimeout(1000);
    const readRaf = () => page.evaluate(() => (window as unknown as { __rafFired: number }).__rafFired);
    const idleBefore = await readRaf();
    const frameA = await page.screenshot();
    await page.waitForTimeout(1000);
    const idleAfter = await readRaf();
    const frameB = await page.screenshot();
    test.info().annotations.push({ type: "measure", description: `criterion 28 idle: rAF callbacks over 1 s = ${idleAfter - idleBefore}; frames identical = ${frameA.equals(frameB)}` });
    expect(idleAfter - idleBefore).toBe(0);
    expect(frameA.equals(frameB)).toBe(true);
    // Positive control: the same probe must see callbacks when the timer is running.
    await seedTimerState(page, { mode: "focus", customMinutes: 25, status: "running", runId: "qa-raf-run", startedAt: Date.now() - 1000, endTimestamp: Date.now() + 10 * 60 * 1000, pausedRemainingMs: null });
    await page.reload();
    await waitActive(page);
    await page.evaluate(() => {
      (window as unknown as { __rafFired: number }).__rafFired = 0;
    });
    await page.waitForTimeout(1000);
    const running = await readRaf();
    test.info().annotations.push({ type: "measure", description: `criterion 28 positive control (timer running): rAF callbacks over 1 s = ${running}` });
    expect(running).toBeGreaterThan(0);
  });

  test("the object URL count does not grow across repeated / to /settings navigation", async ({ page }) => {
    await page.addInitScript(() => {
      const live = new Set<string>();
      const w = window as unknown as { __live: Set<string>; __created: number };
      w.__live = live;
      w.__created = 0;
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        const url = create(obj);
        live.add(url);
        w.__created += 1;
        return url;
      };
      URL.revokeObjectURL = (url: string) => {
        live.delete(url);
        revoke(url);
      };
    });
    await setPrefs(page, { theme: "light" });
    await chooseOnSettings(page, ADVERSARIAL["grey 50%"](), "handles.png");
    await page.goto("/");
    await waitActive(page);
    const live = () => page.evaluate(() => (window as unknown as { __live: Set<string> }).__live.size);
    const samples: number[] = [await live()];
    for (let i = 0; i < 5; i += 1) {
      await page.locator('a[href="/settings"]').click();
      await expect(page).toHaveURL(/\/settings$/);
      samples.push(await live());
      await page.locator('a[href="/"]').first().click();
      await expect(page).toHaveURL(/\/$/);
      await waitActive(page);
      samples.push(await live());
    }
    test.info().annotations.push({ type: "measure", description: `criterion 28 live object URLs across 5 round trips: ${samples.join(",")}` });
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(samples[samples.length - 1]).toBe(samples[0]);
  });

  test("the image is read from storage once per load of /, not once per render", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __gets: number };
      w.__gets = 0;
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["get"]>) {
        if (this.name === "backgrounds") w.__gets += 1;
        return get.apply(this, args);
      } as IDBObjectStore["get"];
    });
    await setPrefs(page, { theme: "dark" });
    await chooseOnSettings(page, ADVERSARIAL.white(), "reads.png");
    await page.goto("/");
    await waitActive(page);
    await page.waitForTimeout(800);
    const reads = await page.evaluate(() => (window as unknown as { __gets: number }).__gets);
    test.info().annotations.push({ type: "measure", description: `criterion 28 backgrounds-store gets for one load of /: ${reads}` });
    expect(reads).toBe(1);
  });
});

test.describe("criterion 21 and 24: the grain is unchanged; the first-paint ground with a background set is observed, not relaxed", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`body::before is identical with and without a background in ${theme}`, async ({ page }) => {
      await setPrefs(page, { theme });
      await page.goto("/");
      const plain = await page.evaluate(() => {
        const s = getComputedStyle(document.body, "::before");
        return { content: s.content, color: s.backgroundColor, opacity: s.opacity, mask: s.maskImage.length > 4, position: s.position, z: s.zIndex };
      });
      await chooseOnSettings(page, ADVERSARIAL.white(), "grain.png");
      await page.goto("/");
      await waitActive(page);
      const withImage = await page.evaluate(() => {
        const s = getComputedStyle(document.body, "::before");
        return { content: s.content, color: s.backgroundColor, opacity: s.opacity, mask: s.maskImage.length > 4, position: s.position, z: s.zIndex };
      });
      expect(withImage).toEqual(plain);
      expect(withImage.mask).toBe(true);
      expect(withImage.color).not.toBe("rgba(0, 0, 0, 0)");
    });
  }

  for (const [label, theme, ground, other] of [
    ["light", "light", [251, 244, 234], [28, 20, 14]],
    ["dark", "dark", [28, 20, 14], [251, 244, 234]],
  ] as const) {
    test(`first paint, ${label} stored, with a white background stored: the sampled ground is observed before and after arrival`, async ({ page }) => {
      await setPrefs(page, { theme, gaugeStyle: "vessel" });
      await chooseOnSettings(page, ADVERSARIAL.white(), "first.png");
      // Hold the app's JS back so the first paint is what the server HTML produces.
      await page.route("**/_next/static/chunks/**/*.js", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.continue();
      });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const [early] = await pixelsAt(page, [[4, 4]]);
      await page.unroute("**/_next/static/chunks/**/*.js");
      await waitActive(page);
      const [late] = await pixelsAt(page, [[4, 4]]);
      const dist = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      test.info().annotations.push({
        type: "measure",
        description: `criterion 24 ${label}: early pixel ${early} (JS held, layer ${"not yet mounted or pending"}), late pixel ${late} after active; early max channel distance to ${label} ground ${dist(early, [...ground])}, late ${dist(late, [...ground])}, late distance to the other ground ${dist(late, [...other])}`,
      });
      expect(dist(early, [...ground])).toBeLessThanOrEqual(24);
    });
  }
});
