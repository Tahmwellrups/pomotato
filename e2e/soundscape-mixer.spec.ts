import { expect, test, type Page } from "@playwright/test";
import {
  LAYER_IDS,
  LAYER_LABELS,
  checkboxFor,
  contextStates,
  counters,
  instrument,
  mixFixture,
  openMixer,
  outlineOf,
  resetCounters,
  seedPrefs,
  sliderFor,
  snapshot,
  stopOrStart,
  storedPrefs,
  PREFS_KEY,
} from "./helpers/soundscape";
import { LAYERS } from "../lib/audio/layers";
import { levelToGain } from "../lib/audio/gain";

// Task 011 behaviour specs: criteria 6, 8, 10, 12-17, 18, 19, 20, 21, 26. Every
// audio claim is observed through the trigger's data-soundscape accessor, the
// instrumented AudioContext, a stored value, or a request, never by listening.

const roundGain = (level: number) => Math.round(levelToGain(level) * 10000) / 10000;

async function fresh(page: Page, theme: "light" | "dark" | "system" = "light", mix = mixFixture()) {
  await instrument(page);
  await page.goto("/");
  await seedPrefs(page, theme, mix);
  await page.reload();
  await expect(page.locator("[data-soundscape]")).toHaveCount(1);
}

test.describe("criterion 17: silent until she asks, on every load", () => {
  test("a reload with layers stored on constructs no context and keeps the mix", async ({ page }) => {
    await fresh(page, "light", mixFixture({ rain: { on: true, level: 80 } }));
    const snap = await snapshot(page);
    expect(snap.context).toBe("none");
    expect(snap.contexts).toBe(0);
    expect(snap.playing).toBe(false);
    await page.waitForTimeout(1000);
    expect((await counters(page)).contexts).toBe(0);
    const dialog = await openMixer(page);
    await expect(checkboxFor(dialog, "Rain")).toBeChecked();
    await expect(sliderFor(dialog, "Rain")).toHaveValue("80");
    expect((await storedPrefs(page)).state.mix).toMatchObject({ rain: { on: true, level: 80 } });
  });

  test("a fresh browser context with the mix pre-stored starts silent", async ({ browser, baseURL }) => {
    const mix = mixFixture({ wind: { on: true, level: 30 } });
    const context = await browser.newContext({
      baseURL,
      storageState: {
        cookies: [],
        origins: [{ origin: baseURL ?? "", localStorage: [{ name: PREFS_KEY, value: JSON.stringify({ state: { theme: "light", gaugeStyle: "vessel", background: null, mix }, version: 1 }) }] }],
      },
    });
    const page = await context.newPage();
    await instrument(page);
    await page.goto("/");
    await expect(page.locator("[data-soundscape]")).toHaveCount(1);
    const snap = await snapshot(page);
    expect(snap.context).toBe("none");
    expect(snap.contexts).toBe(0);
    await context.close();
  });
});

test.describe("criterion 8: one running context, generated sources, no media element", () => {
  test("turning a layer on constructs exactly one running context and no media element", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    await checkboxFor(dialog, "Rain").click();
    await expect.poll(async () => (await snapshot(page)).context).toBe("running");
    const snap = await snapshot(page);
    expect(snap.contexts).toBe(1);
    expect(snap.playing).toBe(true);
    expect(snap.layers.rain.on).toBe(true);
    expect(snap.layers.rain.gain).toBe(roundGain(50));
    expect((await counters(page)).contexts).toBe(1);
    expect(await page.evaluate(() => document.querySelectorAll("audio, video").length)).toBe(0);
  });
});

test.describe("criterion 6: the entry stays small, and a drag writes per value change, not per pointer event", () => {
  test("one entry, the envelope shape, under 1 KB growth, and the drag write count is reported", async ({ page }) => {
    await fresh(page);
    const baseline = (await page.evaluate((key) => window.localStorage.getItem(key)?.length ?? 0, PREFS_KEY));
    const dialog = await openMixer(page);
    for (const label of LAYER_LABELS) await checkboxFor(dialog, label).click();
    for (const label of LAYER_LABELS) {
      await sliderFor(dialog, label).focus();
      await page.keyboard.press("Home");
      for (let i = 0; i < 80; i += 1) await page.keyboard.press("ArrowRight");
    }
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.filter((k) => k === PREFS_KEY)).toHaveLength(1);
    const raw = await page.evaluate((key) => window.localStorage.getItem(key) ?? "", PREFS_KEY);
    const parsed = JSON.parse(raw) as { version: number; state: Record<string, unknown> };
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.state).sort()).toEqual(["background", "gaugeStyle", "mix", "theme"]);
    const growth = raw.length - baseline;
    console.log(`criterion 6 bytes: default-mix entry ${baseline} chars, all four on at 80 ${raw.length} chars, growth ${growth}`);
    expect(growth).toBeLessThan(1024);
  });

  test("a full-range drag: setItem count, input events, pointer moves, and the final stored level", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    const slider = sliderFor(dialog, "Rain");
    await slider.focus();
    await page.keyboard.press("Home");
    await resetCounters(page);
    const box = await slider.boundingBox();
    if (!box) throw new Error("no slider box");
    const thumb = 12;
    const y = box.y + box.height / 2;
    // Start on the left end, drag past the right end: the browser clamps, so the drag ends at the maximum.
    await page.mouse.move(box.x + thumb, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 40, y, { steps: 300 });
    await page.mouse.up();
    const q = await counters(page);
    const finalValue = Number(await slider.inputValue());
    const stored = (await storedPrefs(page)).state.mix as Record<string, { level: number }>;
    console.log(`criterion 6 drag 0->100 over 300 pointer moves: pointerMoves=${q.pointerMoves} rangeInputs=${q.rangeInputs} localStorage setItem(prefs)=${q.prefWrites} finalControl=${finalValue} finalStored=${stored.rain.level}`);
    expect(finalValue).toBe(100);
    expect(stored.rain.level).toBe(finalValue);
    // Writes follow value changes, not pointer events: 300 moves produce 100 steps, and writes never exceed value changes.
    expect(q.prefWrites).toBeLessThanOrEqual(q.rangeInputs);
    expect(q.pointerMoves).toBeGreaterThan(q.rangeInputs);
  });
});

test.describe("criterion 12: native faders, keyboard complete, visible focus, announced value", () => {
  test("Tab reaches each layer's checkbox then its fader, in visual order", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    await checkboxFor(dialog, LAYER_LABELS[0]).focus();
    for (const label of LAYER_LABELS) {
      await expect(checkboxFor(dialog, label)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(sliderFor(dialog, label)).toBeFocused();
      const next = LAYER_LABELS[LAYER_LABELS.indexOf(label) + 1];
      if (next) {
        await page.keyboard.press("Tab");
        await expect(checkboxFor(dialog, next)).toBeFocused();
      }
    }
  });

  test("every fader shows the app focus ring, resolving to --ring at 2 px and 2 px offset", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    const ring = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.color = "var(--ring)";
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    });
    for (const label of LAYER_LABELS) {
      const slider = sliderFor(dialog, label);
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await expect(slider).toBeFocused();
      const outline = await outlineOf(slider);
      expect(outline.style).toBe("solid");
      expect(outline.width).toBe("2px");
      expect(outline.offset).toBe("2px");
      expect(outline.color).toBe(ring);
    }
  });

  test("every fader is operable by keyboard alone to both extremes and to an intermediate value, and announces it", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    for (const label of LAYER_LABELS) {
      const slider = sliderFor(dialog, label);
      await slider.focus();
      await page.keyboard.press("End");
      await expect(slider).toHaveValue("100");
      await expect(slider).toHaveAttribute("aria-valuetext", "100 percent");
      await page.keyboard.press("Home");
      await expect(slider).toHaveValue("0");
      await expect(slider).toHaveAttribute("aria-valuetext", "0 percent");
      for (let i = 0; i < 37; i += 1) await page.keyboard.press("ArrowRight");
      await expect(slider).toHaveValue("37");
      await expect(slider).toHaveAttribute("aria-valuetext", "37 percent");
      expect(await slider.getAttribute("aria-label")).toBe(`${label} level`);
    }
  });

  test("each layer's on/off checkbox toggles from the keyboard with Space", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    for (const label of LAYER_LABELS) {
      const box = checkboxFor(dialog, label);
      await box.focus();
      const before = await box.isChecked();
      await page.keyboard.press("Space");
      await expect(box).toBeChecked({ checked: !before });
      await page.keyboard.press("Space");
      await expect(box).toBeChecked({ checked: before });
    }
  });
});

test.describe("criterion 13, 15: no dead control, and copy that says what it is", () => {
  test("no control is disabled, and the copy names only what the synthesis produces", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    const controls = dialog.locator("input, button");
    const count = await controls.count();
    expect(count).toBeGreaterThan(LAYER_IDS.length * 2);
    for (let i = 0; i < count; i += 1) await expect(controls.nth(i)).toBeEnabled();
    const text = (await dialog.innerText()).replace(/\s+/g, " ");
    // Criterion 15, amended 2026-10-27: rain now ships as a recording, so two of these
    // assertions had inverted. The copy used to say "nothing downloaded" and this test
    // pinned that exact phrase; with an audio file in public/ the claim is false, so the
    // claim was removed and the guard is now against the falsehood, not the wording.
    // The blanket ban on "recording" went the same way: it was correct while every layer
    // was synthesized and would now forbid describing rain accurately.
    expect(text).not.toMatch(/nothing (is )?download|nothing leaves|no download|everything is generated/i);
    // A label may still never name a source nothing produces. Asserted on the labels
    // themselves rather than the whole dialog, so a future credit or explanatory line
    // cannot trip it, and so the check keeps meaning what criterion 15 says.
    for (const label of LAYER_LABELS) {
      expect(label).not.toMatch(/Caf|Campfire|Birdsong|Morning birds|Rainforest/i);
    }
    expect(LAYER_LABELS.sort()).toEqual(["Hum", "Rain", "Waves", "Wind"]);
    expect(LAYERS.map((l) => l.id).sort()).toEqual(["hum", "rain", "waves", "wind"]);
  });
});

test.describe("criterion 14, 19: stop-all silences without discarding the mix, and restarts it", () => {
  test("stop leaves the graph suspended and the stored mix intact; start restores the same mix", async ({ page }) => {
    await fresh(page, "light", mixFixture({ rain: { on: true, level: 66 }, hum: { on: true, level: 20 } }));
    const dialog = await openMixer(page);
    await stopOrStart(dialog).click();
    await expect(stopOrStart(dialog)).toHaveText("Stop all sound");
    await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
    expect((await contextStates(page))[0].state).toBe("running");
    const before = JSON.stringify((await storedPrefs(page)).state.mix);

    await stopOrStart(dialog).click();
    await expect(stopOrStart(dialog)).toHaveText("Start sound");
    const silent = await snapshot(page);
    expect(silent.playing).toBe(false);
    for (const id of LAYER_IDS) expect(silent.layers[id]).toEqual({ on: false, gain: 0 });
    // Held idle on the audio clock: the context is suspended once the fades are inaudible.
    await expect.poll(async () => (await contextStates(page))[0].state, { timeout: 3000 }).toBe("suspended");
    expect(JSON.stringify((await storedPrefs(page)).state.mix)).toBe(before);

    await stopOrStart(dialog).click();
    await expect(stopOrStart(dialog)).toHaveText("Stop all sound");
    await expect.poll(async () => (await contextStates(page))[0].state).toBe("running");
    expect(JSON.stringify((await storedPrefs(page)).state.mix)).toBe(before);
    expect((await snapshot(page)).layers.rain).toEqual({ on: true, gain: roundGain(66) });
    expect((await snapshot(page)).layers.hum).toEqual({ on: true, gain: roundGain(20) });
    expect((await counters(page)).contexts).toBe(1);
  });
});

test.describe("criterion 16: nothing announced on arrival, focus kept, a refused start is said in text", () => {
  test("the status line is empty on open, then speaks what an action produced, with focus where it was", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    const status = dialog.getByRole("status");
    await expect(status).toHaveText("");
    await checkboxFor(dialog, "Wind").click();
    await expect(status).toHaveText("Wind on.");
    await expect(checkboxFor(dialog, "Wind")).toBeFocused();
  });

  test("a browser that refuses to start audio is told in text", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    // Headless Chromium starts contexts running, so force the browser's refusal: report suspended, and reject resume().
    await page.addInitScript(() => {
      Object.defineProperty(AudioContext.prototype, "state", { get: () => "suspended", configurable: true });
      AudioContext.prototype.resume = () => Promise.reject(new Error("refused"));
    });
    await fresh(page, "light", mixFixture({ hum: { on: true, level: 50 } }));
    const dialog = await openMixer(page);
    await stopOrStart(dialog).click();
    await expect(dialog.getByRole("status")).toHaveText("Your browser did not start the sound. Press Start sound to try again.");
    // R-1: the control must agree with the status line. No "Stop all sound" while the sound is not on.
    await expect(dialog.getByRole("button", { name: "Start sound", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Stop all sound", exact: true })).toHaveCount(0);
    const refused = await snapshot(page);
    expect(refused.context).toBe("suspended");
    for (const id of LAYER_IDS) expect(refused.layers[id].on, `${id} is not on after a refused start`).toBe(false);
    await context.close();
  });
});

test.describe("R-2: a stop that lands inside a pending resume leaves the context suspended", () => {
  test("stop during the resume window: the context ends suspended once the late resume settles", async ({ page }) => {
    // Headless Chromium starts contexts running, so no resume window exists by itself. Stub the
    // browser: report suspended until a resume() settles 600 ms later, and make suspend() stick.
    await page.addInitScript(() => {
      const proto = AudioContext.prototype;
      const realResume = proto.resume;
      const realSuspend = proto.suspend;
      Object.defineProperty(proto, "state", {
        configurable: true,
        get() {
          return (this as unknown as { __qaState?: string }).__qaState ?? "suspended";
        },
      });
      proto.resume = function (this: AudioContext) {
        const self = this as unknown as { __qaState?: string; onstatechange?: () => void };
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            void realResume.call(this);
            self.__qaState = "running";
            self.onstatechange?.();
            resolve();
          }, 600);
        });
      };
      proto.suspend = function (this: AudioContext) {
        const self = this as unknown as { __qaState?: string; onstatechange?: () => void };
        self.__qaState = "suspended";
        self.onstatechange?.();
        return realSuspend.call(this);
      };
    });
    await fresh(page);
    const dialog = await openMixer(page);
    await checkboxFor(dialog, "Rain").click();
    // The start is pending (context still reports suspended): the control reads Stop and a click stops everything.
    expect((await snapshot(page)).context).toBe("suspended");
    await stopOrStart(dialog).click();
    await expect(stopOrStart(dialog)).toHaveText("Start sound");
    await expect.poll(async () => (await snapshot(page)).playing).toBe(false);
    // The late resume settles (running), then the engine re-reads intent (nothing wanted) and suspends on the audio clock.
    // Waiting for "running" first matters: while the resume is pending the stub reads suspended, so a bare
    // "suspended" poll would pass before the resume had settled and could not tell the fix from the bug.
    await expect.poll(async () => (await contextStates(page))[0]?.state, { timeout: 3000 }).toBe("running");
    await expect.poll(async () => (await contextStates(page))[0]?.state, { timeout: 6000 }).toBe("suspended");
    expect((await snapshot(page)).context).toBe("suspended");
    for (const id of LAYER_IDS) expect((await snapshot(page)).layers[id].on).toBe(false);
  });
});

test.describe("criterion 18: a level change reaches only its own layer, and levels are monotonic in the accessor", () => {
  test("moving one layer leaves every other layer's reported gain byte-identical", async ({ page }) => {
    await fresh(page, "light", mixFixture(Object.fromEntries(LAYER_IDS.map((id) => [id, { on: true, level: 40 }]))));
    const dialog = await openMixer(page);
    await stopOrStart(dialog).click();
    await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
    for (const target of LAYER_LABELS) {
      const before = (await snapshot(page)).layers;
      await sliderFor(dialog, target).focus();
      await page.keyboard.press("End");
      const after = (await snapshot(page)).layers;
      const targetId = LAYERS.find((l) => l.label === target)?.id ?? "";
      for (const id of LAYER_IDS) {
        if (id === targetId) continue;
        expect(JSON.stringify(after[id]), id).toBe(JSON.stringify(before[id]));
      }
      expect(after[targetId].gain).toBe(roundGain(100));
      await page.keyboard.press("Home");
    }
  });
});

test.describe("criterion 20: closing the dialog and client-side navigation keep the sound; one context across the round trip", () => {
  test("close, then / to /stats and /settings and back, keeps playing with one context and no reload", async ({ page }) => {
    await fresh(page, "light", mixFixture({ rain: { on: true, level: 70 } }));
    const dialog = await openMixer(page);
    await stopOrStart(dialog).click();
    await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect((await snapshot(page)).playing).toBe(true);
    expect((await contextStates(page))[0].state).toBe("running");

    await page.evaluate(() => {
      (window as unknown as { __marker: string }).__marker = "alive";
    });
    await page.getByRole("link", { name: "Focus stats", exact: true }).click();
    await expect(page).toHaveURL(/\/stats$/);
    const backLink = page.locator('a[href="/"]').first();
    await expect(backLink).toBeVisible();
    await expect(backLink).toBeEnabled();
    expect((await contextStates(page))[0].state).toBe("running");
    await backLink.focus();
    await expect(backLink).toBeFocused();
    await backLink.click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
    expect((await contextStates(page))[0].state).toBe("running");
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);

    const after = await snapshot(page);
    expect(after.playing).toBe(true);
    expect(after.contexts).toBe(1);
    expect(after.layers.rain).toEqual({ on: true, gain: roundGain(70) });
    expect((await counters(page)).contexts).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe("alive");
    expect((await storedPrefs(page)).state.mix).toMatchObject({ rain: { on: true, level: 70 } });
  });
});

test.describe("criterion 21: five open/close cycles and five round trips, one context, no node growth", () => {
  test("the context count stays at one and the node count does not grow; a second tab is observed", async ({ page, context }) => {
    await fresh(page, "light", mixFixture({ rain: { on: true, level: 50 } }));
    const dialog = await openMixer(page);
    await stopOrStart(dialog).click();
    await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
    await page.keyboard.press("Escape");

    const nodeCounts: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const d = await openMixer(page);
      await expect(d).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      nodeCounts.push((await snapshot(page)).nodes);
      expect((await counters(page)).contexts).toBe(1);
    }
    for (let i = 0; i < 5; i += 1) {
      await page.getByRole("link", { name: "Focus stats", exact: true }).click();
      await expect(page).toHaveURL(/\/stats$/);
      await page.locator('a[href="/"]').first().click();
      await expect(page).toHaveURL(/\/$/);
      nodeCounts.push((await snapshot(page)).nodes);
      expect((await counters(page)).contexts).toBe(1);
    }
    console.log(`criterion 21 node counts across 10 cycles: ${nodeCounts.join(", ")}`);
    expect(new Set(nodeCounts.slice(0, 5)).size).toBe(1);
    expect(new Set(nodeCounts.slice(5)).size).toBe(1);
    expect(nodeCounts[5]).toBe(nodeCounts[0]);

    const second = await context.newPage();
    await instrument(second);
    await second.goto("/");
    const secondDialog = await openMixer(second);
    await stopOrStart(secondDialog).click();
    await expect.poll(async () => (await snapshot(second)).playing).toBe(true);
    const firstState = (await contextStates(page))[0].state;
    const secondState = (await contextStates(second))[0].state;
    console.log(`criterion 21 second tab observed: tab1 context=${firstState} playing, tab2 context=${secondState} playing (two independent graphs, per-tab limitation)`);
    expect(firstState).toBe("running");
    expect(secondState).toBe("running");
    await second.close();
  });
});

test.describe("criterion 10: nothing is fetched beyond the app's own JS, and the audio path works with the network blocked", () => {
  // Amended 2026-10-27: rain now ships as a licensed recording (DECISIONS 2026-10-27),
  // so one same-origin audio payload is expected. The assertion is not loosened to
  // "media is fine": it pins the exact allowed path, so a second asset or a
  // cross-origin one still fails. The offline half is strengthened, because that is
  // what the file layer actually put at risk: it now waits for the asset to arrive
  // before going offline, then proves rain is really sounding by its node count
  // (a loaded rain voice adds 2 nodes, a missing buffer adds 0).
  const ALLOWED_AUDIO_PATH = "/sounds/rain-865572.m4a";

  test("the only media response is the licensed asset, no cross-origin request, and rain still sounds offline", async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL ?? "http://localhost:3100").origin;
    const media: string[] = [];
    const foreign: string[] = [];
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (/^(audio|video)\//.test(type)) media.push(`${response.url()} ${type}`);
      if (!response.url().startsWith(origin)) foreign.push(response.url());
    });
    page.on("request", (request) => {
      if (!request.url().startsWith(origin)) foreign.push(request.url());
    });
    await fresh(page);
    const dialog = await openMixer(page);
    for (const label of LAYER_LABELS) await checkboxFor(dialog, label).click();
    for (const label of LAYER_LABELS) {
      await sliderFor(dialog, label).focus();
      await page.keyboard.press("ArrowRight");
    }
    await stopOrStart(dialog).click();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Focus stats", exact: true }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await page.locator('a[href="/"]').first().click();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(page.locator("[data-soundscape]")).toHaveCount(1);

    // The file is fetched at page load, so offline only holds once it has arrived.
    // Waiting for it is the precondition of the claim, not a workaround: without it
    // this test would pass with rain permanently silent.
    await expect.poll(() => media.filter((m) => m.includes(ALLOWED_AUDIO_PATH)).length).toBeGreaterThan(0);

    await context.setOffline(true);
    const offlineDialog = await openMixer(page);
    await stopOrStart(offlineDialog).click();
    await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
    await expect.poll(async () => (await contextStates(page))[0].state).toBe("running");

    // Rain alone, with a real buffer behind it: 4 level gains + 1 fade + 2 voice
    // nodes. A missing buffer yields the silent voice and 5, so this distinguishes
    // "rain is playing" from "rain is reported on but makes no sound".
    const offlineSnapshot = await snapshot(page);
    console.log(`criterion 10 offline: nodes=${offlineSnapshot.nodes}`);
    expect(offlineSnapshot.layers.rain.on).toBe(true);
    // 37 = 4 level gains + 4 fades + the four voices, of which rain's file voice is 2
    // (a buffer source and a gain). A rain buffer that never arrived yields the silent
    // voice at 0 nodes and a total of 35, so this number is what separates "rain is
    // sounding offline" from "rain is reported on and silent". The snapshot's own
    // `on` flag cannot make that distinction, which is why the count is asserted too.
    expect(offlineSnapshot.nodes).toBe(37);

    await stopOrStart(offlineDialog).click();
    await expect.poll(async () => (await snapshot(page)).playing).toBe(false);
    await context.setOffline(false);

    console.log(`criterion 10: media responses=${media.length}, non-origin requests=${foreign.length}`);
    const unexpectedMedia = media.filter((m) => !m.startsWith(`${origin}${ALLOWED_AUDIO_PATH}`));
    expect(unexpectedMedia).toEqual([]);
    expect(media.length).toBeGreaterThan(0);
    expect(foreign).toEqual([]);
  });
});

test.describe("criterion 26: audio is not motion; reduced motion changes no gain; no frame loop while idle", () => {
  test("identical reported gains under reduce and no-preference, and stop still needs the control", async ({ browser, baseURL }) => {
    const gains: string[] = [];
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const context = await browser.newContext({ baseURL, reducedMotion });
      const page = await context.newPage();
      await fresh(page, "light", mixFixture({ rain: { on: true, level: 50 }, wind: { on: true, level: 80 } }));
      const dialog = await openMixer(page);
      await stopOrStart(dialog).click();
      await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
      gains.push(JSON.stringify((await snapshot(page)).layers));
      await stopOrStart(dialog).click();
      await expect.poll(async () => (await snapshot(page)).playing).toBe(false);
      await context.close();
    }
    expect(gains[0]).toBe(gains[1]);
  });

  test("with audio playing and the timer idle, no frame callbacks fire over a settled second; the running timer is the positive control", async ({ page }) => {
    await fresh(page, "light", mixFixture({ rain: { on: true, level: 50 } }));
    const dialog = await openMixer(page);
    await stopOrStart(dialog).click();
    await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await resetCounters(page);
    const first = await page.evaluate(() => document.body.innerHTML);
    const firstSnap = JSON.stringify(await snapshot(page));
    await page.waitForTimeout(1000);
    const second = await page.evaluate(() => document.body.innerHTML);
    const secondSnap = JSON.stringify(await snapshot(page));
    const idle = (await counters(page)).raf;
    expect(idle).toBe(0);
    expect(secondSnap).toBe(firstSnap);
    expect(second).toBe(first);

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await resetCounters(page);
    await page.waitForTimeout(1000);
    const running = (await counters(page)).raf;
    console.log(`criterion 26 frame callbacks over 1 s: timer idle ${idle}, timer running ${running}`);
    expect(running).toBeGreaterThan(0);
  });
});

test.describe("criterion 9 (e2e), 20 (the storage key)", () => {
  test("the key is the single preference entry and no second audio key is written", async ({ page }) => {
    await fresh(page);
    const dialog = await openMixer(page);
    await checkboxFor(dialog, "Hum").click();
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.filter((k) => k.toLowerCase().includes("audio") || k.toLowerCase().includes("sound") || k.toLowerCase().includes("mix"))).toEqual([]);
    expect(keys).toContain(PREFS_KEY);
  });
});

test.describe("criterion 32: zero console errors or warnings across the flow, both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: load, open, turn each layer on, move each fader, stop, close, navigate, reload, timer start/pause/resume`, async ({ page }) => {
      const messages: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") messages.push(`${message.type()}: ${message.text()}`);
      });
      page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
      await fresh(page, theme);
      const dialog = await openMixer(page);
      for (const label of LAYER_LABELS) await checkboxFor(dialog, label).click();
      for (const label of LAYER_LABELS) {
        await sliderFor(dialog, label).focus();
        await page.keyboard.press("ArrowRight");
      }
      await stopOrStart(dialog).click();
      await stopOrStart(dialog).click();
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "Focus stats", exact: true }).click();
      await expect(page).toHaveURL(/\/stats$/);
      await page.locator('a[href="/"]').first().click();
      await expect(page).toHaveURL(/\/$/);
      await page.reload();
      await expect(page.locator("[data-soundscape]")).toHaveCount(1);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await page.waitForTimeout(500);
      console.log(`criterion 32 ${theme}: console errors/warnings = ${messages.length}`);
      expect(messages).toEqual([]);
    });
  }
});
