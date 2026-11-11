/**
 * The one home for session-length defaults and bounds, in whole minutes. The
 * preference defaults, the parser, the validators and the store all read from
 * here, so no duration is restated anywhere else.
 */
export const DEFAULT_FOCUS_MINUTES = 25;
export const FOCUS_MINUTES_MIN = 1;
export const FOCUS_MINUTES_MAX = 180;

export const DEFAULT_SHORT_BREAK_MINUTES = 5;
export const SHORT_BREAK_MINUTES_MIN = 1;
export const SHORT_BREAK_MINUTES_MAX = 60;

export const DEFAULT_LONG_BREAK_MINUTES = 15;
export const LONG_BREAK_MINUTES_MIN = 1;
export const LONG_BREAK_MINUTES_MAX = 120;

/** The three configurable lengths. These are also the keys under which preferences store them. */
export type DurationKey = "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes";

export interface DurationLimits {
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

export const DURATION_LIMITS: Readonly<Record<DurationKey, DurationLimits>> = {
  focusMinutes: { default: DEFAULT_FOCUS_MINUTES, min: FOCUS_MINUTES_MIN, max: FOCUS_MINUTES_MAX },
  shortBreakMinutes: {
    default: DEFAULT_SHORT_BREAK_MINUTES,
    min: SHORT_BREAK_MINUTES_MIN,
    max: SHORT_BREAK_MINUTES_MAX,
  },
  longBreakMinutes: {
    default: DEFAULT_LONG_BREAK_MINUTES,
    min: LONG_BREAK_MINUTES_MIN,
    max: LONG_BREAK_MINUTES_MAX,
  },
};

export const DURATION_KEYS: readonly DurationKey[] = ["focusMinutes", "shortBreakMinutes", "longBreakMinutes"];

/** Focus runs per cycle. The fourth earns the long break. */
export const CYCLE_LENGTH = 4;

export const MS_PER_MINUTE = 60_000;

/** localStorage key of the timer store. Preferences reads it once to carry the old Focus length across. */
export const TIMER_STORAGE_KEY = "pomotato-timer";
