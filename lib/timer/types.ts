/** The three modes a user can select. A fourth must be added here on purpose; see `TIMER_MODES`. */
export type TimerMode = "focus" | "shortBreak" | "longBreak";

export type TimerStatus = "idle" | "running" | "paused" | "complete";

/**
 * The slice of timer state that gets written to persistent storage.
 * Deliberately excludes `hasHydrated` and the action functions.
 */
export interface PersistedTimerState {
  mode: TimerMode;
  /** Length of a Focus run, whole minutes 1 to 180. Formerly `customMinutes`. */
  focusMinutes: number;
  /**
   * Focus runs completed in the current cycle, integer 0 to 4. 4 is a legal
   * resting value: the long break is owed or running. Only a completed Focus
   * run (+1, capped at 4) and a completed long break (back to 0) change it.
   */
  cyclePosition: number;
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
