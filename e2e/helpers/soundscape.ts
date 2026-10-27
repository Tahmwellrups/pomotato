import { expect, type Locator, type Page } from "@playwright/test";
import { LAYERS } from "../../lib/audio/layers";
import { DEFAULT_LEVEL } from "../../lib/audio/gain";

// Task 011 QA helpers. The accessor is the trigger's data-soundscape attribute
// (JSON of SoundscapeSnapshot). It stays readable while the dialog is open, so
// it is selected by attribute, never by role. Counters are installed before any
// app script runs, so they see every AudioContext, setItem and rAF call.

export const PREFS_KEY = "pomotato-preferences";
export const LAYER_IDS = LAYERS.map((layer) => layer.id);
export const LAYER_LABELS = LAYERS.map((layer) => layer.label);

export interface Snapshot {
  context: "none" | AudioContextState;
  playing: boolean;
  contexts: number;
  nodes: number;
  layers: Record<string, { on: boolean; gain: number }>;
}

export interface Counters {
  contexts: number;
  prefWrites: number;
  raf: number;
  rangeInputs: number;
  pointerMoves: number;
}

/** Installs counters before the app loads: AudioContext constructions, prefs writes, rAF calls, range input events, pointer moves. */
export async function instrument(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    const w = window as unknown as { __qa: Counters & { instances: AudioContext[] } };
    w.__qa = { contexts: 0, prefWrites: 0, raf: 0, rangeInputs: 0, pointerMoves: 0, instances: [] };
    const RealContext = window.AudioContext;
    if (RealContext) {
      class CountedContext extends RealContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          w.__qa.contexts += 1;
          w.__qa.instances.push(this);
        }
      }
      Object.defineProperty(window, "AudioContext", { value: CountedContext, configurable: true, writable: true });
    }
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) w.__qa.prefWrites += 1;
      return realSetItem.call(this, k, v);
    };
    const realRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      w.__qa.raf += 1;
      return realRaf(callback);
    };
    document.addEventListener("input", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "range") w.__qa.rangeInputs += 1;
    });
    document.addEventListener("pointermove", () => {
      w.__qa.pointerMoves += 1;
    });
  }, PREFS_KEY);
}

export async function counters(page: Page): Promise<Counters> {
  return page.evaluate(() => {
    const q = (window as unknown as { __qa: Counters }).__qa;
    return { contexts: q.contexts, prefWrites: q.prefWrites, raf: q.raf, rangeInputs: q.rangeInputs, pointerMoves: q.pointerMoves };
  });
}

/** Live state of every AudioContext this document constructed, readable on any route. */
export async function contextStates(page: Page): Promise<{ state: string; time: number }[]> {
  return page.evaluate(() =>
    (window as unknown as { __qa: { instances: AudioContext[] } }).__qa.instances.map((c) => ({ state: c.state, time: c.currentTime })),
  );
}

export async function resetCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const q = (window as unknown as { __qa: Counters }).__qa;
    q.prefWrites = 0;
    q.raf = 0;
    q.rangeInputs = 0;
    q.pointerMoves = 0;
  });
}

/** The live graph, read from the trigger's attribute. */
export async function snapshot(page: Page): Promise<Snapshot> {
  const raw = await page.locator("[data-soundscape]").getAttribute("data-soundscape");
  if (raw === null) throw new Error("trigger has no data-soundscape attribute");
  return JSON.parse(raw) as Snapshot;
}

export async function openMixer(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Ambient sound", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export function sliderFor(dialog: Locator, label: string): Locator {
  return dialog.getByRole("slider", { name: `${label} level`, exact: true });
}

export function checkboxFor(dialog: Locator, label: string): Locator {
  return dialog.getByRole("checkbox", { name: label, exact: true });
}

export function stopOrStart(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: /^(Stop all sound|Start sound)$/ });
}

/** A stored mix: every layer keyed by id, so a fixture is valid by construction. */
export function mixFixture(overrides: Partial<Record<string, { on: boolean; level: number }>> = {}) {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, { on: false, level: DEFAULT_LEVEL, ...overrides[id] }]));
}

export async function seedPrefs(page: Page, theme: "light" | "dark" | "system", mix: ReturnType<typeof mixFixture>) {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PREFS_KEY, JSON.stringify({ state: { theme, gaugeStyle: "vessel", background: null, mix }, version: 1 })] as const,
  );
}

export async function storedPrefs(page: Page): Promise<{ version: number; state: Record<string, unknown> }> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), PREFS_KEY);
  if (raw === null) throw new Error("no stored preferences entry");
  return JSON.parse(raw) as { version: number; state: Record<string, unknown> };
}

/** Reads the focus-visible outline the browser actually resolves for an element. */
export async function outlineOf(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor };
  });
}
