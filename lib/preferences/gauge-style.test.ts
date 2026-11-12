import { beforeEach, describe, expect, it } from "vitest";
import { defaultMix } from "../audio/mix";
import {
  DEFAULT_GAUGE_STYLE,
  GAUGE_STYLE_VALUES,
  PREFERENCE_DEFAULTS,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  isPreferences,
  migratePreferences,
  sanitizePreferences,
} from "./schema";
import { usePreferencesStore } from "./store";

// Task 008 criterion 7 and criterion 9. The gauge style is the second key of the
// single `pomotato-preferences` entry. Malformed values fall back per key, never
// throw, and the sanitised payload is written back over the bad entry.

function storedEntry(): unknown {
  const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
  if (raw === null) throw new Error("expected a stored preferences entry");
  return JSON.parse(raw);
}

describe("criterion 9: the default gauge style is the vessel, the surface does not change until chosen", () => {
  it("DEFAULT_GAUGE_STYLE and PREFERENCE_DEFAULTS.gaugeStyle are both vessel", () => {
    expect(DEFAULT_GAUGE_STYLE).toBe("vessel");
    expect(PREFERENCE_DEFAULTS.gaugeStyle).toBe("vessel");
  });

  it("the value set is exactly the vessel and the in-glyph two-tone, in that order", () => {
    expect([...GAUGE_STYLE_VALUES]).toEqual(["vessel", "glyph"]);
  });
});

describe("criterion 7: malformed persisted data falls back per key and never throws (pure sanitiser)", () => {
  // The theme stays valid, so each row shows the gauge key alone falls back.
  const badGaugeValues: [string, unknown][] = [
    ["an unknown identifier", "variant2"],
    ["a colour", "#f6c453"],
    ["a class name", "bg-primary"],
    ["a component name", "SloshGauge"],
    ["a case-changed identifier", "Glyph"],
    ["an empty string", ""],
    ["a number", 1],
    ["an array index", 0],
    ["null", null],
    ["a boolean", true],
    ["an object", { style: "glyph" }],
  ];

  for (const [label, value] of badGaugeValues) {
    it(`gaugeStyle as ${label} falls back to the vessel and keeps the other keys`, () => {
      let result: ReturnType<typeof sanitizePreferences> | undefined;
      expect(() => {
        result = sanitizePreferences({ gaugeStyle: value });
      }).not.toThrow();
      expect(result).toEqual({ gaugeStyle: "vessel", background: null, mix: defaultMix(), taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
      expect(isPreferences({ gaugeStyle: value })).toBe(false);
    });
  }

  it("a missing gaugeStyle key falls back to the vessel and keeps the other keys", () => {
    expect(sanitizePreferences({ theme: "light" })).toEqual({ gaugeStyle: "vessel", background: null, mix: defaultMix(), taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
  });

  it("a valid gaugeStyle survives sanitising", () => {
    expect(sanitizePreferences({ gaugeStyle: "glyph" })).toEqual({
            gaugeStyle: "glyph",
      background: null,
    mix: defaultMix(),
    taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50,
    });
  });

  const wholePayloads: [string, unknown][] = [
    ["a non-object number", 42],
    ["a string", "glyph"],
    ["an array", ["glyph"]],
    ["null", null],
    ["undefined", undefined],
  ];
  for (const [label, value] of wholePayloads) {
    it(`a non-object payload of ${label} sanitises to the defaults and migrates to them`, () => {
      expect(sanitizePreferences(value)).toEqual(PREFERENCE_DEFAULTS);
      expect(migratePreferences(value)).toEqual(PREFERENCE_DEFAULTS);
    });
  }
});

describe("criterion 7 against the storage entry: the store rehydrates bad data and writes the sanitised payload back", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ gaugeStyle: "vessel", mix: defaultMix(), hasHydrated: false });
  });

  // Each raw entry is rehydrated. Pass means no throw, the bad key defaults, the good key
  // survives, and the stored entry is rewritten as the valid envelope.
  const storedCases: [string, string, { gaugeStyle: string }][] = [
    [
      "an unknown gauge identifier",
      JSON.stringify({ state: { theme: "dark", gaugeStyle: "variant2" }, version: PREFERENCES_VERSION }),
      { gaugeStyle: "vessel" },
    ],
    [
      "a wrong-typed gauge value",
      JSON.stringify({ state: { theme: "light", gaugeStyle: 1 }, version: PREFERENCES_VERSION }),
      { gaugeStyle: "vessel" },
    ],
    [
      "a missing gauge key",
      JSON.stringify({ state: { theme: "dark" }, version: PREFERENCES_VERSION }),
      { gaugeStyle: "vessel" },
    ],
    [
      "an older version with a valid gauge value",
      JSON.stringify({ state: { theme: "dark", gaugeStyle: "glyph" }, version: 0 }),
      { gaugeStyle: "glyph" },
    ],
    [
      "an older version with no gauge key",
      JSON.stringify({ state: { theme: "light" }, version: 0 }),
      { gaugeStyle: "vessel" },
    ],
    [
      "a newer version with a bad gauge value",
      JSON.stringify({ state: { theme: "dark", gaugeStyle: "glyph2" }, version: 2 }),
      { gaugeStyle: "vessel" },
    ],
    [
      "a non-object state",
      JSON.stringify({ state: 42, version: PREFERENCES_VERSION }),
      { gaugeStyle: "vessel" },
    ],
    ["unparseable JSON", "{", { gaugeStyle: "vessel" }],
    ["a non-object payload", "[]", { gaugeStyle: "vessel" }],
  ];

  for (const [label, raw, expected] of storedCases) {
    it(`${label} rehydrates per key without throwing and is written back sanitised`, async () => {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
      await expect(usePreferencesStore.persist.rehydrate()).resolves.not.toThrow();
      const state = usePreferencesStore.getState();
      expect(state.gaugeStyle).toBe(expected.gaugeStyle);
      expect(storedEntry()).toEqual({
        state: { gaugeStyle: expected.gaugeStyle, background: null, mix: defaultMix(), taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 },
        version: PREFERENCES_VERSION,
      });
    });
  }

  it("the sanitised payload is written back over the bad entry, not left untouched", async () => {
    const bad = '{"state":{"theme":"dark","gaugeStyle":"variant2"},"version":1}';
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, bad);
    await usePreferencesStore.persist.rehydrate();
    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).not.toBe(bad);
    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).not.toContain("variant2");
  });
});

describe("the upgrade path: every existing user's payload rehydrates to the gauge default", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ gaugeStyle: "vessel", mix: defaultMix(), hasHydrated: false });
  });

  it("the literal {\"state\":{\"theme\":\"dark\"},\"version\":1} keeps theme dark and gains gaugeStyle vessel", async () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      '{"state":{"theme":"dark"},"version":1}',
    );
    await usePreferencesStore.persist.rehydrate();
    const state = usePreferencesStore.getState();
    // Not a discarded payload, and not theme reset to system.
    expect(state.gaugeStyle).toBe("vessel");
    expect(state.hasHydrated).toBe(true);
    // Persist widens the envelope on write-back; the theme is preserved in it.
    expect(storedEntry()).toEqual({
      state: { gaugeStyle: "vessel", background: null, mix: defaultMix(), taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 },
      version: 3,
    });
  });
});
