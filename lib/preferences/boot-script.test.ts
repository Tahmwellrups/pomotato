import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREFERENCES_STORAGE_KEY, PREFERENCES_VERSION, TASK_PANEL_ATTRIBUTE, TASK_PANEL_HIDDEN_VALUE, sanitizePreferences } from "./schema";
import { PREFERENCES_BOOT_SCRIPT } from "./boot-script";

// Task 015 criterion 32 (boot half) and task 019 group C (boot side): the inline
// pre-hydration script is executed for real in jsdom against real localStorage.
// The app is dark only, so the script has no theme branch; it sets or removes the
// task-panel attribute and nothing else.

/** Runs the exact string the layout puts in <head>, as the browser would. */
function runBootScript(): void {
  new Function(PREFERENCES_BOOT_SCRIPT)();
}

/** The attribute the script leaves on <html>, or null when it is absent. */
function panelAttr(): string | null {
  return document.documentElement.getAttribute(TASK_PANEL_ATTRIBUTE);
}

function hiddenByScript(): boolean {
  return panelAttr() === TASK_PANEL_HIDDEN_VALUE;
}

const envelope = (state: unknown) => JSON.stringify({ state, version: PREFERENCES_VERSION });

// Stored values a user or an old build could leave behind. Each one carries the
// deleted `theme` field, or a value that is not even an envelope.
const STALE_STORED: [string, string][] = [
  ["theme light", envelope({ theme: "light", taskPanelVisible: true })],
  ["theme dark", envelope({ theme: "dark", taskPanelVisible: true })],
  ["theme system", envelope({ theme: "system", taskPanelVisible: true })],
  ["theme unknown string", envelope({ theme: "auto", taskPanelVisible: true })],
  ["theme null", envelope({ theme: null, taskPanelVisible: true })],
  ["theme number", envelope({ theme: 42, taskPanelVisible: true })],
  ["theme object", envelope({ theme: { mode: "dark" }, taskPanelVisible: true })],
  ["raw non-JSON", "Dark"],
];

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute(TASK_PANEL_ATTRIBUTE);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute(TASK_PANEL_ATTRIBUTE);
});

describe("task 019 criteria 17 and 19 (boot side): a stale theme value never throws or logs", () => {
  it.each(STALE_STORED)("stored %s: the script runs without throwing or logging an error", (_label, raw) => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => runBootScript()).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("a stored theme leaves the <html> attribute set exactly as with no entry (criterion 22: theme maps to nothing)", () => {
    runBootScript();
    const noEntry = Array.from(document.documentElement.attributes).map((a) => a.name);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelope({ theme: "light", taskPanelVisible: true }));
    runBootScript();
    const withTheme = Array.from(document.documentElement.attributes).map((a) => a.name);
    expect(withTheme).toEqual(noEntry);
    expect(document.documentElement.className).toBe("");
  });
});

describe("task 019 criterion 23: the boot script reads storage and parses JSON at most once", () => {
  it("one getItem and one JSON.parse per run", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelope({ theme: "light", taskPanelVisible: false }));
    const getItem = vi.spyOn(window.localStorage, "getItem");
    const parse = vi.spyOn(JSON, "parse");
    runBootScript();
    const storageReads = getItem.mock.calls.filter(([key]) => key === PREFERENCES_STORAGE_KEY).length;
    expect(storageReads).toBe(1);
    expect(parse).toHaveBeenCalledTimes(1);
  });
});

describe("task 019 criterion 24: running the boot script twice leaves the same state", () => {
  it.each(STALE_STORED)("stored %s: a second run matches the first", (_label, raw) => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
    runBootScript();
    const first = Array.from(document.documentElement.attributes).map((a) => `${a.name}=${a.value}`);
    runBootScript();
    const second = Array.from(document.documentElement.attributes).map((a) => `${a.name}=${a.value}`);
    expect(second).toEqual(first);
  });
});

describe("task 015 criterion 32 (boot half): the panel attribute is set only for a stored boolean false", () => {
  it("stored taskPanelVisible false sets the hidden attribute", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelope({ taskPanelVisible: false }));
    runBootScript();
    expect(hiddenByScript()).toBe(true);
  });

  it.each<[string, unknown]>([
    ["absent (v1 payload)", undefined],
    ["true", true],
    ['"false" (string)', "false"],
    ["0", 0],
    ["null", null],
  ])("stored panel value %s leaves the attribute absent", (_label, panel) => {
    const state: Record<string, unknown> = {};
    if (panel !== undefined) state.taskPanelVisible = panel;
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelope(state));
    runBootScript();
    expect(panelAttr()).toBeNull();
  });

  it("getItem throwing leaves the attribute absent and does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => runBootScript()).not.toThrow();
    expect(panelAttr()).toBeNull();
  });

  it("a stale hidden attribute is removed when storage says visible", () => {
    document.documentElement.setAttribute(TASK_PANEL_ATTRIBUTE, TASK_PANEL_HIDDEN_VALUE);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelope({ taskPanelVisible: true }));
    runBootScript();
    expect(panelAttr()).toBeNull();
  });

  it("a stale hidden attribute is removed when storage is unreadable", () => {
    document.documentElement.setAttribute(TASK_PANEL_ATTRIBUTE, TASK_PANEL_HIDDEN_VALUE);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, "{");
    runBootScript();
    expect(panelAttr()).toBeNull();
  });

  it("parity: the script hides the panel exactly when the store's sanitiser says taskPanelVisible is false", () => {
    const samples: unknown[] = [false, true, "false", 0, null, undefined, "true", 1, {}, []];
    for (const sample of samples) {
      document.documentElement.removeAttribute(TASK_PANEL_ATTRIBUTE);
      const state = sample === undefined ? {} : { taskPanelVisible: sample };
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, envelope(state));
      runBootScript();
      expect(hiddenByScript()).toBe(sanitizePreferences(state).taskPanelVisible === false);
    }
  });
});

describe("task 019 criterion 7 (boot side): the script names the storage key once", () => {
  it("the script carries the shared storage key and no second copy of it", () => {
    expect(PREFERENCES_BOOT_SCRIPT.split(PREFERENCES_STORAGE_KEY).length - 1).toBe(1);
    expect(PREFERENCES_BOOT_SCRIPT).not.toMatch(/theme/);
  });
});
