import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  GAUGE_STYLE_VALUES,
  PREFERENCE_DEFAULTS,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  THEME_VALUES,
  isPreferences,
  migratePreferences,
  resolveTheme,
  sanitizePreferences,
  type ThemePreference,
} from "./schema";
import { usePreferencesStore } from "./store";

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}`);
  return value;
}

// Task 009 criteria 2-5: the preference module. The store is exercised against
// jsdom's localStorage, so these tests read the entry the store actually writes.

describe("criterion 2: the pure resolver maps (stored, OS prefers-dark) to light or dark", () => {
  const table: [ThemePreference, boolean, "light" | "dark"][] = [
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
    ["system", false, "light"],
    ["system", true, "dark"],
  ];
  for (const [stored, osDark, expected] of table) {
    it(`${stored} with OS dark=${osDark} resolves to ${expected}`, () => {
      expect(resolveTheme(stored, osDark)).toBe(expected);
    });
  }

  it("the default is system, and the enum is exactly light, dark, system", () => {
    expect(DEFAULT_THEME).toBe("system");
    expect(PREFERENCE_DEFAULTS.theme).toBe("system");
    expect([...THEME_VALUES]).toEqual(["light", "dark", "system"]);
  });
});

describe("criterion 4: the entry carries its own key, a version and a migrate/merge", () => {
  it("uses its own storage key, not pomotato-timer", () => {
    expect(PREFERENCES_STORAGE_KEY).toBe("pomotato-preferences");
    expect(PREFERENCES_STORAGE_KEY).not.toBe("pomotato-timer");
    expect(usePreferencesStore.persist.getOptions().name).toBe(PREFERENCES_STORAGE_KEY);
  });

  it("carries a version constant that the persist options use", () => {
    expect(PREFERENCES_VERSION).toBe(1);
    expect(usePreferencesStore.persist.getOptions().version).toBe(PREFERENCES_VERSION);
  });

  it("defines migrate and merge", () => {
    const options = usePreferencesStore.persist.getOptions();
    expect(typeof options.migrate).toBe("function");
    expect(typeof options.merge).toBe("function");
  });
});

describe("criterion 5: sanitising malformed values falls back to the default, one shape per test", () => {
  // The listed shapes, as they could appear as the `theme` value of a parsed entry.
  const shapes: [string, unknown][] = [
    ['"Dark"', "Dark"],
    ['"auto"', "auto"],
    ['"{"', "{"],
    ["null", null],
    ["42", 42],
    ['"" (empty string)', ""],
  ];

  for (const [label, value] of shapes) {
    it(`theme ${label} sanitises to system and never throws`, () => {
      expect(() => sanitizePreferences({ theme: value })).not.toThrow();
      expect(sanitizePreferences({ theme: value })).toEqual({ theme: "system", gaugeStyle: "vessel", background: null });
      expect(isPreferences({ theme: value, gaugeStyle: "vessel" })).toBe(false);
    });
  }

  for (const garbage of [undefined, "Dark", 0, [], "{"]) {
    it(`a whole entry of ${JSON.stringify(garbage)} sanitises to the defaults`, () => {
      expect(sanitizePreferences(garbage)).toEqual(PREFERENCE_DEFAULTS);
      expect(migratePreferences(garbage)).toEqual(PREFERENCE_DEFAULTS);
    });
  }

  it("accepts exactly the three enum values and nothing else", () => {
    for (const value of THEME_VALUES) {
      for (const gaugeStyle of GAUGE_STYLE_VALUES) {
        expect(isPreferences({ theme: value, gaugeStyle, background: null })).toBe(true);
      }
    }
    expect(isPreferences({ theme: "DARK", gaugeStyle: "vessel" })).toBe(false);
    expect(isPreferences({ theme: "#1c140e", gaugeStyle: "vessel" })).toBe(false);
    expect(isPreferences({ theme: "dark dark", gaugeStyle: "vessel" })).toBe(false);
    // Each key is required: a complete theme with no gauge style is not a valid Preferences.
    expect(isPreferences({ theme: "dark" })).toBe(false);
  });
});

describe("criterion 3 and 5 against the storage entry: read what the store writes and reads", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ theme: "system", gaugeStyle: "vessel", hasHydrated: false });
  });

  it("persists only the enum and the background reference: the written entry is exactly the zustand envelope", () => {
    usePreferencesStore.getState().setTheme("dark");
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(must(raw, "stored entry"))).toEqual({ state: { theme: "dark", gaugeStyle: "vessel", background: null }, version: PREFERENCES_VERSION });
    // No colour value, hex, class name or component reference reaches storage.
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(raw).not.toMatch(/rgb|hsl|oklch/);
    expect(raw).not.toMatch(/class/i);
  });

  it("each of the three enum values is written as itself", () => {
    for (const value of THEME_VALUES) {
      usePreferencesStore.getState().setTheme(value);
      const parsed = JSON.parse(must(window.localStorage.getItem(PREFERENCES_STORAGE_KEY), "stored entry"));
      expect(parsed.state.theme).toBe(value);
      expect(parsed.state.gaugeStyle).toBe("vessel");
      expect(Object.keys(parsed.state).sort()).toEqual(["background", "gaugeStyle", "theme"]);
    }
  });

  it("setTheme cannot persist a non-enum value even when called with one", () => {
    usePreferencesStore.getState().setTheme("#000000" as unknown as ThemePreference);
    expect(usePreferencesStore.getState().theme).toBe("system");
  });

  // Each malformed shape is written under the real key as the raw string, then
  // rehydrated. The store must fall back to the default and must not throw.
  const rawShapes: [string, string][] = [
    ["Dark", "Dark"],
    ["auto", "auto"],
    ["{", "{"],
    ["null", "null"],
    ["42", "42"],
    ["empty string", ""],
  ];
  for (const [label, raw] of rawShapes) {
    it(`a stored raw value of ${label} rehydrates to system without throwing`, async () => {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
      // An exception here fails the test; a resolved rehydrate with no throw is the pass.
      await usePreferencesStore.persist.rehydrate();
      expect(usePreferencesStore.getState().theme).toBe("system");
    });
  }

  const envelopeShapes: [string, unknown][] = [
    ['"Dark"', "Dark"],
    ['"auto"', "auto"],
    ['"{"', "{"],
    ["null", null],
    ["42", 42],
    ['""', ""],
  ];
  for (const [label, value] of envelopeShapes) {
    it(`a well-formed envelope with theme ${label} rehydrates to system`, async () => {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ state: { theme: value }, version: PREFERENCES_VERSION }),
      );
      await usePreferencesStore.persist.rehydrate();
      expect(usePreferencesStore.getState().theme).toBe("system");
    });
  }

  // Criterion 5, "not written back as if valid": after rehydrating a malformed
  // entry the stored text may only be the fallback envelope for the default, never
  // the bad value kept under a valid-looking envelope. Measured: persist rewrites
  // malformed entries (including same-version ones) to system; see the QA Report.
  const writebackShapes: string[] = [
    "Dark",
    "auto",
    "{",
    "null",
    "42",
    "",
    JSON.stringify({ state: { theme: "Dark" }, version: PREFERENCES_VERSION }),
    JSON.stringify({ state: { theme: "auto" }, version: PREFERENCES_VERSION }),
    JSON.stringify({ state: { theme: 42 }, version: PREFERENCES_VERSION }),
  ];
  for (const raw of writebackShapes) {
    it(`after rehydrating ${raw.slice(0, 40) || "<empty>"}, the stored entry is the valid system envelope, not the bad value`, async () => {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
      await usePreferencesStore.persist.rehydrate();
      const after = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
      expect(after).not.toBeNull();
      expect(JSON.parse(must(after, "stored entry after rehydrate"))).toEqual({ state: { theme: "system", gaugeStyle: "vessel", background: null }, version: PREFERENCES_VERSION });
      expect(after).not.toContain("Dark");
      expect(after).not.toContain("auto");
    });
  }

  it("a valid stored value survives rehydration", async () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ state: { theme: "dark" }, version: PREFERENCES_VERSION }),
    );
    await usePreferencesStore.persist.rehydrate();
    expect(usePreferencesStore.getState().theme).toBe("dark");
  });
});

describe("task 010: the background reference", () => {
  const shipped = { state: { theme: "dark", gaugeStyle: "glyph" }, version: 1 };

  it("the literal shipped payload keeps both keys and gains the null default", () => {
    expect(sanitizePreferences(shipped.state)).toEqual({ theme: "dark", gaugeStyle: "glyph", background: null });
    expect(isPreferences(shipped.state)).toBe(false);
  });

  it("persist rehydrates the shipped payload and writes the sanitised state back", async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(shipped));
    await usePreferencesStore.persist.rehydrate();
    const state = usePreferencesStore.getState();
    expect([state.theme, state.gaugeStyle, state.background]).toEqual(["dark", "glyph", null]);
    const written = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null");
    expect(written).toEqual({ state: { theme: "dark", gaugeStyle: "glyph", background: null }, version: PREFERENCES_VERSION });
  });

  const bad: unknown[] = [42, true, {}, [], "has space", "a/b", "", "x".repeat(65), undefined];
  it.each(bad)("a malformed reference %j becomes null and leaves theme and gaugeStyle alone", (value) => {
    expect(sanitizePreferences({ theme: "light", gaugeStyle: "glyph", background: value })).toEqual({
      theme: "light",
      gaugeStyle: "glyph",
      background: null,
    });
  });

  it("a well-formed reference is kept and the stored envelope stays small", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    usePreferencesStore.getState().setBackground(id);
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "";
    expect(JSON.parse(raw).state).toEqual({ theme: usePreferencesStore.getState().theme, gaugeStyle: usePreferencesStore.getState().gaugeStyle, background: id });
    expect(raw.length).toBeLessThan(1024);
    usePreferencesStore.getState().setBackground(null);
  });
});
