import { beforeEach, describe, expect, it } from "vitest";
import { defaultMix } from "../audio/mix";
import { DURATION_LIMITS } from "../timer/constants";
import { PREFERENCE_DEFAULTS, PREFERENCES_STORAGE_KEY, PREFERENCES_VERSION, sanitizePreferences } from "./schema";
import { usePreferencesStore } from "./store";

// Task 017 criteria 24, 25, 26 (unit half). The five new keys, the version-2
// upgrade, and per-key fallback that never clamps a corrupt level.

const EXISTING = { theme: "dark", gaugeStyle: "glyph", background: null, mix: defaultMix(), taskPanelVisible: false };

describe("criterion 24: the five keys are in the schema at version 3", () => {
  it("PREFERENCES_VERSION is 3 and the defaults are 25, 5, 15, sound on, level 50", () => {
    expect(PREFERENCES_VERSION).toBe(3);
    expect(PREFERENCE_DEFAULTS).toMatchObject({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
  });

  it("the defaults reference the one constants module", () => {
    expect(PREFERENCE_DEFAULTS.focusMinutes).toBe(DURATION_LIMITS.focusMinutes.default);
    expect(PREFERENCE_DEFAULTS.shortBreakMinutes).toBe(DURATION_LIMITS.shortBreakMinutes.default);
    expect(PREFERENCE_DEFAULTS.longBreakMinutes).toBe(DURATION_LIMITS.longBreakMinutes.default);
  });
});

describe("criterion 25: a version-2 entry loads with the five new keys at their defaults and every existing key preserved", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("rehydrating a version 2 payload keeps theme, gaugeStyle, background, mix and taskPanelVisible", async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ state: EXISTING, version: 2 })
    );
    await usePreferencesStore.persist.rehydrate();
    const state = usePreferencesStore.getState();
    expect(state).toMatchObject({ ...EXISTING, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
    const written = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!);
    expect(written.version).toBe(3);
    expect(written.state).toMatchObject({ theme: "dark", gaugeStyle: "glyph", taskPanelVisible: false, focusMinutes: 25 });
  });
});

describe("criterion 26: per-key fallback, each new key independently, never discarding the others", () => {
  const cases: [string, string, unknown, unknown][] = [
    ["focusMinutes", "a string", "40", 25],
    ["focusMinutes", "a fraction", 40.5, 25],
    ["focusMinutes", "above its bound", 181, 25],
    ["focusMinutes", "null", null, 25],
    ["shortBreakMinutes", "above its own bound", 61, 5],
    ["shortBreakMinutes", "zero", 0, 5],
    ["longBreakMinutes", "above its own bound", 121, 15],
    ["longBreakMinutes", "a string", "15", 15],
    ["chimeEnabled", "a string", "false", true],
    ["chimeEnabled", "null", null, true],
    ["chimeLevel", "above 100 (not clamped to 100)", 150, 50],
    ["chimeLevel", "below 0 (not clamped to 0)", -10, 50],
    ["chimeLevel", "a fraction", 50.5, 50],
    ["chimeLevel", "a string", "70", 50],
    ["chimeLevel", "null", null, 50],
  ];

  it.each(cases)("%s with %s falls back to %j on its own", (key, _label, bad, fallback) => {
    const raw = { ...EXISTING, focusMinutes: 40, shortBreakMinutes: 9, longBreakMinutes: 30, chimeEnabled: false, chimeLevel: 20, [key]: bad };
    const result = sanitizePreferences(raw);
    expect(result[key as keyof typeof result]).toBe(fallback);
    // Every other key survives: the bad one never discards its neighbours.
    const others = { focusMinutes: 40, shortBreakMinutes: 9, longBreakMinutes: 30, chimeEnabled: false, chimeLevel: 20 } as const;
    for (const [other, value] of Object.entries(others)) {
      if (other === key) continue;
      expect(result[other as keyof typeof result]).toBe(value);
    }
    expect(result).toMatchObject({ theme: "dark", gaugeStyle: "glyph", taskPanelVisible: false });
  });

  it("a missing key takes its own default and nothing else changes", () => {
    const { focusMinutes: _omit, ...withoutFocus } = { ...EXISTING, focusMinutes: 40, shortBreakMinutes: 9, longBreakMinutes: 30, chimeEnabled: false, chimeLevel: 20 };
    expect(sanitizePreferences(withoutFocus)).toMatchObject({ focusMinutes: 25, shortBreakMinutes: 9, longBreakMinutes: 30, chimeEnabled: false, chimeLevel: 20 });
  });

  it("a corrupt level takes the default rather than being clamped, so it never becomes a loud one", () => {
    expect(sanitizePreferences({ chimeLevel: 101 }).chimeLevel).toBe(50);
    expect(sanitizePreferences({ chimeLevel: 100 }).chimeLevel).toBe(100);
    expect(sanitizePreferences({ chimeLevel: 0 }).chimeLevel).toBe(0);
  });
});
