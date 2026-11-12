import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMix } from "../audio/mix";
import { PREFERENCE_DEFAULTS, PREFERENCES_STORAGE_KEY, PREFERENCES_VERSION } from "./schema";
import { usePreferencesStore } from "./store";

// Task 019 group C (criteria 17-22): a stale stored `theme` field is dropped without
// error, without a visual difference, and without touching any neighbouring key.
// The store is exercised against jsdom's localStorage, so these read the entry the
// store writes back.

const BACKGROUND_ID = "123e4567-e89b-42d3-a456-426614174000";

/** A valid version-3 entry with the deleted `theme` field added, as an older build left it. */
function staleEnvelope(theme: unknown): string {
  return JSON.stringify({
    state: {
      theme,
      gaugeStyle: "glyph",
      background: BACKGROUND_ID,
      mix: defaultMix(),
      taskPanelVisible: false,
      focusMinutes: 30,
      shortBreakMinutes: 7,
      longBreakMinutes: 20,
      chimeEnabled: false,
      chimeLevel: 40,
    },
    version: PREFERENCES_VERSION,
  });
}

/** The same envelope with no `theme` field at all: what a current build writes. */
function currentEnvelope(): string {
  const parsed = JSON.parse(staleEnvelope(null)) as { state: Record<string, unknown> };
  delete parsed.state.theme;
  return JSON.stringify(parsed);
}

/** Rehydrates from the given raw storage string and returns the state the store holds. */
async function bootWith(raw: string | null) {
  // The store is set first: persist writes every set() back to storage, so the fixture goes in last.
  usePreferencesStore.setState({ ...PREFERENCE_DEFAULTS, hasHydrated: false });
  if (raw === null) window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  else window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
  await usePreferencesStore.persist.rehydrate();
  return usePreferencesStore.getState();
}

beforeEach(() => {
  window.localStorage.clear();
  usePreferencesStore.setState({ ...PREFERENCE_DEFAULTS, hasHydrated: false });
});

describe("task 019 criteria 17 and 19: a stale stored theme never throws and logs nothing", () => {
  const cases: [string, unknown][] = [
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
    ["an unknown string", "auto"],
    ["null", null],
    ["a number", 42],
    ["an object", { mode: "dark" }],
  ];

  it.each(cases)("stored theme %s: rehydrates without throwing and logs no console error", async (_label, theme) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(bootWith(staleEnvelope(theme))).resolves.toBeDefined();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().hasHydrated).toBe(true);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});

describe("task 019 criterion 20: the persisted envelope no longer carries a theme field", () => {
  it("after a load with a stale theme, the written state has no theme key", async () => {
    await bootWith(staleEnvelope("light"));
    const written = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(Object.prototype.hasOwnProperty.call(written.state, "theme")).toBe(false);
    expect(written.version).toBe(PREFERENCES_VERSION);
  });

  it("the store holds no theme property after rehydrating a stale entry", async () => {
    const state = await bootWith(staleEnvelope("dark"));
    expect("theme" in state).toBe(false);
    expect("setTheme" in state).toBe(false);
  });
});

describe("task 019 criterion 21: dropping theme loses nothing else", () => {
  it("background, taskPanelVisible, gaugeStyle and the session lengths are unchanged from what was stored", async () => {
    await bootWith(staleEnvelope("light"));
    const written = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as {
      state: Record<string, unknown>;
    };
    expect(written.state).toMatchObject({
      background: BACKGROUND_ID,
      taskPanelVisible: false,
      gaugeStyle: "glyph",
      focusMinutes: 30,
      shortBreakMinutes: 7,
      longBreakMinutes: 20,
      chimeEnabled: false,
      chimeLevel: 40,
    });
  });
});

describe("task 019 criterion 18 (unit half): a stale theme and no entry leave the same preference state", () => {
  it("the state after booting from a stale-theme entry equals the state after booting with the same keys and no theme", async () => {
    const withStale = await bootWith(staleEnvelope("light"));
    const snapshotStale = { ...withStale };
    const withoutStale = await bootWith(currentEnvelope());
    const snapshotCurrent = { ...withoutStale };
    expect(snapshotStale.gaugeStyle).toBe(snapshotCurrent.gaugeStyle);
    expect(snapshotStale.background).toBe(snapshotCurrent.background);
    expect(snapshotStale.taskPanelVisible).toBe(snapshotCurrent.taskPanelVisible);
    expect(snapshotStale.focusMinutes).toBe(snapshotCurrent.focusMinutes);
    expect(snapshotStale.mix).toEqual(snapshotCurrent.mix);
  });

  it("with no stored entry at all, the defaults hold and no theme appears", async () => {
    const state = await bootWith(null);
    expect(state.gaugeStyle).toBe(PREFERENCE_DEFAULTS.gaugeStyle);
    expect(state.background).toBe(PREFERENCE_DEFAULTS.background);
    expect("theme" in state).toBe(false);
  });
});
