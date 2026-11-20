import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMix } from "../audio/mix";
import {
  DEFAULT_GAUGE_STYLE,
  PREFERENCE_DEFAULTS,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  isPreferences,
  migratePreferences,
  sanitizePreferences,
} from "./schema";
import { usePreferencesStore } from "./store";

// Task 022 criteria 15, 16, 17, 18 and 20 (unit half). The 3 -> 4 bump adds
// `gaugeEnabled` (default false, owner ruling 2026-11-19 mid-run). Every existing key must survive the bump with
// a non-default value, so a reset-to-default migration cannot pass.

const BACKGROUND_ID = "123e4567-e89b-42d3-a456-426614174000";

// Every key the version-3 entry held, each set to a value that is not the default.
const VERSION_3_STATE = {
  background: BACKGROUND_ID,
  mix: { ...defaultMix(), rain: { on: true, level: 40 } },
  taskPanelVisible: false,
  focusMinutes: 40,
  shortBreakMinutes: 9,
  longBreakMinutes: 30,
  chimeEnabled: false,
  chimeLevel: 20,
  gaugeStyle: "glyph",
};

beforeEach(() => {
  window.localStorage.clear();
  usePreferencesStore.setState({ hasHydrated: false });
});

describe("criterion 20: a fresh install defaults to the gauge off, in the vessel style", () => {
  it("PREFERENCE_DEFAULTS is gaugeEnabled false and gaugeStyle vessel", () => {
    expect(PREFERENCE_DEFAULTS.gaugeEnabled).toBe(false);
    expect(PREFERENCE_DEFAULTS.gaugeStyle).toBe("vessel");
    expect(DEFAULT_GAUGE_STYLE).toBe("vessel");
  });
});

describe("criterion 15, 16: the 3 -> 4 migration keeps every key and fills gaugeEnabled from the default", () => {
  it("the version is 4", () => {
    expect(PREFERENCES_VERSION).toBe(4);
  });

  it("migratePreferences on a version-3 state keeps every existing key and adds gaugeEnabled false", () => {
    expect(migratePreferences(VERSION_3_STATE)).toEqual({ ...VERSION_3_STATE, gaugeEnabled: false });
  });

  it("rehydrating a stored version-3 entry keeps every key and writes gaugeEnabled false back at version 4", async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ state: VERSION_3_STATE, version: 3 }));
    await usePreferencesStore.persist.rehydrate();
    const written = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as { state: unknown; version: number };
    expect(written.version).toBe(4);
    expect(written.state).toEqual({ ...VERSION_3_STATE, gaugeEnabled: false });
    const state = usePreferencesStore.getState();
    expect(state).toMatchObject({ ...VERSION_3_STATE, gaugeEnabled: false });
  });

  it("a version-1 entry keeps its gaugeStyle and background and gains gaugeEnabled false", async () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ state: { theme: "dark", gaugeStyle: "glyph", background: BACKGROUND_ID }, version: 1 }),
    );
    await usePreferencesStore.persist.rehydrate();
    const written = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as { state: unknown; version: number };
    expect(written.version).toBe(4);
    expect(written.state).toEqual({ ...PREFERENCE_DEFAULTS, gaugeStyle: "glyph", background: BACKGROUND_ID });
  });
});

describe("criterion 17, 18: a bad gauge value falls back per key, never throws, never logs, and the two keys stay independent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const staleStyles: unknown[] = ["ring", "", null, 7, { style: "glyph" }];

  it.each(staleStyles)("gaugeStyle %j falls back to the vessel with no thrown error and no console output", (value) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let result: ReturnType<typeof sanitizePreferences> | undefined;
    expect(() => {
      result = sanitizePreferences({ gaugeStyle: value, gaugeEnabled: true });
    }).not.toThrow();
    expect(result?.gaugeStyle).toBe("vessel");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["the string \"false\"", "false"],
    ["the number 0", 0],
    ["null", null],
    ["a non-boolean string", "yes"],
  ])("a non-boolean gaugeEnabled (%s) falls back to false and isPreferences rejects it", (_label, value) => {
    expect(sanitizePreferences({ gaugeEnabled: value }).gaugeEnabled).toBe(false);
    expect(isPreferences({ ...PREFERENCE_DEFAULTS, gaugeEnabled: value })).toBe(false);
  });

  it("a stale gaugeStyle does not disable the gauge", () => {
    const result = sanitizePreferences({ gaugeStyle: "ring", gaugeEnabled: false });
    expect(result.gaugeEnabled).toBe(false);
    expect(result.gaugeStyle).toBe("vessel");
  });

  it("gaugeEnabled false does not rewrite a valid gaugeStyle", () => {
    const result = sanitizePreferences({ gaugeStyle: "glyph", gaugeEnabled: false });
    expect(result.gaugeEnabled).toBe(false);
    expect(result.gaugeStyle).toBe("glyph");
  });

  it("a stored stale gaugeStyle with gaugeEnabled false rehydrates with the switch still off", async () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ state: { gaugeStyle: "ring", gaugeEnabled: false }, version: 4 }),
    );
    await usePreferencesStore.persist.rehydrate();
    const state = usePreferencesStore.getState();
    expect(state.gaugeEnabled).toBe(false);
    expect(state.gaugeStyle).toBe("vessel");
  });
});
