import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ADVERSARIAL,
  DESKTOP,
  NARROW,
  chooseOnSettings,
  extremes,
  fmt,
  mergeColours,
  paintedColours,
  ringAround,
  setPrefs,
  waitActive,
  worstAgainst,
  type Rect,
  type Rgb,
} from "./helpers/background";
import { compositeOver } from "./helpers/painted";
import { openTaskList, closeTaskList } from "./helpers/task-list-dialog";
import { seedTimerState } from "./helpers/timer-hold";

// Task 010 criteria 13-20: the measured floors, the gauge matrix, interior identity,
// forced colours and images-off, and the four-surface axe sweep. Every figure is a
// worst painted pixel from a real screenshot (criterion 15), never token arithmetic.

type Theme = "light" | "dark";
const IMAGES = Object.keys(ADVERSARIAL);
const STRIP_L = (): Rect => ({ x: 0, y: 0, w: 40, h: 600 });
const STRIP_R = (w: number): Rect => ({ x: w - 50, y: 0, w: 30, h: 600 });
const RING_PAD = 6;

async function boxOf(locator: Locator): Promise<Rect | null> {
  const b = await locator.boundingBox();
  return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
}

async function cssColour(page: Page, value: string): Promise<Rgb> {
  return compositeOver(page, value, "#000000");
}

async function colourOf(page: Page, locator: Locator, prop: "color" | "borderLeftColor" | "backgroundColor"): Promise<Rgb> {
  const raw = await locator.evaluate((el, p) => getComputedStyle(el)[p as "color"], prop);
  return cssColour(page, raw);
}

function overlaps(a: Rect, b: Rect, margin: number): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

function dropColour(colours: Map<string, number>, colour: Rgb): Map<string, number> {
  const out = new Map(colours);
  out.delete(fmt(colour));
  return out;
}

async function seedPinnedTask(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const guard = setTimeout(() => reject(new Error("seedPinnedTask: IndexedDB open never settled")), 15000);
        const req = indexedDB.open("pomotato");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["tasks", "appMeta"], "readwrite");
          tx.objectStore("tasks").put({ id: "qa-swatch", title: "QA swatch task", emoji: "", colorId: "tomato", eta: 1, completed: 0, position: 0 });
          tx.objectStore("appMeta").put({ key: "pinnedTaskId", value: "qa-swatch" });
          tx.oncomplete = () => {
            clearTimeout(guard);
            db.close();
            resolve();
          };
          tx.onerror = () => {
            clearTimeout(guard);
            reject(tx.error);
          };
        };
      }),
  );
}

/** Pixels of a rect from a real screenshot, flat RGB, row-major. */
async function grab(page: Page, rect: Rect): Promise<number[]> {
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  return page.evaluate(
    async ([b64, r]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(r.x, r.y, r.w, r.h).data;
      const out: number[] = [];
      for (let i = 0; i < data.length; i += 4) out.push(data[i], data[i + 1], data[i + 2]);
      return out;
    },
    [png.toString("base64"), rect] as const,
  );
}

async function tokenColour(page: Page, name: string): Promise<Rgb> {
  const raw = await page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  return cssColour(page, raw);
}

interface Scene {
  groundDarkest: Rgb;
  groundLightest: Rgb;
  readout: { ratio: number; ink: Rgb; worst: Rgb };
  wordmark: { ratio: number; worst: Rgb } | null;
  chipOn: { ratio: number; worst: Rgb } | null;
  chipOff: { ratio: number; worst: Rgb } | null;
  edges: Record<string, { ratio: number; border: Rgb; worst: Rgb } | null>;
  focus: { ratio: number; worst: Rgb } | null;
}

async function measureScene(page: Page, theme: Theme, viewport: { width: number; height: number }): Promise<Scene> {
  void theme;
  await page.setViewportSize(viewport);
  const { width } = viewport;
  const strips = await paintedColours(page, [STRIP_L(), STRIP_R(width)]);
  const ext = extremes(mergeColours(strips));

  const candidates: Rect[] = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("a, button, input, label, h1")].map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }),
  );
  // A ring side that touches another control is dropped: its pixels are that control's anti-aliased edge, not ground.
  const ringFor = (box: Rect, name: string, pad = RING_PAD): Rect[] => {
    const others = candidates.filter((c) => !(Math.abs(c.x - box.x) < 0.5 && Math.abs(c.y - box.y) < 0.5 && Math.abs(c.w - box.w) < 0.5 && Math.abs(c.h - box.h) < 0.5));
    const clean = ringAround(box, pad).filter((side) => others.every((o) => !overlaps(side, o, 1)));
    if (clean.length === 0) throw new Error(`no clean ground ring for `);
    return clean;
  };
  const readoutEl = page.locator("p.tabular-nums").first();
  const readoutBox = (await boxOf(readoutEl)) as Rect;
  const readoutInk = await colourOf(page, readoutEl, "color");
  const wordEl = page.locator("main h1").first();
  const wordBox = await boxOf(wordEl);
  const chipOnEl = page.getByText("Custom", { exact: true });
  const chipOffEl = page.getByText("Focus", { exact: true });
  const chipOnBox = await boxOf(chipOnEl);
  const chipOffBox = await boxOf(chipOffEl);
  const edgeEls: Record<string, Locator> = {
    duration: page.locator("#custom-duration"),
    stats: page.locator('a[href="/stats"]'),
    settings: page.locator('a[href="/settings"]'),
    reset: page.getByRole("button", { name: "Reset", exact: true }),
  };
  const edgeData: Record<string, { box: Rect; border: Rgb; borderWidth: string } | null> = {};
  for (const [name, el] of Object.entries(edgeEls)) {
    const box = await boxOf(el);
    if (!box) {
      edgeData[name] = null;
      continue;
    }
    const style = await el.evaluate((node) => ({ w: getComputedStyle(node).borderLeftWidth, c: getComputedStyle(node).borderLeftColor }));
    const border = await cssColour(page, style.c);
    edgeData[name] = { box, border, borderWidth: style.w };
  }
  const statsLink = page.locator('a[href="/stats"]');
  const focusBox = await boxOf(statsLink);

  // One screenshot answers every ring at once.
  const rings: Rect[] = [];
  const index: Record<string, number[]> = {};
  const take = (name: string, rects: Rect[]) => {
    index[name] = rects.map((r) => rings.push(r) - 1);
  };
  take("readout", ringFor(readoutBox, "readout"));
  if (wordBox) take("wordmark", ringFor(wordBox, "wordmark"));
  if (chipOnBox) take("chipOn", ringFor(chipOnBox, "chipOn"));
  if (chipOffBox) take("chipOff", ringFor(chipOffBox, "chipOff"));
  for (const [name, data] of Object.entries(edgeData)) if (data) take(`edge:${name}`, ringFor(data.box, `edge:${name}`));
  const painted = await paintedColours(page, rings);
  const ringColours = (name: string) => mergeColours(index[name].map((i) => painted[i]));

  const readoutWorst = worstAgainst(ringColours("readout"), readoutInk);
  const textPair = (name: string, colour: Rgb) => {
    const worst = worstAgainst(ringColours(name), colour);
    return { ratio: worst.ratio, worst: worst.pixel };
  };
  const scene: Scene = {
    groundDarkest: ext.darkest,
    groundLightest: ext.lightest,
    readout: { ratio: readoutWorst.ratio, ink: readoutInk, worst: readoutWorst.pixel },
    wordmark: wordBox ? textPair("wordmark", await colourOf(page, wordEl, "color")) : null,
    chipOn: chipOnBox ? textPair("chipOn", await colourOf(page, chipOnEl, "color")) : null,
    chipOff: chipOffBox ? textPair("chipOff", await colourOf(page, chipOffEl, "color")) : null,
    edges: {},
    focus: null,
  };
  for (const [name, data] of Object.entries(edgeData)) {
    if (!data || data.borderWidth === "0px") {
      scene.edges[name] = null;
      continue;
    }
    const excluded = dropColour(ringColours(`edge:${name}`), data.border);
    const worst = worstAgainst(excluded, data.border);
    scene.edges[name] = { ratio: worst.ratio, border: data.border, worst: worst.pixel };
  }
  // The focus outline is applied last, so it never lands in an edge ring above. Its ground is the
  // ring 5 to 9 px outside the control: outside the 2 px offset plus 2 px outline.
  if (focusBox) {
    await statsLink.focus();
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    const ring = await statsLink.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.outlineColor, visible: el.matches(":focus-visible"), width: s.outlineWidth };
    });
    if (ring.visible) {
      const ringColour = await cssColour(page, ring.color);
      const ground = mergeColours(await paintedColours(page, ringFor({ x: focusBox.x - 5, y: focusBox.y - 5, w: focusBox.w + 10, h: focusBox.h + 10 }, "focus", 4)));
      const worst = worstAgainst(dropColour(ground, ringColour), ringColour);
      scene.focus = { ratio: worst.ratio, worst: worst.pixel };
    }
  }
  return scene;
}

function row(label: string, value: { ratio: number; worst: Rgb } | null | undefined) {
  return value ? `${label} ${value.ratio.toFixed(3)} (worst ${fmt(value.worst)})` : `${label} n/a`;
}

test.describe.configure({ timeout: 240_000 });

test.describe("criteria 13-17: the composited ground and every floor, over the adversarial set, worst painted pixel", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: plain ground, then each adversarial image; floors hold; band reported`, async ({ page }) => {
      await setPrefs(page, { theme });
      await seedTimerState(page, { mode: "custom", customMinutes: 25, status: "idle" });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await seedPinnedTask(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const baseline = await measureScene(page, theme, DESKTOP);
      const lines: string[] = [`[${theme}] plain ground: darkest ${fmt(baseline.groundDarkest)} lightest ${fmt(baseline.groundLightest)}`];
      const results: Record<string, Scene> = { plain: baseline };
      for (const name of IMAGES) {
        await chooseOnSettings(page, ADVERSARIAL[name](), `${name.replace(/[^a-z0-9]+/gi, "-")}.png`);
        await page.goto("/");
        await waitActive(page);
        const scene = await measureScene(page, theme, DESKTOP);
        results[name] = scene;
        lines.push(
          `[${theme}] ${name}: darkest ${fmt(scene.groundDarkest)} lightest ${fmt(scene.groundLightest)} | ${row("readout", { ratio: scene.readout.ratio, worst: scene.readout.worst })} | ${row("wordmark", scene.wordmark)} | ${row("chipOn", scene.chipOn)} | ${row("chipOff", scene.chipOff)} | ${Object.entries(scene.edges)
            .map(([k, v]) => row(`edge:${k}`, v ? { ratio: v.ratio, worst: v.worst } : null))
            .join(" | ")} | ${row("focus", scene.focus)}`,
        );
      }
      test.info().annotations.push({ type: "measure", description: lines.join("\n") });

      for (const [name, scene] of Object.entries(results)) {
        // Criterion 17: body and readout text >= 4.5, control edges and focus >= 3.
        expect(scene.readout.ratio, `${theme} ${name} readout`).toBeGreaterThanOrEqual(4.5);
        // The wordmark is 36 px bold: large text, so its floor is 3:1 (WCAG 1.4.3), not 4.5:1.
        if (scene.wordmark) expect(scene.wordmark.ratio, `${theme} ${name} wordmark (large text)`).toBeGreaterThanOrEqual(3);
        if (scene.chipOff) expect(scene.chipOff.ratio, `${theme} ${name} chip`).toBeGreaterThanOrEqual(4.5);
        for (const [edge, value] of Object.entries(scene.edges)) {
          if (value) expect(value.ratio, `${theme} ${name} edge ${edge}`).toBeGreaterThanOrEqual(3);
        }
        if (scene.focus) expect(scene.focus.ratio, `${theme} ${name} focus`).toBeGreaterThanOrEqual(3);
      }
      expect(Object.values(results).some((s) => s.focus !== null), "focus indicator measured").toBe(true);
    });
  }
});

test.describe("criterion 18: the timer readout at levels 100, 50 and 0, both gauge styles, over white and black", () => {
  const FULL_MS = 25 * 60 * 1000;
  const levels: [number, { status: "idle" } | { status: "paused"; pausedRemainingMs: number }][] = [
    [100, { status: "idle" }],
    [50, { status: "paused", pausedRemainingMs: FULL_MS / 2 }],
    [0, { status: "paused", pausedRemainingMs: 1 }],
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const style of ["vessel", "glyph"] as const) {
      test(`${theme} ${style}: digits >= 4.5 at 100, 50, 0 over white and black`, async ({ page }) => {
        const report: string[] = [];
        for (const imageName of ["white", "black"]) {
          await setPrefs(page, { theme, gaugeStyle: style });
          await chooseOnSettings(page, ADVERSARIAL[imageName](), `${imageName}.png`);
          for (const [target, state] of levels) {
            await page.goto("/");
            // A paused or running state needs a runId and startedAt, or the app resets it to idle.
            const live = state.status !== "idle";
            await seedTimerState(page, { mode: "focus", customMinutes: 25, runId: live ? "qa-level-run" : null, startedAt: live ? Date.now() - 1000 : null, endTimestamp: null, pausedRemainingMs: null, ...state });
            await page.reload();
            await waitActive(page);
            await page.waitForTimeout(400);
            const level = await page.locator("[data-gauge-level]").first().getAttribute("data-gauge-level");
            const readoutEl = page.locator("p.tabular-nums").first();
            const readoutBox = (await boxOf(readoutEl)) as Rect;
            const inkTokens =
              style === "glyph"
                ? [await tokenColour(page, "--accent-foreground"), await tokenColour(page, "--muted-foreground")]
                : [await colourOf(page, readoutEl, "color")];
            const ring = await paintedColours(page, ringAround(readoutBox, RING_PAD));
            const ground = mergeColours(ring);
            const worst = Math.min(...inkTokens.map((ink) => worstAgainst(ground, ink).ratio));
            report.push(`${theme} ${style} ${imageName} level ${level ?? "?"} (target ${target}): ${worst.toFixed(3)}`);
            expect(level, `gauge level reads back as the target ${target}`).not.toBeNull();
            expect(Math.abs(Number(level) - target), `level for target ${target}`).toBeLessThanOrEqual(3);
            expect(worst, `${theme} ${style} ${imageName} level ${target} digits`).toBeGreaterThanOrEqual(4.5);
          }
        }
        test.info().annotations.push({ type: "measure", description: report.join("\n") });
      });
    }
  }
});

test.describe("criterion 14: painted interiors of a task swatch, a filled control and a glyph are identical with and without the image", () => {
  const inset = (r: Rect, p: number): Rect => ({ x: r.x + p, y: r.y + p, w: r.w - 2 * p, h: r.h - 2 * p });

  // The swatch lives in the Your tasks dialog (the current-task card shows no swatch), so it is
  // measured with the dialog open; the primary control and the glyph are measured on / with it closed.
  async function interiorsFor(page: Page) {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const primaryEl = page.getByRole("button", { name: "Start", exact: true });
    const readoutEl = page.locator("p.tabular-nums").first();
    const pBox = (await boxOf(primaryEl)) as Rect;
    const rBox = (await boxOf(readoutEl)) as Rect;
    const pFill = await colourOf(page, primaryEl, "backgroundColor");
    const inks = [await tokenColour(page, "--accent-foreground"), await tokenColour(page, "--muted-foreground")];
    const primaryPx = await grab(page, inset(pBox, 3));
    const readoutPx = await grab(page, rBox);
    const dialog = await openTaskList(page);
    const swatchEl = dialog.locator('span[style*="background-color"]').first();
    const sBox = (await boxOf(swatchEl)) as Rect;
    const sFill = await colourOf(page, swatchEl, "backgroundColor");
    const swatchPx = await grab(page, inset(sBox, 2));
    await closeTaskList(page);
    return { primaryPx, readoutPx, swatchPx, pFill, sFill, inks };
  }

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: fill and ink interiors match the plain-ground screenshot for white, black and checker`, async ({ page }) => {
      await setPrefs(page, { theme, gaugeStyle: "glyph" });
      await seedTimerState(page, { mode: "focus", customMinutes: 25, status: "idle" });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await seedPinnedTask(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const base = await interiorsFor(page);
      const summary: string[] = [];
      for (const imageName of ["white", "black", "1px checker"]) {
        await chooseOnSettings(page, ADVERSARIAL[imageName](), `${imageName.replace(/\W+/g, "-")}.png`);
        await page.goto("/");
        await waitActive(page);
        const after = await interiorsFor(page);
        const compare = (label: string, ref: number[], now: number[], isInterior: (p: number[]) => boolean) => {
          let counted = 0;
          let mismatched = 0;
          for (let i = 0; i < ref.length; i += 3) {
            const pixel = [ref[i], ref[i + 1], ref[i + 2]];
            if (!isInterior(pixel)) continue;
            counted += 1;
            if (pixel.some((v, k) => v !== now[i + k])) mismatched += 1;
          }
          summary.push(`${theme} ${imageName} ${label}: interior px ${counted}, mismatches ${mismatched}`);
          expect(counted, `${label} interior found`).toBeGreaterThan(0);
          expect(mismatched, `${label} interior mismatches`).toBe(0);
        };
        const same = (a: Rgb) => (p: number[]) => p[0] === a[0] && p[1] === a[1] && p[2] === a[2];
        compare("primary fill", base.primaryPx, after.primaryPx, same(base.pFill));
        compare("task swatch", base.swatchPx, after.swatchPx, same(base.sFill));
        compare("glyph ink", base.readoutPx, after.readoutPx, (p) => base.inks.some((ink) => same(ink)(p)));
      }
      test.info().annotations.push({ type: "measure", description: summary.join("\n") });
    });
  }
});

test.describe("criterion 19: forced colours and images-off, paired with the default-mode equivalent", () => {
  test("forced colours: the layer is display none, and the readout is legible against the system canvas", async ({ page }) => {
    await setPrefs(page, { theme: "light" });
    await chooseOnSettings(page, ADVERSARIAL.black(), "forced.png");
    await page.goto("/");
    await waitActive(page);
    const defaultMode = await page.locator("[data-background]").evaluate((el) => getComputedStyle(el).display);
    await page.emulateMedia({ forcedColors: "active" });
    await page.reload();
    await page.waitForLoadState("networkidle");
    const forced = await page.locator("[data-background]").evaluate((el) => getComputedStyle(el).display);
    const readoutColour = await page.locator("p.tabular-nums").first().evaluate((el) => getComputedStyle(el).color);
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    test.info().annotations.push({ type: "measure", description: `criterion 19 layer display default=${defaultMode} forced=${forced}; forced readout colour ${readoutColour}, body ${canvas}` });
    expect(defaultMode).not.toBe("none");
    expect(forced).toBe("none");
    expect(readoutColour).not.toBe("");
  });

  test("images off (IndexedDB removed): no layer, and the page matches the no-background page pixel for pixel on the margins", async ({ page }) => {
    await setPrefs(page, { theme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const plainStrips = await paintedColours(page, [STRIP_L(), STRIP_R(DESKTOP.width)]);
    await chooseOnSettings(page, ADVERSARIAL.white(), "off.png");
    await page.addInitScript(() => {
      // An environment where IndexedDB is absent: the read reports unavailable.
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-background]")).toHaveCount(0);
    const offStrips = await paintedColours(page, [STRIP_L(), STRIP_R(DESKTOP.width)]);
    const a = extremes(mergeColours(plainStrips));
    const b = extremes(mergeColours(offStrips));
    test.info().annotations.push({ type: "measure", description: `criterion 19 images-off: plain darkest ${fmt(a.darkest)} lightest ${fmt(a.lightest)}; off darkest ${fmt(b.darkest)} lightest ${fmt(b.lightest)}` });
    expect(fmt(b.darkest)).toBe(fmt(a.darkest));
    expect(fmt(b.lightest)).toBe(fmt(a.lightest));
  });
});

test.describe("criterion 20: no serious or critical axe violation on four surfaces, two themes, two viewports", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const [label, viewport] of [
      ["320 px", NARROW],
      ["1280 px", DESKTOP],
    ] as const) {
      test(`${theme} ${label}: /, /settings, /stats and the task dialog over the image`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await setPrefs(page, { theme });
        await chooseOnSettings(page, theme === "light" ? ADVERSARIAL.black() : ADVERSARIAL.white(), `axe-${theme}.png`);
        const problems: string[] = [];
        const scan = async (surface: string) => {
          const result = await new AxeBuilder({ page }).analyze();
          for (const v of result.violations) {
            if (v.impact === "serious" || v.impact === "critical") {
              problems.push(`${surface}: ${v.id} (${v.impact}) x${v.nodes.length}`);
            }
          }
          const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          expect(scroll.sw, `${surface} horizontal scroll`).toBeLessThanOrEqual(scroll.cw);
        };
        await page.goto("/settings");
        await page.waitForLoadState("networkidle");
        await scan("/settings");
        await page.goto("/stats");
        await page.waitForLoadState("networkidle");
        await scan("/stats");
        await page.goto("/");
        await waitActive(page);
        await scan("/");
        const dialog = await openTaskList(page);
        await expect(dialog).toBeVisible();
        await scan("task dialog over /");
        await closeTaskList(page);
        test.info().annotations.push({ type: "measure", description: `criterion 20 ${theme} ${label}: ${problems.length ? problems.join("; ") : "no serious or critical violations"}` });
        expect(problems).toEqual([]);
      });
    }
  }
});

test.describe("criterion 32: zero console errors or warnings across the whole flow, both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: load /, open /settings, pick, return, reload, start, pause, resume, remove, reload`, async ({ page }) => {
      const messages: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") messages.push(`${msg.type()}: ${msg.text()}`);
      });
      await setPrefs(page, { theme });
      await seedTimerState(page, { mode: "focus", customMinutes: 25, status: "idle" });
      await page.goto("/");
      await waitActive(page).catch(() => undefined);
      await chooseOnSettings(page, ADVERSARIAL["grey 50%"](), "flow.png");
      await page.goto("/");
      await waitActive(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await page.reload();
      await waitActive(page);
      await page.goto("/settings");
      await page.getByRole("button", { name: "Remove background" }).click();
      await page.goto("/");
      await page.reload();
      await page.waitForLoadState("networkidle");
      test.info().annotations.push({ type: "measure", description: `criterion 32 ${theme} console: ${messages.length ? messages.join(" | ") : "none"}` });
      expect(messages).toEqual([]);
    });
  }
});

test.describe("criterion 20: every control is at least 44 by 44 px at 320 px, with a background stored", () => {
  for (const path of ["/", "/settings"] as const) {
    test(`${path} at 320 px`, async ({ page }) => {
      await page.setViewportSize(NARROW);
      await setPrefs(page, { theme: "light" });
      await chooseOnSettings(page, ADVERSARIAL.white(), "tap.png");
      await page.goto(path);
      if (path === "/") await waitActive(page);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("a[href], button, label:has(input)")]
          .map((el) => {
            const b = el.getBoundingClientRect();
            return { text: (el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 40), w: Math.round(b.width), h: Math.round(b.height) };
          })
          .filter((c) => c.w > 0 && (c.w < 44 || c.h < 44)),
      );
      test.info().annotations.push({ type: "measure", description: `criterion 20 320 px ${path}: controls under 44 px = ${JSON.stringify(small)}` });
      expect(small).toEqual([]);
    });
  }
});
