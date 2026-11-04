import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useTimerStore } from "./store";
import { DEFAULT_FOCUS_MINUTES, MS_PER_MINUTE } from "./constants";
import { logRunCompletion } from "./log-completion";
import type { PersistedTimerState } from "./types";

// Task 013 store behaviour (criteria 6, 13-22, 26, 28-30, 36-42). Driven with
// an explicit `now` through completeIfExpired, the same call the clock hook
// and the reload path make, so no step reads the wall clock.

vi.mock("./log-completion", () => ({ logRunCompletion: vi.fn() }));

const T0 = 1_700_000_000_000;
const s = () => useTimerStore.getState();
const stored = () => JSON.parse(localStorage.getItem("pomotato-timer") ?? "null");

function reset(extra: Partial<ReturnType<typeof s>> = {}) {
  useTimerStore.setState({
    mode: "focus",
    focusMinutes: DEFAULT_FOCUS_MINUTES,
    cyclePosition: 0,
    status: "idle",
    endTimestamp: null,
    pausedRemainingMs: null,
    runId: null,
    startedAt: null,
    lastAdvance: null,
    hasHydrated: false,
    ...extra,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(logRunCompletion).mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("criterion 6: manual selection", () => {
  it("selecting the current mode while running is a no-op: the run keeps its end", () => {
    s().start();
    const { endTimestamp, runId } = s();
    s().selectMode("focus");
    expect(s().status).toBe("running");
    expect(s().endTimestamp).toBe(endTimestamp);
    expect(s().runId).toBe(runId);
  });

  it("a different mode discards the run and lands idle at the new mode's full duration", () => {
    s().start();
    s().selectMode("shortBreak");
    expect(s()).toMatchObject({ mode: "shortBreak", status: "idle", endTimestamp: null, runId: null });
  });

  it("a manual selection does not change the cycle position", () => {
    reset({ cyclePosition: 2 });
    s().selectMode("longBreak");
    expect(s().cyclePosition).toBe(2);
  });
});

describe("criteria 13, 15, 17, 19: advance, no drift, fresh run identity, one step", () => {
  it("a Focus run that reaches zero is already counting its break; end = completed end + break duration, read from localStorage", () => {
    s().start();
    const completedEnd = s().endTimestamp!;
    s().completeIfExpired(completedEnd + 1500);
    expect(s().mode).toBe("shortBreak");
    expect(s().status).toBe("running");
    expect(stored().state.status).toBe("running");
    expect(stored().state.endTimestamp - completedEnd).toBe(5 * MS_PER_MINUTE);
  });

  it("the auto-started run has a fresh runId and startedAt equal to the completed run's endedAt", () => {
    s().start();
    const { runId: firstRun, endTimestamp: completedEnd } = s();
    s().completeIfExpired(completedEnd!);
    expect(s().runId).not.toBe(firstRun);
    expect(s().runId).toBeTruthy();
    expect(s().startedAt).toBe(completedEnd);
  });

  it("one-step bound: a break whose derived end is already past lands idle, not running", () => {
    reset({ focusMinutes: 1 });
    s().start();
    const completedEnd = s().endTimestamp!;
    s().completeIfExpired(completedEnd + 6 * MS_PER_MINUTE);
    expect(s()).toMatchObject({ mode: "shortBreak", status: "idle", endTimestamp: null });
  });

  it("criterion 16: a whole 8-run cycle with 1-minute focus lands the long break's end exactly 34 minutes after the first start", () => {
    reset({ focusMinutes: 1 });
    s().start();
    const modesSeen: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      // Late by 1.5 s every step: a correct anchor must not accumulate it.
      s().completeIfExpired(s().endTimestamp! + 1500);
      modesSeen.push(s().mode);
    }
    expect(modesSeen).toEqual(["shortBreak", "focus", "shortBreak", "focus", "shortBreak", "focus", "longBreak"]);
    expect(s().status).toBe("running");
    expect(s().endTimestamp).toBe(T0 + 34 * MS_PER_MINUTE);
    expect(s().endTimestamp).toBe(2_040_000 + T0);
    expect(stored().state.endTimestamp).toBe(T0 + 2_040_000);
  });

  it("criterion 18: a whole cycle logs exactly 8 completed runs (4 focus, 3 shortBreak, 1 longBreak) with unique runIds", () => {
    reset({ focusMinutes: 1 });
    s().start();
    for (let i = 0; i < 8; i += 1) s().completeIfExpired(s().endTimestamp!);
    const calls = vi.mocked(logRunCompletion).mock.calls.map(([run]) => run);
    expect(calls.map((run) => run.mode)).toEqual([
      "focus", "shortBreak", "focus", "shortBreak", "focus", "shortBreak", "focus", "longBreak",
    ]);
    expect(new Set(calls.map((run) => run.runId)).size).toBe(8);
  });
});

describe("criteria 20-22, 26, 29, 30: cycle position", () => {
  it("criterion 20: completing the long break returns the position to 0 and starts Focus 1 of 4", () => {
    reset({ mode: "longBreak", cyclePosition: 4, status: "running", endTimestamp: T0 + 15 * MS_PER_MINUTE, runId: "r-long", startedAt: T0 });
    s().completeIfExpired(T0 + 15 * MS_PER_MINUTE);
    expect(s()).toMatchObject({ mode: "focus", cyclePosition: 0, status: "running" });
  });

  it("criterion 21: Reset during an auto-started run resets that run only", () => {
    reset({ focusMinutes: 40 });
    s().start();
    s().completeIfExpired(s().endTimestamp!);
    expect(s().status).toBe("running");
    s().reset();
    expect(s()).toMatchObject({ mode: "shortBreak", status: "idle", endTimestamp: null, cyclePosition: 1, focusMinutes: 40 });
  });

  it("criterion 22: pausing an auto-started break freezes it, a paused break does not advance, and resume continues from the frozen value", () => {
    s().start();
    s().completeIfExpired(s().endTimestamp!);
    vi.setSystemTime(T0 + 25 * MS_PER_MINUTE + 60_000);
    s().pause();
    const frozen = s().pausedRemainingMs!;
    expect(s().status).toBe("paused");
    s().completeIfExpired(T0 + 90 * MS_PER_MINUTE);
    expect(s()).toMatchObject({ mode: "shortBreak", status: "paused" });
    expect(s().pausedRemainingMs).toBe(frozen);
    s().resume();
    expect(s().endTimestamp).toBe(Date.now() + frozen);
  });

  it("criterion 26: a Focus run completing at position 4 keeps 4 and advances to the long break", () => {
    reset({ cyclePosition: 4, status: "running", endTimestamp: T0 + MS_PER_MINUTE, runId: "r4", startedAt: T0, focusMinutes: 1 });
    s().completeIfExpired(T0 + MS_PER_MINUTE);
    expect(s()).toMatchObject({ mode: "longBreak", cyclePosition: 4, status: "running" });
  });

  it("criterion 29 and 30: a short break completion, reset, a manual selection, a Focus length edit and pause/resume leave the position alone", () => {
    reset({ mode: "shortBreak", cyclePosition: 2, status: "running", endTimestamp: T0 + 5 * MS_PER_MINUTE, runId: "rb", startedAt: T0 });
    s().completeIfExpired(T0 + 5 * MS_PER_MINUTE);
    expect(s().cyclePosition).toBe(2);
    s().reset();
    s().selectMode("longBreak");
    expect(s().cyclePosition).toBe(2);
    s().setFocusMinutes(50);
    s().start();
    s().pause();
    s().resume();
    expect(s().cyclePosition).toBe(2);
  });

  it("criterion 30: selecting Long break at position 2 goes idle at 15:00, and completing it sets the position to 0", () => {
    reset({ cyclePosition: 2 });
    s().selectMode("longBreak");
    expect(s()).toMatchObject({ mode: "longBreak", status: "idle", cyclePosition: 2 });
    s().start();
    s().completeIfExpired(s().endTimestamp!);
    expect(s()).toMatchObject({ mode: "focus", cyclePosition: 0 });
  });

  it("criterion 28: the position survives a reload in every state and is an integer 0-4 in localStorage", () => {
    for (const status of ["idle", "running", "paused"] as const) {
      reset({ cyclePosition: 3, mode: "focus", status: "idle" });
      if (status === "running") s().start();
      if (status === "paused") {
        s().start();
        s().pause();
      }
      const before = s().cyclePosition;
      useTimerStore.persist.rehydrate();
      expect(s().cyclePosition).toBe(before);
      expect(Number.isInteger(stored().state.cyclePosition)).toBe(true);
      expect(stored().state.cyclePosition).toBeGreaterThanOrEqual(0);
      expect(stored().state.cyclePosition).toBeLessThanOrEqual(4);
    }
    expect(stored().version).toBe(3);
  });
});

describe("criteria 36-38: a reload into an expired run advances exactly one step", () => {
  function seedV3(state: Partial<PersistedTimerState>) {
    const base: PersistedTimerState = {
      mode: "focus",
      focusMinutes: 1,
      cyclePosition: 1,
      status: "running",
      endTimestamp: T0 - 2 * 60 * MS_PER_MINUTE,
      pausedRemainingMs: null,
      runId: "stale-run",
      startedAt: T0 - 2 * 60 * MS_PER_MINUTE - MS_PER_MINUTE,
    };
    localStorage.setItem("pomotato-timer", JSON.stringify({ state: { ...base, ...state }, version: 3 }));
  }

  it("criterion 36: a Focus run that expired two hours ago credits once, moves to shortBreak, lands idle", async () => {
    seedV3({ mode: "focus", cyclePosition: 1 });
    await useTimerStore.persist.rehydrate();
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    expect(s()).toMatchObject({ mode: "shortBreak", status: "idle", endTimestamp: null, cyclePosition: 2 });
  });

  it("criterion 37: an expired long break resets the position to 0 and lands idle on Focus", async () => {
    seedV3({ mode: "longBreak", cyclePosition: 4 });
    await useTimerStore.persist.rehydrate();
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    expect(s()).toMatchObject({ mode: "focus", status: "idle", cyclePosition: 0 });
  });

  it("criterion 38: an expired break credits one row, switches to focus, lands idle, and announces nothing", async () => {
    seedV3({ mode: "shortBreak", cyclePosition: 1 });
    await useTimerStore.persist.rehydrate();
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    expect(s()).toMatchObject({ mode: "focus", status: "idle", cyclePosition: 1 });
    expect(s().lastAdvance).toBeNull();
  });
});

describe("criteria 39-42: persistence, migration and the two validation paths", () => {
  const migrate = (state: unknown, version: number) => useTimerStore.persist.getOptions().migrate!(state, version) as PersistedTimerState;
  const merge = (persisted: unknown, current: ReturnType<typeof s>) => useTimerStore.persist.getOptions().merge!(persisted, current) as ReturnType<typeof s>;

  it("criterion 39: the persist version is 3", () => {
    s().selectMode("shortBreak");
    expect(stored().version).toBe(3);
  });

  it("criterion 39: v2 custom becomes focus with the stored customMinutes as the Focus length, and the run carries over", () => {
    const migrated = migrate({ mode: "custom", customMinutes: 45, status: "running", endTimestamp: T0 + 1000, pausedRemainingMs: null, runId: "r-c", startedAt: T0 }, 2);
    expect(migrated).toEqual({ mode: "focus", focusMinutes: 45, cyclePosition: 0, status: "running", endTimestamp: T0 + 1000, pausedRemainingMs: null, runId: "r-c", startedAt: T0 });
  });

  it("criterion 39: any other v2 mode keeps its mode and takes the default 25, not the stored customMinutes", () => {
    const migrated = migrate({ mode: "shortBreak", customMinutes: 60, status: "idle", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null }, 2);
    expect(migrated.mode).toBe("shortBreak");
    expect(migrated.focusMinutes).toBe(DEFAULT_FOCUS_MINUTES);
    expect(migrated.cyclePosition).toBe(0);
  });

  it("criterion 39: a v2 paused entry keeps its frozen value, clamped to the new full duration", () => {
    const migrated = migrate({ mode: "shortBreak", customMinutes: 25, status: "paused", endTimestamp: null, pausedRemainingMs: 40 * MS_PER_MINUTE, runId: "r-p", startedAt: T0 }, 2);
    expect(migrated.pausedRemainingMs).toBe(5 * MS_PER_MINUTE);
    expect(migrated.runId).toBe("r-p");
  });

  it("criterion 40: a v1 entry runs v1 to v2 and then v2 to v3", () => {
    const migrated = migrate({ mode: "custom", customMinutes: 30, status: "idle", endTimestamp: null, pausedRemainingMs: null }, 1);
    expect(migrated).toMatchObject({ mode: "focus", focusMinutes: 30, cyclePosition: 0, status: "idle", runId: null });
  });

  it("criterion 41: the legacy guard accepts custom on migrate; the current guard rejects it on merge", () => {
    const current = s();
    const customCurrent = { mode: "custom", focusMinutes: 25, cyclePosition: 0, status: "idle", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null };
    expect(merge(customCurrent, { ...current, mode: "focus" }).mode).toBe("focus");
    const result = merge(customCurrent, { ...current, mode: "shortBreak" });
    expect(result.mode).toBe("shortBreak");
    expect(migrate({ ...customCurrent }, 3).mode).toBe("focus");
  });

  it.each([
    ["a fractional cycle position", { cyclePosition: 1.5 }],
    ["a cycle position of -1", { cyclePosition: -1 }],
    ["a cycle position of 5", { cyclePosition: 5 }],
    ["a NaN cycle position", { cyclePosition: Number.NaN }],
    ["a missing cycle position", { cyclePosition: undefined }],
    ["mode custom at version 3", { mode: "custom" }],
  ])("criterion 42: a hand-edited current entry with %s falls back to the defaults", (_label, patch) => {
    const current = { ...s(), mode: "focus" as const, focusMinutes: DEFAULT_FOCUS_MINUTES, cyclePosition: 0 };
    const hand = { mode: "shortBreak", focusMinutes: 40, cyclePosition: 2, status: "idle", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null, ...patch };
    const result = merge(hand, current);
    expect(result.cyclePosition).toBe(0);
    expect(result.mode).toBe("focus");
    expect(result.focusMinutes).toBe(DEFAULT_FOCUS_MINUTES);
  });
});
