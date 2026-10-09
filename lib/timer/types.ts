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
  /**
   * Identity of the current run, generated once when the run starts and kept
   * through pause, resume and reload. It is the session log's dedup key.
   * Null while idle or complete.
   */
  runId: string | null;
  /** Epoch ms the current run first started. Null when unknown (migrated runs) or no run. */
  startedAt: number | null;
}
