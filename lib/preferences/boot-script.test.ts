import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DARK_CLASS,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  TASK_PANEL_ATTRIBUTE,
  TASK_PANEL_HIDDEN_VALUE,
  THEME_VALUES,
  resolveTheme,
  sanitizePreferences,
} from "./schema";
import { PREFERENCES_BOOT_SCRIPT } from "./boot-script";
import { usePreferencesStore } from "./store";

// Task 009 criteria 5, 7 and 8 (the synchronous half), extended by task 015
// criterion 32: the inline pre-hydration script is executed for real in jsdom,
// against real localStorage entries and a stubbed prefers-color-scheme, and is
// compared with the store's resolver (theme) and sanitiser (taskPanelVisible).

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
  new Function(PREFERENCES_BOOT_SCRIPT)();
}

function painted(): boolean {
  return document.documentElement.classList.contains(DARK_CLASS);
}

/** The attribute the script leaves on <html>, or null when it is absent. */
function panelAttr(): string | null {
  return document.documentElement.getAttribute(TASK_PANEL_ATTRIBUTE);
}

function hiddenByScript(): boolean {
  return panelAttr() === TASK_PANEL_HIDDEN_VALUE;
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

/** A version-2 envelope whose state carries `taskPanelVisible` as given. */
function envelopeWithPanel(theme: unknown, panel: unknown): string {
  return JSON.stringify({ state: { theme, taskPanelVisible: panel }, version: PREFERENCES_VERSION });
}

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

/** Every value the panel key can hold in storage, including the absent key (a v1 payload). */
const PANEL_STATES: [string, unknown][] = [
  ["absent (v1 payload)", undefined],
  ["true", true],
  ["false", false],
  ['"false" (string)', "false"],
  ["0", 0],
  ["null", null],
];

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute(TASK_PANEL_ATTRIBUTE);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.className = "";
  document.documentElement.removeAttribute(TASK_PANEL_ATTRIBUTE);
});

describe("criterion 7: the boot script and the store read the same key with the same semantics", () => {
  it("the script is built from the shared key, value set, class name and panel attribute", () => {
    expect(PREFERENCES_BOOT_SCRIPT).toContain(JSON.stringify(PREFERENCES_STORAGE_KEY));
    expect(PREFERENCES_BOOT_SCRIPT).toContain(JSON.stringify([...THEME_VALUES]));
    expect(PREFERENCES_BOOT_SCRIPT).toContain(JSON.stringify(DARK_CLASS));
    expect(PREFERENCES_BOOT_SCRIPT).toContain(JSON.stringify(TASK_PANEL_ATTRIBUTE));
    expect(PREFERENCES_BOOT_SCRIPT).toContain(JSON.stringify(TASK_PANEL_HIDDEN_VALUE));
  });

  it("the store's persist name is the same key the script reads", () => {
    expect(usePreferencesStore.persist.getOptions().name).toBe(PREFERENCES_STORAGE_KEY);
  });

  it("the script names the storage key exactly once, so a second copy cannot drift in", () => {
    const occurrences = PREFERENCES_BOOT_SCRIPT.split(PREFERENCES_STORAGE_KEY).length - 1;
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

  it("a panel value written by the store is hidden by the script exactly when the store holds false", () => {
    setOs(false);
    for (const visible of [true, false]) {
      window.localStorage.clear();
      document.documentElement.removeAttribute(TASK_PANEL_ATTRIBUTE);
      usePreferencesStore.getState().setTaskPanelVisible(visible);
      const written = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
      runBootScript();
      expect(hiddenByScript(), `taskPanelVisible=${visible} / stored ${written}`).toBe(!visible);
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
    expect(panelAttr()).toBeNull();
  });

  it("with no matchMedia at all, system falls back to light and does not throw", () => {
    // @ts-expect-error -- simulating a browser without matchMedia
    delete window.matchMedia;
    expect(() => runBootScript()).not.toThrow();
    expect(painted()).toBe(false);
  });
});

describe("task 015 criterion 32 (boot half): the panel attribute is set only for a stored boolean false", () => {
  it("stored taskPanelVisible false sets the hidden attribute", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelopeWithPanel("system", false));
    setOs(false);
    runBootScript();
    expect(panelAttr()).toBe(TASK_PANEL_HIDDEN_VALUE);
  });

  for (const [label, panel] of PANEL_STATES.filter(([, value]) => value !== false)) {
    it(`stored panel value ${label} leaves the attribute absent`, () => {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelopeWithPanel("system", panel));
      setOs(false);
      runBootScript();
      expect(panelAttr()).toBeNull();
    });
  }

  for (const [label, raw] of [
    ["no entry", null],
    ["malformed JSON", "{bad"],
    ["an empty string", ""],
  ] as const) {
    it(`${label} leaves the attribute absent and the theme at its default`, () => {
      if (raw !== null) window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
      setOs(false);
      expect(() => runBootScript()).not.toThrow();
      expect(panelAttr()).toBeNull();
      expect(painted()).toBe(false);
    });
  }

  it("getItem throwing leaves the attribute absent and does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    setOs(false);
    expect(() => runBootScript()).not.toThrow();
    expect(panelAttr()).toBeNull();
  });

  it("a stale hidden attribute is removed when storage says visible", () => {
    document.documentElement.setAttribute(TASK_PANEL_ATTRIBUTE, TASK_PANEL_HIDDEN_VALUE);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelopeWithPanel("system", true));
    setOs(false);
    runBootScript();
    expect(panelAttr()).toBeNull();
  });

  it("a stale hidden attribute is removed when storage is unreadable", () => {
    document.documentElement.setAttribute(TASK_PANEL_ATTRIBUTE, TASK_PANEL_HIDDEN_VALUE);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    setOs(false);
    runBootScript();
    expect(panelAttr()).toBeNull();
  });

  it("running the script twice gives the same attribute state in both directions", () => {
    setOs(false);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelopeWithPanel("system", false));
    runBootScript();
    runBootScript();
    expect(panelAttr()).toBe(TASK_PANEL_HIDDEN_VALUE);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelopeWithPanel("system", true));
    runBootScript();
    runBootScript();
    expect(panelAttr()).toBeNull();
  });
});

describe("task 015 criterion 32 (theme x panel cross-product): the panel key does not disturb the theme and the theme does not disturb the panel", () => {
  for (const theme of THEME_VALUES) {
    for (const [panelLabel, panel] of PANEL_STATES) {
      for (const osDark of [false, true]) {
        it(`theme ${theme} x panel ${panelLabel} / OS ${osDark ? "dark" : "light"}: class and attribute are both as specified`, () => {
          const raw = panel === undefined
            ? JSON.stringify({ state: { theme }, version: 1 })
            : envelopeWithPanel(theme, panel);
          window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
          setOs(osDark);
          expect(() => runBootScript()).not.toThrow();
          expect(painted()).toBe(resolveTheme(theme, osDark) === "dark");
          expect(hiddenByScript()).toBe(panel === false);
          const tokens = document.documentElement.className.split(/\s+/).filter(Boolean);
          expect(tokens.every((token) => token === DARK_CLASS)).toBe(true);
        });
      }
    }
  }
});

describe("task 015 criterion 32 (parity): the script hides the panel exactly when sanitizePreferences says taskPanelVisible is false", () => {
  const SAMPLES: unknown[] = [false, true, "false", 0, null, undefined, "true", 1, {}, []];
  for (const sample of SAMPLES) {
    it(`stored ${JSON.stringify(sample) ?? "undefined"}: script attribute matches the sanitiser`, () => {
      const sanitised = sanitizePreferences({ taskPanelVisible: sample }).taskPanelVisible;
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelopeWithPanel("system", sample));
      setOs(false);
      runBootScript();
      expect(hiddenByScript()).toBe(sanitised === false);
    });
  }
});
