import { isFocusTypeMode } from "../db/session-modes";
import { localParts, startOfLocalDay } from "./timezone";
import type { AggregateInput, StatsBucket, StatsResult, StatsSession, StatsView, TaskBreakdownEntry } from "./types";

export const NO_TASK_LABEL = "No task";
export const DELETED_TASK_LABEL = "Deleted task";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

interface Ymd {
  year: number;
  month: number;
  day: number;
}

/** Calendar arithmetic on a date with no timezone involved. */
function addDays(date: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function isoDate(date: Ymd): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

/** Number of days in `month` (1-12) of `year`; 28/29/30/31. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

interface Layout {
  fromMs: number;
  toMs: number;
  /** Per-bucket descriptors: key, label, startMs. */
  buckets: Array<Pick<StatsBucket, "key" | "label" | "startMs">>;
  /** Ascending bucket start instants plus the range end, for binary search. Unused for the day view. */
  boundaries: number[];
}

function dayLayout(today: Ymd, timeZone: string): Layout {
  const fromMs = startOfLocalDay(today.year, today.month, today.day, timeZone);
  const next = addDays(today, 1);
  const toMs = startOfLocalDay(next.year, next.month, next.day, timeZone);
  const buckets: Layout["buckets"] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    // The first occurrence of local hour `hour`; informational only (day-view
    // sessions are bucketed by local hour, not by this instant).
    buckets.push({ key: pad2(hour), label: `${pad2(hour)}:00`, startMs: Math.min(fromMs + hour * 3600000, toMs) });
  }
  return { fromMs, toMs, buckets, boundaries: [] };
}

function dailyLayout(first: Ymd, count: number, timeZone: string, labelFor: (date: Ymd, index: number) => string): Layout {
  const boundaries: number[] = [];
  const buckets: Layout["buckets"] = [];
  for (let i = 0; i <= count; i += 1) {
    const date = addDays(first, i);
    boundaries.push(startOfLocalDay(date.year, date.month, date.day, timeZone));
    if (i < count) {
      buckets.push({ key: isoDate(date), label: labelFor(date, i), startMs: boundaries[i] });
    }
  }
  return { fromMs: boundaries[0], toMs: boundaries[count], buckets, boundaries };
}

function buildLayout(view: StatsView, nowMs: number, timeZone: string): Layout {
  const now = localParts(nowMs, timeZone);
  const today: Ymd = { year: now.year, month: now.month, day: now.day };
  if (view === "day") return dayLayout(today, timeZone);
  if (view === "week") {
    const dow = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay(); // 0 = Sunday
    const monday = addDays(today, -((dow + 6) % 7));
    return dailyLayout(monday, 7, timeZone, (_date, index) => WEEKDAY_LABELS[index]);
  }
  const first: Ymd = { year: today.year, month: today.month, day: 1 };
  return dailyLayout(first, daysInMonth(today.year, today.month), timeZone, (date) => String(date.day));
}

/**
 * The `[fromMs, toMs)` instants of the current local day / Monday-start week
 * / calendar month around `nowMs` in `timeZone`. Use it to drive
 * `listSessionsInRange` so only the needed rows are read.
 */
export function getStatsRange(view: StatsView, nowMs: number, timeZone: string): { fromMs: number; toMs: number } {
  const { fromMs, toMs } = buildLayout(view, nowMs, timeZone);
  return { fromMs, toMs };
}

/** Index i such that boundaries[i] <= value < boundaries[i + 1]. Caller guarantees value is inside the range. */
function findBucket(boundaries: readonly number[], value: number): number {
  let lo = 0;
  let hi = boundaries.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (boundaries[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

interface BreakdownAccumulator {
  taskId: string | null;
  focusMs: number;
  sessionCount: number;
  snapshotTitle: string | null;
  snapshotEndedAt: number;
}

function compareBreakdown(a: TaskBreakdownEntry, b: TaskBreakdownEntry): number {
  if (a.focusMs !== b.focusMs) return b.focusMs - a.focusMs;
  if (a.label !== b.label) return a.label < b.label ? -1 : 1;
  if (a.taskId === b.taskId) return 0;
  if (a.taskId === null) return 1;
  if (b.taskId === null) return -1;
  return a.taskId < b.taskId ? -1 : 1;
}

/**
 * Buckets focus-type sessions for the current day, week, or month. Pure: the
 * same inputs always give the same output, and nothing reads the clock, the
 * DOM, or IndexedDB.
 *
 * - Day: 24 buckets keyed by the local hour of `endedAt` (on a DST day the
 *   skipped hour stays an empty bucket and a repeated hour merges into one).
 * - Week: 7 buckets, Monday to Sunday, the week containing `nowMs`.
 * - Month: one bucket per local day of the month containing `nowMs`.
 * - A session belongs wholly to the local day of `endedAt`; never split.
 * - Focus time is the sum of `plannedDurationMs`, never `endedAt - startedAt`.
 * - Break-type sessions and sessions outside `[fromMs, toMs)` are ignored, so
 *   callers may pass more rows than the range.
 * - Throws `RangeError` for an unknown `timeZone`.
 */
export function aggregateStats(view: StatsView, input: AggregateInput): StatsResult {
  const { sessions, nowMs, timeZone, taskTitles } = input;
  const layout = buildLayout(view, nowMs, timeZone);
  const buckets: StatsBucket[] = layout.buckets.map((bucket, index) => ({ ...bucket, index, focusMs: 0, sessionCount: 0 }));
  const groups = new Map<string | null, BreakdownAccumulator>();
  let totalFocusMs = 0;
  let totalSessionCount = 0;

  for (const session of sessions) {
    if (!isFocusTypeMode(session.mode)) continue;
    if (session.endedAt < layout.fromMs || session.endedAt >= layout.toMs) continue;

    const bucketIndex =
      view === "day" ? localParts(session.endedAt, timeZone).hour : findBucket(layout.boundaries, session.endedAt);
    const bucket = buckets[bucketIndex];
    bucket.focusMs += session.plannedDurationMs;
    bucket.sessionCount += 1;
    totalFocusMs += session.plannedDurationMs;
    totalSessionCount += 1;

    let group = groups.get(session.taskId);
    if (!group) {
      group = { taskId: session.taskId, focusMs: 0, sessionCount: 0, snapshotTitle: null, snapshotEndedAt: -Infinity };
      groups.set(session.taskId, group);
    }
    group.focusMs += session.plannedDurationMs;
    group.sessionCount += 1;
    if (session.taskTitle !== null && session.endedAt >= group.snapshotEndedAt) {
      group.snapshotTitle = session.taskTitle;
      group.snapshotEndedAt = session.endedAt;
    }
  }

  const breakdown: TaskBreakdownEntry[] = [];
  for (const group of groups.values()) {
    const label =
      group.taskId === null
        ? NO_TASK_LABEL
        : (taskTitles?.get(group.taskId) ?? group.snapshotTitle ?? DELETED_TASK_LABEL);
    breakdown.push({ taskId: group.taskId, label, focusMs: group.focusMs, sessionCount: group.sessionCount });
  }
  breakdown.sort(compareBreakdown);

  return {
    view,
    timeZone,
    fromMs: layout.fromMs,
    toMs: layout.toMs,
    buckets,
    totalFocusMs,
    totalSessionCount,
    breakdown,
    isEmpty: totalSessionCount === 0,
  };
}

export function aggregateDay(input: AggregateInput): StatsResult {
  return aggregateStats("day", input);
}

export function aggregateWeek(input: AggregateInput): StatsResult {
  return aggregateStats("week", input);
}

export function aggregateMonth(input: AggregateInput): StatsResult {
  return aggregateStats("month", input);
}

export type { StatsSession };
