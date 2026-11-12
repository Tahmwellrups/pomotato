import { describe, expect, it } from "vitest";
import { defaultMix } from "../audio/mix";
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  isPreferences,
  sanitizePreferences,
} from "./schema";
import { usePreferencesStore } from "./store";

// Task 009 criteria 2-5: the preference module. The store is exercised against
// jsdom's localStorage, so these tests read the entry the store actually writes.

describe("criterion 4: the entry carries its own key, a version and a migrate/merge", () => {
  it("uses its own storage key, not pomotato-timer", () => {
    expect(PREFERENCES_STORAGE_KEY).toBe("pomotato-preferences");
    expect(PREFERENCES_STORAGE_KEY).not.toBe("pomotato-timer");
    expect(usePreferencesStore.persist.getOptions().name).toBe(PREFERENCES_STORAGE_KEY);
  });

  it("carries a version constant that the persist options use", () => {
    expect(PREFERENCES_VERSION).toBe(3);
    expect(usePreferencesStore.persist.getOptions().version).toBe(PREFERENCES_VERSION);
  });

  it("defines migrate and merge", () => {
    const options = usePreferencesStore.persist.getOptions();
    expect(typeof options.migrate).toBe("function");
    expect(typeof options.merge).toBe("function");
  });
});

describe("task 010: the background reference", () => {
  const shipped = { state: { gaugeStyle: "glyph" }, version: 1 };

  it("the literal shipped payload keeps the gaugeStyle key and gains the null default", () => {
    expect(sanitizePreferences(shipped.state)).toEqual({ gaugeStyle: "glyph", background: null, mix: defaultMix(), taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
    expect(isPreferences(shipped.state)).toBe(false);
  });

  it("persist rehydrates the shipped payload and writes the sanitised state back", async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(shipped));
    await usePreferencesStore.persist.rehydrate();
    const state = usePreferencesStore.getState();
    expect([state.gaugeStyle, state.background]).toEqual(["glyph", null]);
    const written = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null");
    expect(written).toEqual({ state: { gaugeStyle: "glyph", background: null, mix: defaultMix(), taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 }, version: PREFERENCES_VERSION });
  });

  const bad: unknown[] = [42, true, {}, [], "has space", "a/b", "", "x".repeat(65), undefined];
  it.each(bad)("a malformed reference %j becomes null and leaves gaugeStyle alone", (value) => {
    expect(sanitizePreferences({ theme: "light", gaugeStyle: "glyph", background: value })).toEqual({
      gaugeStyle: "glyph",
      background: null,
    mix: defaultMix(),
    taskPanelVisible: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50,
    });
  });

  it("a well-formed reference is kept and the stored envelope stays small", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    usePreferencesStore.getState().setBackground(id);
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "";
    expect(JSON.parse(raw).state).toEqual({ gaugeStyle: usePreferencesStore.getState().gaugeStyle, background: id, mix: usePreferencesStore.getState().mix, taskPanelVisible: usePreferencesStore.getState().taskPanelVisible, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
    expect(raw.length).toBeLessThan(1024);
    usePreferencesStore.getState().setBackground(null);
  });
});
