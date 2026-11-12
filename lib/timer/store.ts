import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CYCLE_LENGTH,
  DEFAULT_LONG_BREAK_MINUTES,
  DEFAULT_SHORT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  DURATION_LIMITS,
  MS_PER_MINUTE,
  TIMER_STORAGE_KEY,
} from "./constants";
import { carryFocusMinutesToPreferences } from "./carry-focus";
import { readDurations } from "./durations";
import { legacyRunId } from "@/lib/db";
import type { SessionMode } from "@/lib/db";
import { nextCycleStep } from "./cycle";
import { logRunCompletion } from "./log-completion";
import { isTimerMode } from "./modes";
import { fullDurationMs, isDurationMinutes } from "./time";
import type { PersistedTimerState, TimerMode, TimerStatus } from "./types";

const STORAGE_KEY = TIMER_STORAGE_KEY;
const STORAGE_VERSION = 4;

const defaultPersistedState: PersistedTimerState = {
  mode: "focus",
  cyclePosition: 0,
  status: "idle",
  endTimestamp: null,
  pausedRemainingMs: null,
  runId: null,
  startedAt: null,
  plannedDurationMs: null,
};

/**
 * What the last automatic advance did, for the UI's one completion announcement.
 * Not persisted, and cleared after rehydration so a reload announces nothing.
 */
export interface TimerAdvance {
  completedMode: TimerMode;
  nextMode: TimerMode;
  /** True when the next run is already counting; false when it landed idle (one-step bound). */
  started: boolean;
  /** The completed run's stored end timestamp. Unique per advance, usable as a change key. */
  endedAt: number;
}

interface TimerStoreState extends PersistedTimerState {
  /** True once the client has rehydrated persisted state. Not persisted itself. */
  hasHydrated: boolean;
  lastAdvance: TimerAdvance | null;
}

interface TimerStoreActions {
  selectMode: (mode: TimerMode) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** Resets the current run only. The session lengths and the cycle position are untouched. */
  reset: () => void;
  /**
   * Once `now` has reached a running timer's end timestamp: credits the run,
   * advances the cycle by exactly one step, and starts the next run anchored on
   * the completed run's own end timestamp.
   */
  completeIfExpired: (now: number) => void;
  setHasHydrated: (value: boolean) => void;
}

export type TimerStore = TimerStoreState & TimerStoreActions;

/** Modes a version 1 or 2 entry may carry: the three selectable ones plus the retired "custom". */
type LegacyTimerMode = TimerMode | "custom";
const LEGACY_MODES: readonly LegacyTimerMode[] = ["focus", "shortBreak", "longBreak", "custom"];

type VersionOneTimerState = Omit<
  PersistedTimerState,
  "runId" | "startedAt" | "plannedDurationMs" | "cyclePosition" | "mode"
> & {
  mode: LegacyTimerMode;
  customMinutes: number;
};
type VersionTwoTimerState = VersionOneTimerState & Pick<PersistedTimerState, "runId" | "startedAt">;
/** Versions 1 to 3 had no per-run planned duration, and version 3 held the Focus length itself. */
type VersionThreeTimerState = Omit<PersistedTimerState, "plannedDurationMs"> & { focusMinutes: number };

/**
 * The Focus length and the two break lengths a version 3 entry's runs were
 * counted against. Version 3 had no settings for the breaks, they were fixed at
 * the values that are still the defaults, so these name them by reference; if a
 * default ever moves, these two must be frozen to the old numbers first.
 */
const VERSION_THREE_SHORT_BREAK_MINUTES = DEFAULT_SHORT_BREAK_MINUTES;
const VERSION_THREE_LONG_BREAK_MINUTES = DEFAULT_LONG_BREAK_MINUTES;

const STATUSES: readonly TimerStatus[] = ["idle", "running", "paused", "complete"];

/** Longest run any setting can produce. A stored planned duration beyond it was not written by this app. */
const MAX_PLANNED_DURATION_MS =
  Math.max(...Object.values(DURATION_LIMITS).map((limits) => limits.max)) * MS_PER_MINUTE;

/** Status, end timestamp and frozen value: the fields every version shares, with cross-field consistency. */
function hasValidRunFields(candidate: Record<string, unknown>): boolean {
  if (
    typeof candidate.status !== "string" ||
    !STATUSES.includes(candidate.status as TimerStatus) ||
    (candidate.endTimestamp !== null && typeof candidate.endTimestamp !== "number") ||
    (candidate.pausedRemainingMs !== null && typeof candidate.pausedRemainingMs !== "number")
  ) {
    return false;
  }
  // "running" must carry an end timestamp and no frozen value, "paused" the
  // reverse, idle and complete neither. Anything else is malformed.
  const status = candidate.status as TimerStatus;
  if (status === "running") return candidate.endTimestamp !== null && candidate.pausedRemainingMs === null;
  if (status === "paused") return candidate.pausedRemainingMs !== null && candidate.endTimestamp === null;
  return candidate.endTimestamp === null && candidate.pausedRemainingMs === null;
}

/**
 * Run identity: `runId`, `startedAt`, and from version 4 `plannedDurationMs`.
 * Each is non-null exactly while the status is running or paused. Versions 2
 * and 3 predate the planned duration, so they are checked without it.
 */
function hasValidRunIdentity(candidate: Record<string, unknown>, hasPlannedDuration: boolean): boolean {
  const { runId, startedAt, status, plannedDurationMs } = candidate;
  if (runId !== null && (typeof runId !== "string" || runId === "")) return false;
  if (startedAt !== null && (typeof startedAt !== "number" || !Number.isFinite(startedAt))) return false;
  const hasRun = status === "running" || status === "paused";
  if (hasRun !== (runId !== null)) return false;
  if (!hasRun && startedAt !== null) return false;
  if (!hasPlannedDuration) return true;
  if (!hasRun) return plannedDurationMs === null;
  return (
    typeof plannedDurationMs === "number" &&
    Number.isFinite(plannedDurationMs) &&
    plannedDurationMs > 0 &&
    plannedDurationMs <= MAX_PLANNED_DURATION_MS
  );
}

/**
 * LEGACY shape guard (versions 1 and 2). Accepts the retired `"custom"` mode
 * and the old `customMinutes` key. Reachable only from `migrate`; the current
 * guard below never accepts `"custom"`.
 */
function isVersionOneTimerState(value: unknown): value is VersionOneTimerState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.mode === "string" &&
    LEGACY_MODES.includes(candidate.mode as LegacyTimerMode) &&
    isDurationMinutes("focusMinutes", candidate.customMinutes) &&
    hasValidRunFields(candidate)
  );
}

function isVersionTwoTimerState(value: unknown): value is VersionTwoTimerState {
  return isVersionOneTimerState(value) && hasValidRunIdentity(value as unknown as Record<string, unknown>, false);
}

function hasValidCycleFields(candidate: Record<string, unknown>): boolean {
  return (
    isTimerMode(candidate.mode) &&
    typeof candidate.cyclePosition === "number" &&
    Number.isInteger(candidate.cyclePosition) &&
    candidate.cyclePosition >= 0 &&
    candidate.cyclePosition <= CYCLE_LENGTH &&
    hasValidRunFields(candidate)
  );
}

/** Version 3 shape guard: the current fields as they were, with `focusMinutes` and no planned duration. */
function isVersionThreeTimerState(value: unknown): value is VersionThreeTimerState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isDurationMinutes("focusMinutes", candidate.focusMinutes) &&
    hasValidCycleFields(candidate) &&
    hasValidRunIdentity(candidate, false)
  );
}

/** CURRENT shape guard. Runs on `migrate` at version 4 and on every `merge`. Rejects `"custom"`. */
function isPersistedTimerState(value: unknown): value is PersistedTimerState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return hasValidCycleFields(candidate) && hasValidRunIdentity(candidate, true);
}

function migrateVersionOne(state: VersionOneTimerState): VersionTwoTimerState {
  if (state.status === "running" && state.endTimestamp !== null) {
    // Keyed on the stored mode, so a custom run keeps the dedup key an old build would have logged it under.
    return { ...state, runId: legacyRunId(state.mode as SessionMode, state.endTimestamp), startedAt: null };
  }
  if (state.status === "paused") {
    return { ...state, runId: crypto.randomUUID(), startedAt: null };
  }
  return { ...state, runId: null, startedAt: null };
}

/**
 * Version 2 to 3. `customMinutes` becomes the Focus length only when the stored
 * mode really was "custom"; anyone else never chose that number for Focus, so
 * they get the default. The run's own fields carry over untouched, so a running
 * countdown continues; a paused value is clamped to the new full duration.
 */
function migrateVersionTwo(state: VersionTwoTimerState): VersionThreeTimerState {
  const wasCustom = state.mode === "custom";
  const mode: TimerMode = state.mode === "custom" ? "focus" : state.mode;
  const focusMinutes = wasCustom ? state.customMinutes : DEFAULT_FOCUS_MINUTES;
  const pausedRemainingMs =
    state.pausedRemainingMs === null
      ? null
      : Math.min(Math.max(state.pausedRemainingMs, 0), versionThreeDurationMs(mode, focusMinutes));
  return {
    mode,
    focusMinutes,
    cyclePosition: 0,
    status: state.status,
    endTimestamp: state.endTimestamp,
    pausedRemainingMs,
    runId: state.runId,
    startedAt: state.startedAt,
  };
}

/** What a version 3 run of `mode` was counted against: its own stored Focus length and the then-fixed breaks. */
function versionThreeDurationMs(mode: TimerMode, focusMinutes: number): number {
  return fullDurationMs(mode, {
    focusMinutes,
    shortBreakMinutes: VERSION_THREE_SHORT_BREAK_MINUTES,
    longBreakMinutes: VERSION_THREE_LONG_BREAK_MINUTES,
  });
}

/**
 * Version 3 to 4. The Focus length leaves for preferences (carried across, and
 * never overriding one already stored there), and a run that is counting or
 * frozen gains the planned duration it was started with. That value comes from
 * the version 3 numbers, never from today's settings, so an upgrade cannot
 * change a countdown that is already under way; a paused value is clamped to it.
 */
function migrateVersionThree(state: VersionThreeTimerState): PersistedTimerState {
  carryFocusMinutesToPreferences(state.focusMinutes);
  const hasRun = state.status === "running" || state.status === "paused";
  const plannedDurationMs = hasRun ? versionThreeDurationMs(state.mode, state.focusMinutes) : null;
  const pausedRemainingMs =
    state.pausedRemainingMs === null || plannedDurationMs === null
      ? state.pausedRemainingMs
      : Math.min(Math.max(state.pausedRemainingMs, 0), plannedDurationMs);
  return {
    mode: state.mode,
    cyclePosition: state.cyclePosition,
    status: state.status,
    endTimestamp: state.endTimestamp,
    pausedRemainingMs,
    runId: state.runId,
    startedAt: state.startedAt,
    plannedDurationMs,
  };
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...defaultPersistedState,
      hasHydrated: false,
      lastAdvance: null,

      selectMode: (mode) => {
        const state = get();
        if (state.mode === mode) return;
        set({
          mode,
          status: "idle",
          endTimestamp: null,
          pausedRemainingMs: null,
          runId: null,
          startedAt: null,
          plannedDurationMs: null,
        });
      },

      start: () => {
        const state = get();
        if (state.status !== "idle" && state.status !== "complete") return;
        // The length is read once, here, and carried on the run from then on.
        const fullMs = fullDurationMs(state.mode, readDurations());
        const now = Date.now();
        set({
          status: "running",
          endTimestamp: now + fullMs,
          pausedRemainingMs: null,
          runId: crypto.randomUUID(),
          startedAt: now,
          plannedDurationMs: fullMs,
        });
      },

      pause: () => {
        const state = get();
        if (state.status !== "running" || state.endTimestamp === null) return;
        const fullMs = state.plannedDurationMs ?? fullDurationMs(state.mode, readDurations());
        const remaining = Math.min(Math.max(state.endTimestamp - Date.now(), 0), fullMs);
        set({ status: "paused", pausedRemainingMs: remaining, endTimestamp: null });
      },

      resume: () => {
        const state = get();
        if (state.status !== "paused" || state.pausedRemainingMs === null) return;
        set({ status: "running", endTimestamp: Date.now() + state.pausedRemainingMs, pausedRemainingMs: null });
      },

      reset: () => {
        set({
          status: "idle",
          endTimestamp: null,
          pausedRemainingMs: null,
          runId: null,
          startedAt: null,
          plannedDurationMs: null,
        });
      },

      completeIfExpired: (now) => {
        const state = get();
        if (state.status !== "running" || state.endTimestamp === null) return;
        if (now < state.endTimestamp) return;
        const { runId, startedAt, mode, cyclePosition, endTimestamp } = state;
        const durations = readDurations();
        const { nextMode, nextPosition } = nextCycleStep(mode, cyclePosition);
        // Log first, so the credited run is on its way before the advance is
        // committed and observed. The planned length is the one the run started
        // with, never today's setting.
        if (runId !== null) {
          logRunCompletion({
            runId,
            mode,
            startedAt,
            endedAt: endTimestamp,
            plannedDurationMs: state.plannedDurationMs ?? fullDurationMs(mode, durations),
          });
        }
        // Anchored on the completed run's own end, never on `now`, so no step
        // loses the latency of noticing it. One step only: if that end is
        // already past, land idle instead of completing again and chaining.
        const nextFullMs = fullDurationMs(nextMode, durations);
        const nextEnd = endTimestamp + nextFullMs;
        const started = nextEnd > now;
        set({
          mode: nextMode,
          cyclePosition: nextPosition,
          status: started ? "running" : "idle",
          endTimestamp: started ? nextEnd : null,
          pausedRemainingMs: null,
          runId: started ? crypto.randomUUID() : null,
          startedAt: started ? endTimestamp : null,
          plannedDurationMs: started ? nextFullMs : null,
          lastAdvance: { completedMode: mode, nextMode, started, endedAt: endTimestamp },
        });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      // Rehydration is triggered manually (see hooks/use-hydrate-timer-store.ts) so the
      // first client render matches the server-rendered default state, avoiding a
      // hydration mismatch. See task 001 Implementation Notes for the full rationale.
      skipHydration: true,
      partialize: (state): PersistedTimerState => ({
        mode: state.mode,
        cyclePosition: state.cyclePosition,
        status: state.status,
        endTimestamp: state.endTimestamp,
        pausedRemainingMs: state.pausedRemainingMs,
        runId: state.runId,
        startedAt: state.startedAt,
        plannedDurationMs: state.plannedDurationMs,
      }),
      migrate: (persistedState, version): PersistedTimerState => {
        if (version === 1 && isVersionOneTimerState(persistedState)) {
          return migrateVersionThree(migrateVersionTwo(migrateVersionOne(persistedState)));
        }
        if (version === 2 && isVersionTwoTimerState(persistedState)) {
          return migrateVersionThree(migrateVersionTwo(persistedState));
        }
        if (version === 3 && isVersionThreeTimerState(persistedState)) {
          return migrateVersionThree(persistedState);
        }
        if (version === STORAGE_VERSION && isPersistedTimerState(persistedState)) {
          return persistedState;
        }
        return defaultPersistedState;
      },
      // `migrate` only runs when the stored version differs from
      // `STORAGE_VERSION` — zustand skips it entirely on a version match, so
      // malformed or tampered current-version data (wrong types, an
      // out-of-range `cyclePosition` or `plannedDurationMs`, a retired `"custom"` mode, or a `status`/`endTimestamp`/
      // `pausedRemainingMs` combination that doesn't make sense together)
      // would otherwise be merged into the store unchecked on every load.
      // Validating here instead runs on every rehydration regardless of
      // version, falling back to defaults rather than adopting bad data.
      merge: (persistedState, currentState) => {
        if (!isPersistedTimerState(persistedState)) {
          return currentState;
        }
        return { ...currentState, ...persistedState };
      },
      onRehydrateStorage: () => (_state, error) => {
        const store = useTimerStore.getState();
        if (error) {
          store.setHasHydrated(true);
          return;
        }
        // Catch the case where the end timestamp already passed while the page
        // was closed, so a reload lands directly in the complete state.
        // Advances exactly one step and lands idle, because the stored end is
        // long past; the advance is cleared so a reload announces nothing.
        store.completeIfExpired(Date.now());
        useTimerStore.setState({ lastAdvance: null });
        store.setHasHydrated(true);
      },
    }
  )
);
