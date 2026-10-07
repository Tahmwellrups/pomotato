export type TimerMode = "focus" | "shortBreak" | "longBreak" | "custom";

export type TimerStatus = "idle" | "running" | "paused" | "complete";

/**
 * The slice of timer state that gets written to persistent storage.
 * Deliberately excludes `hasHydrated` and the action functions.
 */
export interface PersistedTimerState {
  mode: TimerMode;
  customMinutes: number;
  status: TimerStatus;
  /** Epoch ms when the current run ends. Only meaningful while running. */
  endTimestamp: number | null;
  /** Frozen remaining duration, in ms. Only meaningful while paused. */
  pausedRemainingMs: number | null;
}
