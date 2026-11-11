import { beforeEach, describe, expect, it, vi } from "vitest";
import { logRunCompletion } from "./log-completion";
import { MS_PER_MINUTE, TIMER_STORAGE_KEY } from "./constants";
import { getRemainingMs, fullDurationMs } from "./time";
import type { PersistedTimerState } from "./types";

// Task 017 criteria 16, 17, 18, 20, 21, 22, 27, 28-30, 32, 34 (unit half).
// Store behaviour with the lengths read from preferences; the log is mocked.

vi.mock("./log-completion", () => ({ logRunCompletion: vi.fn() }));

const T0 = 1_700_000_000_000;
const stored = () => JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY) ?? "null");

/** Fresh module instances, so each test starts with both stores un-hydrated, as on a first load. */
async function freshStores() {
  vi.resetModules();
  const prefs = await import("@/lib/preferences");
  const timer = await import("./store");
  return { prefs: prefs.usePreferencesStore, timer: timer.useTimerStore };
}

function setDurations(prefs: Awaited<ReturnType<typeof freshStores>>["prefs"], focusMinutes: number, shortBreakMinutes = 5, longBreakMinutes = 15) {
  prefs.setState({ focusMinutes, shortBreakMinutes, longBreakMinutes });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.mocked(logRunCompletion).mockClear();
});

describe("criterion 16: a running run is untouched by an edit to its mode's length", () => {
  it("changing the running Focus length leaves the stored end timestamp byte-identical and the countdown on its trajectory", async () => {
    const { prefs, timer } = await freshStores();
    setDurations(prefs, 25);
    timer.getState().start();
    const before = stored().state.endTimestamp;
    const planned = timer.getState().plannedDurationMs!;
    prefs.getState().setDuration("focusMinutes", 50);
    expect(stored().state.endTimestamp).toBe(before);
    vi.setSystemTime(T0 + MS_PER_MINUTE);
    const remaining = getRemainingMs("running", timer.getState().endTimestamp, null, planned, Date.now());
    expect(remaining).toBe(24 * MS_PER_MINUTE);
  });
});

describe("criterion 17: a paused run keeps its own length, even when the new setting is shorter", () => {
  it("paused at 40:00 of a 50-minute Focus, setting Focus to 5 leaves 40:00 frozen, and resume counts down from there", async () => {
    const { prefs, timer } = await freshStores();
    setDurations(prefs, 50);
    timer.getState().start();
    vi.setSystemTime(T0 + 10 * MS_PER_MINUTE);
    timer.getState().pause();
    expect(timer.getState().pausedRemainingMs).toBe(40 * MS_PER_MINUTE);
    prefs.getState().setDuration("focusMinutes", 5);
    expect(timer.getState().pausedRemainingMs).toBe(40 * MS_PER_MINUTE);
    const planned = timer.getState().plannedDurationMs!;
    expect(planned).toBe(50 * MS_PER_MINUTE);
    // The display clamp reads the run's own planned length, not the new 5-minute setting.
    expect(getRemainingMs("paused", null, timer.getState().pausedRemainingMs, planned, Date.now())).toBe(40 * MS_PER_MINUTE);
    timer.getState().resume();
    vi.setSystemTime(T0 + 11 * MS_PER_MINUTE);
    expect(getRemainingMs("running", timer.getState().endTimestamp, null, planned, Date.now())).toBe(39 * MS_PER_MINUTE);
  });
});

describe("criterion 18: the change lands on the next run of that type", () => {
  it("a short break set to 9 mid-Focus starts as 9 minutes, and a Focus set to 50 during it starts at 50", async () => {
    const { prefs, timer } = await freshStores();
    setDurations(prefs, 25);
    timer.getState().start();
    prefs.getState().setDuration("shortBreakMinutes", 9);
    const focusEnd = timer.getState().endTimestamp!;
    timer.getState().completeIfExpired(focusEnd);
    expect(timer.getState()).toMatchObject({ mode: "shortBreak", status: "running" });
    expect(timer.getState().endTimestamp).toBe(focusEnd + 9 * MS_PER_MINUTE);
    expect(timer.getState().plannedDurationMs).toBe(9 * MS_PER_MINUTE);

    prefs.getState().setDuration("focusMinutes", 50);
    const breakEnd = timer.getState().endTimestamp!;
    timer.getState().completeIfExpired(breakEnd);
    expect(timer.getState()).toMatchObject({ mode: "focus", status: "running" });
    expect(timer.getState().plannedDurationMs).toBe(50 * MS_PER_MINUTE);
  });
});

describe("criterion 20: the logged planned duration is the one the run started with", () => {
  it("a Focus started at 25 and edited to 50 mid-run logs plannedDurationMs of 25 minutes", async () => {
    const { prefs, timer } = await freshStores();
    setDurations(prefs, 25);
    timer.getState().start();
    prefs.getState().setDuration("focusMinutes", 50);
    timer.getState().completeIfExpired(timer.getState().endTimestamp!);
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logRunCompletion).mock.calls[0][0].plannedDurationMs).toBe(25 * MS_PER_MINUTE);
  });
});

describe("criterion 21: plannedDurationMs is non-null exactly while running or paused", () => {
  it("start sets it, pause and resume keep it, reset and selectMode clear it", async () => {
    const { prefs, timer } = await freshStores();
    setDurations(prefs, 25);
    timer.getState().start();
    expect(timer.getState().plannedDurationMs).toBe(25 * MS_PER_MINUTE);
    timer.getState().pause();
    expect(timer.getState().plannedDurationMs).toBe(25 * MS_PER_MINUTE);
    timer.getState().resume();
    expect(timer.getState().plannedDurationMs).toBe(25 * MS_PER_MINUTE);
    timer.getState().reset();
    expect(timer.getState().plannedDurationMs).toBeNull();
    timer.getState().start();
    timer.getState().selectMode("shortBreak");
    expect(timer.getState().plannedDurationMs).toBeNull();
    expect(stored().state.plannedDurationMs).toBeNull();
  });

  it("a stored running entry with a null planned duration falls back on the merge path", async () => {
    const { timer } = await freshStores();
    const current = timer.getState();
    const bad = { ...current, status: "running", endTimestamp: T0 + 1, runId: "r", startedAt: T0, plannedDurationMs: null };
    expect(timer.persist.getOptions().merge!(bad, current)).toBe(current);
  });

  it("a stored idle entry carrying a planned duration falls back on the merge path", async () => {
    const { timer } = await freshStores();
    const current = timer.getState();
    const bad = { ...current, status: "idle", plannedDurationMs: 300_000 };
    expect(timer.persist.getOptions().merge!(bad, current)).toBe(current);
  });
});

describe("criterion 22: the auto-started run is anchored on the completed run's stored end, plus the next current length", () => {
  it("the stored end is the completed end plus the break length in force, to the millisecond", async () => {
    const { prefs, timer } = await freshStores();
    setDurations(prefs, 25, 9, 15);
    timer.getState().start();
    const completedEnd = timer.getState().endTimestamp!;
    vi.setSystemTime(completedEnd + 4_000);
    timer.getState().completeIfExpired(completedEnd + 4_000);
    expect(stored().state.endTimestamp).toBe(completedEnd + 9 * MS_PER_MINUTE);
    expect(stored().state.startedAt).toBe(completedEnd);
    expect(timer.getState().plannedDurationMs).toBe(fullDurationMs("shortBreak", { focusMinutes: 25, shortBreakMinutes: 9, longBreakMinutes: 15 }));
  });
});

describe("criterion 27: focusMinutes is not in the timer's persisted slice", () => {
  it("partialize returns exactly the eight run and cycle fields", async () => {
    const { timer } = await freshStores();
    const slice = timer.persist.getOptions().partialize!(timer.getState()) as unknown as Record<string, unknown>;
    expect(Object.keys(slice).sort()).toEqual(
      ["cyclePosition", "endTimestamp", "mode", "pausedRemainingMs", "plannedDurationMs", "runId", "startedAt", "status"].sort()
    );
    expect(timer.persist.getOptions().version).toBe(4);
  });
});

describe("criterion 28, 29: the cross-store Focus carry, from both ends, and an existing preference always wins", () => {
  function seedTimerV3(focusMinutes: number) {
    localStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({
        state: { mode: "focus", focusMinutes, cyclePosition: 0, status: "idle", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null },
        version: 3,
      })
    );
  }

  it("criterion 28: a v3 timer with focusMinutes 50 and no preference entry loads the Focus length at 50, and still 50 after a second reload", async () => {
    seedTimerV3(50);
    const { prefs, timer } = await freshStores();
    await prefs.persist.rehydrate();
    await timer.persist.rehydrate();
    expect(prefs.getState().focusMinutes).toBe(50);
    expect(JSON.parse(localStorage.getItem("pomotato-preferences")!).state.focusMinutes).toBe(50);
    // Second reload: the timer entry is now v4 and has no focus length; preferences must still hold 50.
    expect(stored().version).toBe(4);
    expect(stored().state).not.toHaveProperty("focusMinutes");
    const again = await freshStores();
    await again.timer.persist.rehydrate();
    await again.prefs.persist.rehydrate();
    expect(again.prefs.getState().focusMinutes).toBe(50);
  });

  it("criterion 29: preferences already storing 40 beat a stale timer v3 entry saying 50, in either rehydration order", async () => {
    for (const order of ["timer-first", "preferences-first"] as const) {
      localStorage.clear();
      localStorage.setItem("pomotato-preferences", JSON.stringify({ state: { focusMinutes: 40 }, version: 3 }));
      seedTimerV3(50);
      const { prefs, timer } = await freshStores();
      if (order === "timer-first") {
        await timer.persist.rehydrate();
        await prefs.persist.rehydrate();
      } else {
        await prefs.persist.rehydrate();
        await timer.persist.rehydrate();
      }
      expect(prefs.getState().focusMinutes, order).toBe(40);
    }
  });
});

describe("criterion 30: a v3 running or paused entry keeps its countdown, derived from the v3 lengths", () => {
  it("a v3 running Focus of 50 keeps a 50-minute planned duration even when the current setting is 25", async () => {
    const { timer, prefs } = await freshStores();
    setDurations(prefs, 25);
    const migrated = timer.persist.getOptions().migrate!(
      { mode: "focus", focusMinutes: 50, cyclePosition: 0, status: "running", endTimestamp: T0 + 40 * MS_PER_MINUTE, pausedRemainingMs: null, runId: "r3", startedAt: T0 },
      3
    ) as PersistedTimerState;
    expect(migrated.plannedDurationMs).toBe(50 * MS_PER_MINUTE);
    expect(migrated.endTimestamp).toBe(T0 + 40 * MS_PER_MINUTE);
  });

  it("a v3 paused break is counted against the v3 fixed 5-minute break, and its frozen value is clamped to that", async () => {
    const { timer } = await freshStores();
    const migrated = timer.persist.getOptions().migrate!(
      { mode: "shortBreak", focusMinutes: 25, cyclePosition: 1, status: "paused", endTimestamp: null, pausedRemainingMs: 10 * MS_PER_MINUTE, runId: "rb3", startedAt: T0 },
      3
    ) as PersistedTimerState;
    expect(migrated.plannedDurationMs).toBe(5 * MS_PER_MINUTE);
    expect(migrated.pausedRemainingMs).toBe(5 * MS_PER_MINUTE);
  });

  it("a v3 paused Focus frozen above its v3 length is clamped to the v3 planned duration", async () => {
    const { timer } = await freshStores();
    const migrated = timer.persist.getOptions().migrate!(
      { mode: "focus", focusMinutes: 50, cyclePosition: 0, status: "paused", endTimestamp: null, pausedRemainingMs: 60 * MS_PER_MINUTE, runId: "rp", startedAt: T0 },
      3
    ) as PersistedTimerState;
    expect(migrated.pausedRemainingMs).toBe(50 * MS_PER_MINUTE);
    expect(migrated.plannedDurationMs).toBe(50 * MS_PER_MINUTE);
  });
});

describe("criterion 31: the version 1 path runs through to version 4 with the new step applied", () => {
  it("a v1 running custom entry becomes a v4 focus run with its planned duration", async () => {
    const { timer } = await freshStores();
    const migrated = timer.persist.getOptions().migrate!(
      { mode: "custom", customMinutes: 30, status: "running", endTimestamp: T0 + 1000, pausedRemainingMs: null },
      1
    ) as PersistedTimerState;
    expect(migrated).toMatchObject({ mode: "focus", status: "running", plannedDurationMs: 30 * MS_PER_MINUTE });
  });
});

describe("criterion 32: a hand-edited version 4 entry with a bad planned duration falls back to defaults", () => {
  it.each([
    ["a non-numeric planned duration", { plannedDurationMs: "25" }],
    ["a negative planned duration", { plannedDurationMs: -1 }],
    ["a planned duration while idle", { status: "idle", plannedDurationMs: 300_000, endTimestamp: null, runId: null, startedAt: null }],
  ])("%s falls back to the defaults on migrate", async (_label, patch) => {
    const { timer } = await freshStores();
    const base: Record<string, unknown> = {
      mode: "focus",
      cyclePosition: 0,
      status: "running",
      endTimestamp: T0 + 1000,
      pausedRemainingMs: null,
      runId: "hand",
      startedAt: T0,
      plannedDurationMs: 25 * MS_PER_MINUTE,
    };
    const hand: Record<string, unknown> = { ...base, ...patch };
    const result = timer.persist.getOptions().migrate!(hand, 4) as PersistedTimerState;
    expect(result).toMatchObject({ mode: "focus", status: "idle", cyclePosition: 0, plannedDurationMs: null });
  });
});

describe("criterion 34: logRunCompletion is called before the set() that commits the advance", () => {
  it("the log has already been written when the advance is first observed in the store", async () => {
    const { prefs, timer } = await freshStores();
    setDurations(prefs, 25);
    timer.getState().start();
    let callsAtCommit: number | null = null;
    const unsubscribe = timer.subscribe((state, previous) => {
      if (state.lastAdvance !== null && state.lastAdvance !== previous.lastAdvance) {
        callsAtCommit = vi.mocked(logRunCompletion).mock.calls.length;
      }
    });
    timer.getState().completeIfExpired(timer.getState().endTimestamp!);
    unsubscribe();
    expect(callsAtCommit).toBe(1);
  });
});
