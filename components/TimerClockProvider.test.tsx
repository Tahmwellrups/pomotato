import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chime } from "@/lib/audio/chime";
import { usePreferencesStore } from "@/lib/preferences";
import { useTimerStore } from "@/lib/timer/store";
import { logRunCompletion } from "@/lib/timer/log-completion";
import { MS_PER_MINUTE, TIMER_STORAGE_KEY } from "@/lib/timer/constants";
import { TimerClockProvider } from "./TimerClockProvider";

// Task 017 criteria 35, 36, 37, 39, 40, 41, 56, 57, 58, 59 (unit half).
// The chime module is mocked: these tests assert the call, not the sound.
// The store is real; the log write is mocked because Dexie is not under test here.

vi.mock("@/lib/audio/chime", () => ({
  chime: {
    play: vi.fn(() => Promise.resolve("played")),
    prime: vi.fn(),
    getSnapshot: vi.fn(() => ({ plays: 0, lastLevel: null })),
    getServerSnapshot: vi.fn(() => ({ plays: 0, lastLevel: null })),
    subscribe: vi.fn(() => () => {}),
  },
}));
vi.mock("@/lib/timer/log-completion", () => ({ logRunCompletion: vi.fn() }));

const T0 = 1_700_000_000_000;
const play = vi.mocked(chime.play);
const s = () => useTimerStore.getState();

/** A v4 timer entry on disk, as a previous visit would have left it. */
function seedStored(state: Record<string, unknown>) {
  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ state, version: 4 }));
}

function runningFocus(endTimestamp: number, startedAt: number) {
  return {
    mode: "focus",
    cyclePosition: 0,
    status: "running",
    endTimestamp,
    pausedRemainingMs: null,
    runId: "run-1",
    startedAt,
    plannedDurationMs: endTimestamp - startedAt,
  };
}

/** Seeds the live store (no reload) so the provider observes a running run. */
function seedLive(state: Record<string, unknown>) {
  useTimerStore.setState({ hasHydrated: true, lastAdvance: null, ...state } as never);
}

function mountProvider(strict = false) {
  const tree = (
    <TimerClockProvider>
      <span>child</span>
    </TimerClockProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  play.mockClear();
  play.mockImplementation(() => Promise.resolve("played"));
  vi.mocked(logRunCompletion).mockClear();
  usePreferencesStore.setState({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
  useTimerStore.setState({
    mode: "focus",
    cyclePosition: 0,
    status: "idle",
    endTimestamp: null,
    pausedRemainingMs: null,
    runId: null,
    startedAt: null,
    plannedDurationMs: null,
    lastAdvance: null,
    hasHydrated: false,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Moves the wall clock to `at`, then lets the provider's clock sync and its effects run. */
function reachTime(at: number) {
  vi.setSystemTime(at);
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

describe("criterion 35: one chime per completed run, keyed on the run's endedAt, started from the observed advance", () => {
  it("a Focus run ending while mounted plays exactly once, with the stored level, and the advance is observed", () => {
    seedLive(runningFocus(T0 + 1 * MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + 1 * MS_PER_MINUTE + 300);
    expect(s()).toMatchObject({ mode: "shortBreak", status: "running" });
    expect(s().lastAdvance).toMatchObject({ completedMode: "focus", nextMode: "shortBreak", started: true, endedAt: T0 + MS_PER_MINUTE });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(50);
  });

  it("the chime reads the stored level at observation time, not a level captured at mount", () => {
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    act(() => usePreferencesStore.getState().setChimeLevel(73));
    reachTime(T0 + MS_PER_MINUTE + 300);
    expect(play).toHaveBeenCalledWith(73);
  });
});

describe("criterion 36: both transitions chime", () => {
  it("a break ending into Focus plays once", () => {
    seedLive({ ...runningFocus(T0 + 5 * MS_PER_MINUTE, T0), mode: "shortBreak" });
    mountProvider();
    reachTime(T0 + 5 * MS_PER_MINUTE + 300);
    expect(s().mode).toBe("focus");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("a Focus ending into a long break plays once", () => {
    seedLive({ ...runningFocus(T0 + MS_PER_MINUTE, T0), cyclePosition: 3 });
    mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    expect(s().mode).toBe("longBreak");
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("criterion 37: exactly once under StrictMode, an unrelated re-render, and a mode-chip click", () => {
  it("StrictMode's double-invoked effects still play once", () => {
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider(true);
    reachTime(T0 + MS_PER_MINUTE + 300);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("an unrelated re-render immediately after the advance does not replay it", () => {
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    const { rerender } = mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    rerender(
      <TimerClockProvider>
        <span>child, re-rendered</span>
      </TimerClockProvider>
    );
    act(() => {
      useTimerStore.setState({ hasHydrated: true });
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("a manual mode-chip selection immediately after the advance does not replay it", () => {
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    act(() => s().selectMode("longBreak"));
    act(() => s().selectMode("focus"));
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("criterion 39: the transition never waits for the chime", () => {
  it("a play promise that never settles leaves the timer in the next mode and running, and the advance is observable", () => {
    play.mockImplementation(() => new Promise<never>(() => {}));
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    expect(s()).toMatchObject({ mode: "shortBreak", status: "running" });
    expect(s().lastAdvance?.endedAt).toBe(T0 + MS_PER_MINUTE);
  });
});

describe("criterion 40: a chime that throws or rejects never propagates", () => {
  it("a synchronous throw still advances and logs, with exactly one console.warn", () => {
    play.mockImplementation(() => {
      throw new Error("boom");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    expect(s().mode).toBe("shortBreak");
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a rejected promise is caught: one console.warn and no unhandled rejection", async () => {
    play.mockImplementation(() => Promise.reject(new Error("rejected")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(s().mode).toBe("shortBreak");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("criterion 41: sound off means no chime, and the advance still happens", () => {
  it("with chimeEnabled false the store advances and logs, and play is never called", () => {
    usePreferencesStore.setState({ chimeEnabled: false });
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    expect(s()).toMatchObject({ mode: "shortBreak", status: "running" });
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    expect(s().lastAdvance).not.toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});

describe("criterion 56, 58: repeated refocus events after an advance produce no second play", () => {
  it("visibilitychange and focus events after the advance do not chime again", () => {
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + MS_PER_MINUTE + 300);
    const before = s().mode;
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
    }
    expect(s().mode).toBe(before);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("criterion 57: a reload that lands on an expired run plays no chime", () => {
  it("rehydrating an expired Focus run credits and advances one step, with no play and no lastAdvance", () => {
    seedStored(runningFocus(T0 - 2 * MS_PER_MINUTE, T0 - 27 * MS_PER_MINUTE));
    mountProvider();
    expect(s().hasHydrated).toBe(true);
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    // Anchored on the stored end: T0 - 2 min plus the 5-minute break is still in the future, so the break is counting.
    expect(s()).toMatchObject({ mode: "shortBreak", status: "running", endTimestamp: T0 + 3 * MS_PER_MINUTE });
    expect(s().lastAdvance).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});

describe("criterion 56, 59: both catch-up routes produce one advance; live advances chime whether the next run started or landed idle", () => {
  it("the one-step bound: a live advance whose next end is already past lands idle and still chimes once", () => {
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    // Six minutes late: the 5-minute short break that follows has already ended too.
    reachTime(T0 + 7 * MS_PER_MINUTE);
    expect(s()).toMatchObject({ mode: "shortBreak", status: "idle", endTimestamp: null });
    expect(s().lastAdvance?.started).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("a second catch-up route after that advance does not produce a second advance", () => {
    seedLive(runningFocus(T0 + MS_PER_MINUTE, T0));
    mountProvider();
    reachTime(T0 + 7 * MS_PER_MINUTE);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(s().mode).toBe("shortBreak");
    expect(logRunCompletion).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
