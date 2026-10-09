export type StatsView = "day" | "week" | "month";

/** One bar of the chart / one row of the bucket table. */
export interface StatsBucket {
  /** Zero-based position within the view. */
  index: number;
  /** Stable machine key: `"00"`..`"23"` (day, local hour), `"YYYY-MM-DD"` (week, month, local date). */
  key: string;
  /** Short display label: `"09:00"` (day), `"Mon"` (week), `"9"` (month, day of month). */
  label: string;
  /** First instant of the bucket (epoch ms, inclusive). For a day-view hour, the first occurrence of that local hour. */
  startMs: number;
  /** Sum of planned durations of focus-type sessions in the bucket, ms. */
  focusMs: number;
  /** Number of focus-type sessions in the bucket. */
  sessionCount: number;
}

export interface TaskBreakdownEntry {
  /** `null` for the single "No task" group. */
  taskId: string | null;
  label: string;
  focusMs: number;
  sessionCount: number;
}

export interface StatsResult {
  view: StatsView;
  timeZone: string;
  /** Range as a `[fromMs, toMs)` window, suitable for `listSessionsInRange`. */
  fromMs: number;
  toMs: number;
  buckets: StatsBucket[];
  totalFocusMs: number;
  totalSessionCount: number;
  /** Ordered by focusMs descending, then label ascending, then taskId (`null` last). */
  breakdown: TaskBreakdownEntry[];
  /** True when no focus-type session falls in the range. */
  isEmpty: boolean;
}

/** The slice of a stored session the aggregation needs. A `SessionRecord` satisfies it. */
export interface StatsSession {
  mode: "focus" | "shortBreak" | "longBreak" | "custom";
  endedAt: number;
  plannedDurationMs: number;
  taskId: string | null;
  taskTitle: string | null;
}

export interface AggregateInput {
  sessions: readonly StatsSession[];
  /** The reference instant ("now"), epoch ms. Never read from the clock inside. */
  nowMs: number;
  /** IANA zone name, e.g. `"America/New_York"`. */
  timeZone: string;
  /** Current task titles by id. Wins over the stored snapshot; ids absent from it fall back to the snapshot. */
  taskTitles?: ReadonlyMap<string, string>;
}
