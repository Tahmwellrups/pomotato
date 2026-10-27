import { beforeEach, describe, expect, it } from "vitest";
import { PREFERENCE_DEFAULTS, PREFERENCES_STORAGE_KEY, PREFERENCES_VERSION, isPreferences, sanitizePreferences } from "../preferences/schema";
import { usePreferencesStore } from "../preferences/store";
import { DEFAULT_LEVEL, LEVEL_MAX, LEVEL_MIN } from "./gain";
import { LAYERS } from "./layers";
import { defaultMix, isMix, sanitizeMix, type Mix } from "./mix";

// Task 011 criteria 4, 5 and 9 (unit half). Criterion 5 is table-driven against
// the sanitiser and against the store's rehydrate path, and every row checks the
// three neighbouring keys survive. Per-layer checks loop over LAYERS.

const ID = "123e4567-e89b-42d3-a456-426614174000";
const VALID_THEME = { theme: "dark", gaugeStyle: "glyph", background: ID };

function validMix(): Mix {
  return Object.fromEntries(LAYERS.map((layer, index) => [layer.id, { on: index % 2 === 0, level: 10 + index * 20 }]));
}

function defaultMixFor(): Mix {
  return Object.fromEntries(LAYERS.map((layer) => [layer.id, { on: false, level: DEFAULT_LEVEL }]));
}

function expectNeighboursIntact(result: { theme: string; gaugeStyle: string; background: string | null }) {
  expect(result.theme).toBe("dark");
  expect(result.gaugeStyle).toBe("glyph");
  expect(result.background).toBe(ID);
}

function withMix(mix: unknown): unknown {
  return { ...VALID_THEME, mix };
}

describe("criterion 5: every malformed mix yields a valid mix and leaves the other keys intact", () => {
  const withoutLayer = { ...validMix() } as Record<string, unknown>;
  delete withoutLayer[LAYERS[0].id];
  const rows: [string, unknown][] = [
    ["key absent", undefined],
    ["null", null],
    ["a number", 42],
    ["a string", "rain"],
    ["an array", [1, 2]],
    ["an unknown layer id present", { ...validMix(), laser: { on: true, level: 80 } }],
    ["a known layer id missing", withoutLayer],
    ["a level above the maximum", { ...validMix(), [LAYERS[0].id]: { on: true, level: LEVEL_MAX + 1 } }],
    ["a level below zero", { ...validMix(), [LAYERS[0].id]: { on: true, level: LEVEL_MIN - 1 } }],
    ["a non-numeric level", { ...validMix(), [LAYERS[0].id]: { on: true, level: "50" } }],
    ["a non-boolean on/off", { ...validMix(), [LAYERS[0].id]: { on: "yes", level: 50 } }],
    ["a fractional level", { ...validMix(), [LAYERS[0].id]: { on: true, level: 50.5 } }],
    ["a NaN level", { ...validMix(), [LAYERS[0].id]: { on: true, level: NaN } }],
  ];

  for (const [label, mix] of rows) {
    it(`mix ${label}: sanitises to a valid mix, keeps theme, gaugeStyle and background`, () => {
      let result: ReturnType<typeof sanitizePreferences> | undefined;
      expect(() => {
        result = sanitizePreferences(withMix(mix));
      }).not.toThrow();
      expect(result && isMix(result.mix)).toBe(true);
      expectNeighboursIntact(result as ReturnType<typeof sanitizePreferences>);
    });
  }

  it("an unknown layer id is dropped, not kept", () => {
    const sanitised = sanitizeMix({ ...validMix(), laser: { on: true, level: 80 } });
    expect(Object.keys(sanitised).sort()).toEqual(LAYERS.map((layer) => layer.id).sort());
    expect("laser" in sanitised).toBe(false);
  });

  it("an out-of-range or fractional level takes the default, it is not clamped to the edge", () => {
    const sanitised = sanitizeMix({ [LAYERS[0].id]: { on: true, level: LEVEL_MAX + 50 } });
    expect(sanitised[LAYERS[0].id].level).toBe(DEFAULT_LEVEL);
    expect(sanitizeMix({ [LAYERS[0].id]: { on: true, level: -40 } })[LAYERS[0].id].level).toBe(DEFAULT_LEVEL);
    expect(sanitizeMix({ [LAYERS[0].id]: { on: true, level: 33.3 } })[LAYERS[0].id].level).toBe(DEFAULT_LEVEL);
  });

  it("a non-object mix becomes the default mix for every layer", () => {
    for (const mix of [undefined, null, 42, "rain", [1]]) {
      expect(sanitizeMix(mix)).toEqual(defaultMixFor());
    }
  });
});

describe("criterion 5 against the storage entry: rehydrate, unparseable JSON, version skew", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ ...PREFERENCE_DEFAULTS, theme: "dark", gaugeStyle: "glyph", background: ID, mix: defaultMix(), hasHydrated: false });
  });

  const envelopes: [string, string][] = [
    ["unparseable JSON", "{"],
    ["a newer version with a malformed mix", JSON.stringify({ state: { ...VALID_THEME, mix: "rain" }, version: PREFERENCES_VERSION + 1 })],
    ["an older version with a malformed mix", JSON.stringify({ state: { ...VALID_THEME, mix: { [LAYERS[0].id]: { on: true, level: 999 } } }, version: 0 })],
    ["a v1 envelope with the mix key absent", JSON.stringify({ state: { theme: "dark", gaugeStyle: "glyph", background: ID }, version: PREFERENCES_VERSION })],
  ];

  for (const [label, raw] of envelopes) {
    it(`${label}: rehydrates without throwing, keeps the neighbours, and the mix is valid`, async () => {
      if (label.startsWith("unparseable")) {
        // A fresh page load starts from the defaults; an unparseable entry must fall back to them.
        usePreferencesStore.setState({ ...PREFERENCE_DEFAULTS, hasHydrated: false });
        window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
        await expect(usePreferencesStore.persist.rehydrate()).resolves.not.toThrow();
        expect(usePreferencesStore.getState().theme).toBe("system");
        expect(usePreferencesStore.getState().mix).toEqual(defaultMixFor());
        return;
      }
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
      await usePreferencesStore.persist.rehydrate();
      const state = usePreferencesStore.getState();
      expect(isMix(state.mix)).toBe(true);
      expect(state.theme).toBe("dark");
      expect(state.gaugeStyle).toBe("glyph");
      expect(state.background).toBe(ID);
    });
  }

  it("the literal shipped payload keeps all three keys and gains the default mix", async () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      '{"state":{"theme":"dark","gaugeStyle":"glyph","background":null},"version":1}',
    );
    await usePreferencesStore.persist.rehydrate();
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(stored.version).toBe(PREFERENCES_VERSION);
    expect(Object.keys(stored.state).sort()).toEqual(["background", "gaugeStyle", "mix", "theme"]);
    expect(stored.state).toMatchObject({ theme: "dark", gaugeStyle: "glyph", background: null });
    expect(stored.state.mix).toEqual(defaultMixFor());
  });

  it("the store writes the sanitised mix back over a malformed one (DECISIONS 2026-10-23)", async () => {
    const bad = '{"state":{"theme":"dark","gaugeStyle":"glyph","background":null,"mix":"rain"},"version":1}';
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, bad);
    await usePreferencesStore.persist.rehydrate();
    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).not.toBe(bad);
    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).not.toContain('"mix":"rain"');
  });
});

describe("criterion 4: the mix is one key, and levels outlive mute, across a reload", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ mix: defaultMix() });
  });

  it("the default mix is the registry, one entry per layer, nothing on", () => {
    expect(Object.keys(defaultMix()).sort()).toEqual(LAYERS.map((layer) => layer.id).sort());
    for (const layer of LAYERS) expect(defaultMix()[layer.id]).toEqual({ on: false, level: DEFAULT_LEVEL });
  });

  it("the stored state carries the mix as the fourth key of the single entry", () => {
    usePreferencesStore.getState().setMix(validMix());
    const parsed = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as { state: Record<string, unknown>; version: number };
    expect(parsed.version).toBe(PREFERENCES_VERSION);
    expect(Object.keys(parsed.state).sort()).toEqual(["background", "gaugeStyle", "mix", "theme"]);
    expect(isPreferences({ ...parsed.state })).toBe(true);
  });

  for (const layer of LAYERS) {
    it(`${layer.id}: a level set, muted, unmuted and reloaded comes back unchanged`, async () => {
      const level = 73;
      const store = usePreferencesStore.getState();
      store.setMix({ ...defaultMix(), [layer.id]: { on: true, level } });
      store.setMix({ ...usePreferencesStore.getState().mix, [layer.id]: { on: false, level } });
      store.setMix({ ...usePreferencesStore.getState().mix, [layer.id]: { on: true, level } });
      const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "";
      // Setting the defaults in memory persists them too, so put the stored entry back before the reload.
      usePreferencesStore.setState({ mix: defaultMix() });
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, stored);
      await usePreferencesStore.persist.rehydrate();
      expect(usePreferencesStore.getState().mix[layer.id]).toEqual({ on: true, level });
    });
  }
});

describe("criterion 9: the registry is the only list; a fifth entry is accepted without other edits", () => {
  it("every consumer derives from LAYERS: default mix and validator agree on the same ids", () => {
    const ids = LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(defaultMix()).sort()).toEqual([...ids].sort());
    expect(isMix(defaultMix())).toBe(true);
  });

  it("the four shipped ids are exactly rain, wind, waves and hum", () => {
    expect(LAYERS.map((layer) => layer.id)).toEqual(["rain", "wind", "waves", "hum"]);
  });

  it("the validator rejects a mix that is missing any registry layer", () => {
    const missing = { ...defaultMix() } as Mix;
    delete missing[LAYERS[LAYERS.length - 1].id];
    expect(isMix(missing)).toBe(false);
  });
});
