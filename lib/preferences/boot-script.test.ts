import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DARK_CLASS,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  THEME_VALUES,
  resolveTheme,
  sanitizePreferences,
} from "./schema";
import { THEME_BOOT_SCRIPT } from "./boot-script";
import { usePreferencesStore } from "./store";

// Task 009 criteria 5, 7 and 8 (the synchronous half): the inline pre-hydration
// script is executed for real in jsdom, against real localStorage entries and a
// stubbed prefers-color-scheme, and compared with the store's resolver.

function setOs(osDark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? osDark : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** Runs the exact string the layout puts in <head>, as the browser would. */
function runBootScript(): void {
  // Executing the shipped inline script is the point of this test.
  new Function(THEME_BOOT_SCRIPT)();
}

function painted(): boolean {
  return document.documentElement.classList.contains(DARK_CLASS);
}

/** The resolver applied to the same sanitised value the store would hold. */
function expectedFor(storedRaw: string | null, osDark: boolean): boolean {
  let theme: unknown = undefined;
  if (storedRaw !== null) {
    try {
      const parsed: unknown = JSON.parse(storedRaw);
      theme = typeof parsed === "object" && parsed !== null ? (parsed as { state?: { theme?: unknown } }).state?.theme : undefined;
    } catch {
      theme = undefined;
    }
  }
  return resolveTheme(sanitizePreferences({ theme }).theme, osDark) === "dark";
}

const envelope = (theme: unknown) => JSON.stringify({ state: { theme }, version: PREFERENCES_VERSION });

// Every stored state the boot script can meet: no entry, each valid value, and
// each malformed shape both as a whole entry and as the theme inside a valid envelope.
const STORED_STATES: [string, string | null][] = [
  ["no entry", null],
  ...THEME_VALUES.map((value): [string, string] => [`envelope theme=${value}`, envelope(value)]),
  ["raw Dark (not JSON)", "Dark"],
  ["raw auto (not JSON)", "auto"],
  ["raw { (truncated JSON)", "{"],
  ["raw null", "null"],
  ["raw 42", "42"],
  ["raw empty string", ""],
  ["envelope theme Dark", envelope("Dark")],
  ["envelope theme auto", envelope("auto")],
  ["envelope theme null", envelope(null)],
  ["envelope theme 42", envelope(42)],
  ["envelope theme empty string", envelope("")],
  ["envelope theme #1c140e (a colour)", envelope("#1c140e")],
];

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.className = "";
});

describe("criterion 7: the boot script and the store read the same key with the same semantics", () => {
  it("the script is built from the shared key, value set and class name", () => {
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(PREFERENCES_STORAGE_KEY));
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify([...THEME_VALUES]));
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(DARK_CLASS));
  });

  it("the store's persist name is the same key the script reads", () => {
    expect(usePreferencesStore.persist.getOptions().name).toBe(PREFERENCES_STORAGE_KEY);
  });

  it("the script names the storage key exactly once, so a second copy cannot drift in", () => {
    const occurrences = THEME_BOOT_SCRIPT.split(PREFERENCES_STORAGE_KEY).length - 1;
    expect(occurrences).toBe(1);
  });

  it("a value written by the store is painted by the script for every enum value and both OS settings", () => {
    for (const value of THEME_VALUES) {
      for (const osDark of [false, true]) {
        window.localStorage.clear();
        document.documentElement.className = "";
        setOs(osDark);
        usePreferencesStore.getState().setTheme(value);
        const written = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
        runBootScript();
        expect(painted(), `${value} / OS dark=${osDark} / stored ${written}`).toBe(
          resolveTheme(value, osDark) === "dark",
        );
      }
    }
  });
});

describe("criterion 5: malformed stored values paint the default, never throw, never half-apply the class", () => {
  for (const [label, raw] of STORED_STATES) {
    for (const osDark of [false, true]) {
      it(`${label} / OS ${osDark ? "dark" : "light"}: painted per the resolver, class is 0 or 1 dark token`, () => {
        window.localStorage.clear();
        if (raw !== null) window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
        document.documentElement.className = "";
        setOs(osDark);
        expect(() => runBootScript()).not.toThrow();
        expect(painted()).toBe(expectedFor(raw, osDark));
        const tokens = document.documentElement.className.split(/\s+/).filter(Boolean);
        expect(tokens.filter((token) => token === DARK_CLASS).length).toBeLessThanOrEqual(1);
        expect(tokens.every((token) => token === DARK_CLASS)).toBe(true);
      });
    }
  }

  it("running the script twice leaves exactly one dark class, not two", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelope("dark"));
    setOs(false);
    runBootScript();
    runBootScript();
    expect(document.documentElement.className).toBe("dark");
  });

  it("storage that throws on read falls through to the default: system on an OS-dark machine paints dark", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    setOs(true);
    expect(() => runBootScript()).not.toThrow();
    expect(painted()).toBe(true);
  });

  it("with no matchMedia at all, system falls back to light and does not throw", () => {
    // @ts-expect-error -- simulating a browser without matchMedia
    delete window.matchMedia;
    expect(() => runBootScript()).not.toThrow();
    expect(painted()).toBe(false);
  });
});
