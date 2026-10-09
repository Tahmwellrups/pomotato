import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CUSTOM_MINUTES_MAX, CUSTOM_MINUTES_MIN, DEFAULT_CUSTOM_MINUTES } from "./constants";
import { legacyRunId } from "@/lib/db";
import { logRunCompletion } from "./log-completion";
import { fullDurationMs } from "./time";
import type { PersistedTimerState, TimerMode, TimerStatus } from "./types";

const STORAGE_KEY = "pomotato-timer";
const STORAGE_VERSION = 2;

const defaultPersistedState: PersistedTimerState = {
  mode: "focus",
  customMinutes: DEFAULT_CUSTOM_MINUTES,
  status: "idle",
  endTimestamp: null,
  pausedRemainingMs: null,
  runId: null,
  startedAt: null,
};

interface TimerStoreState extends PersistedTimerState {
  /** True once the client has rehydrated persisted state. Not persisted itself. */
  hasHydrated: boolean;
}

interface TimerStoreActions {
  selectMode: (mode: TimerMode) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setCustomMinutes: (minutes: number) => void;
  /** Flips a running timer to complete once `now` has reached the end timestamp. */
  completeIfExpired: (now: number) => void;
  setHasHydrated: (value: boolean) => void;
}

export type TimerStore = TimerStoreState & TimerStoreActions;

type VersionOneTimerState = Omit<PersistedTimerState, "runId" | "startedAt">;

function isVersionOneTimerState(value: unknown): value is VersionOneTimerState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const validModes: TimerMode[] = ["focus", "shortBreak", "longBreak", "custom"];
  const validStatuses: TimerStatus[] = ["idle", "running", "paused", "complete"];
  if (
    typeof candidate.mode !== "string" ||
    !validModes.includes(candidate.mode as TimerMode) ||
    typeof candidate.customMinutes !== "number" ||
    !Number.isInteger(candidate.customMinutes) ||
    candidate.customMinutes < CUSTOM_MINUTES_MIN ||
    candidate.customMinutes > CUSTOM_MINUTES_MAX ||
    typeof candidate.status !== "string" ||
    !validStatuses.includes(candidate.status as TimerStatus) ||
    (candidate.endTimestamp !== null && typeof candidate.endTimestamp !== "number") ||
    (candidate.pausedRemainingMs !== null && typeof candidate.pausedRemainingMs !== "number")
  ) {
    return false;
  }
  // Cross-field consistency: "running" must carry an end timestamp and no
  // frozen paused value, "paused" the reverse. Anything else is malformed,
  // even if every field individually has the right type.
  const status = candidate.status as TimerStatus;
  if (status === "running" && (candidate.endTimestamp === null || candidate.pausedRemainingMs !== null)) {
    return false;
  }
  if (status === "paused" && (candidate.pausedRemainingMs === null || candidate.endTimestamp !== null)) {
    return false;
  }
  if ((status === "idle" || status === "complete") && (candidate.endTimestamp !== null || candidate.pausedRemainingMs !== null)) {
    return false;
  }
  return true;
}

function isPersistedTimerState(value: unknown): value is PersistedTimerState {
  if (!isVersionOneTimerState(value)) return false;
  const candidate = value as unknown as Record<string, unknown>;
  const { runId, startedAt } = candidate;
  if (runId !== null && (typeof runId !== "string" || runId === "")) return false;
  if (startedAt !== null && (typeof startedAt !== "number" || !Number.isFinite(startedAt))) return false;
  const hasRun = value.status === "running" || value.status === "paused";
  if (hasRun !== (runId !== null)) return false;
  if (!hasRun && startedAt !== null) return false;
  return true;
}

function migrateVersionOne(state: VersionOneTimerState): PersistedTimerState {
  if (state.status === "running" && state.endTimestamp !== null) {
    return { ...state, runId: legacyRunId(state.mode, state.endTimestamp), startedAt: null };
  }
  if (state.status === "paused") {
    return { ...state, runId: crypto.randomUUID(), startedAt: null };
  }
  return { ...state, runId: null, startedAt: null };
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...defaultPersistedState,
      hasHydrated: false,

      selectMode: (mode) => {
        const state = get();
        if (state.mode === mode) return;
        set({ mode, status: "idle", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null });
      },

      start: () => {
        const state = get();
        if (state.status !== "idle" && state.status !== "complete") return;
        const fullMs = fullDurationMs(state.mode, state.customMinutes);
        const now = Date.now();
        set({
          status: "running",
          endTimestamp: now + fullMs,
          pausedRemainingMs: null,
          runId: crypto.randomUUID(),
          startedAt: now,
        });
      },

      pause: () => {
        const state = get();
        if (state.status !== "running" || state.endTimestamp === null) return;
        const fullMs = fullDurationMs(state.mode, state.customMinutes);
        const remaining = Math.min(Math.max(state.endTimestamp - Date.now(), 0), fullMs);
        set({ status: "paused", pausedRemainingMs: remaining, endTimestamp: null });
      },

      resume: () => {
        const state = get();
        if (state.status !== "paused" || state.pausedRemainingMs === null) return;
        set({ status: "running", endTimestamp: Date.now() + state.pausedRemainingMs, pausedRemainingMs: null });
      },

      reset: () => {
        set({ status: "idle", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null });
      },

      setCustomMinutes: (minutes) => {
        const state = get();
        if (state.mode === "custom" && (state.status === "running" || state.status === "paused")) return;
        set({ customMinutes: minutes });
      },

      completeIfExpired: (now) => {
        const state = get();
        if (state.status !== "running" || state.endTimestamp === null) return;
        if (now >= state.endTimestamp) {
          const { runId, startedAt, mode, customMinutes, endTimestamp } = state;
          set({ status: "complete", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null });
          if (runId !== null) {
            logRunCompletion({
              runId,
              mode,
              startedAt,
              endedAt: endTimestamp,
              plannedDurationMs: fullDurationMs(mode, customMinutes),
            });
          }
        }
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
        customMinutes: state.customMinutes,
        status: state.status,
        endTimestamp: state.endTimestamp,
        pausedRemainingMs: state.pausedRemainingMs,
        runId: state.runId,
        startedAt: state.startedAt,
      }),
      migrate: (persistedState, version): PersistedTimerState => {
        if (version === 1 && isVersionOneTimerState(persistedState)) {
          return migrateVersionOne(persistedState);
        }
        if (version === STORAGE_VERSION && isPersistedTimerState(persistedState)) {
          return persistedState;
        }
        return defaultPersistedState;
      },
      // `migrate` only runs when the stored version differs from
      // `STORAGE_VERSION` — zustand skips it entirely on a version match, so
      // malformed or tampered current-version data (wrong types, an
      // out-of-range `customMinutes`, or a `status`/`endTimestamp`/
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
        store.completeIfExpired(Date.now());
        store.setHasHydrated(true);
      },
    }
  )
);
