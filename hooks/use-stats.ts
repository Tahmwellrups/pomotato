"use client";

import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { DatabaseBlockedError, listSessionsInRange, listTasks } from "@/lib/db";
import { aggregateStats, getLocalTimeZone, getStatsRange, type StatsResult, type StatsView } from "@/lib/stats";

export const STATS_VIEWS: readonly StatsView[] = ["day", "week", "month"];

/**
 * "loading" is the gap before the first resolved read. "ready" carries all
 * three views, aggregated from one read, so switching views never goes back
 * to loading. "error" has `blocked: true` when another open tab is holding
 * up the schema upgrade (the user can fix that); other failures are generic.
 */
export type StatsQuery =
  | { status: "loading" }
  | { status: "ready"; views: Record<StatsView, StatsResult> }
  | { status: "error"; blocked: boolean };

const LOADING_STATS_QUERY: StatsQuery = { status: "loading" };
const ERROR_STATS_QUERY: StatsQuery = { status: "error", blocked: false };

// Same hydration-safe availability check as `useTasks`: `liveQuery` never
// runs its querier when `indexedDB` is missing, which would otherwise read
// as "loading" forever.
function subscribeToIndexedDbAvailability(): () => void {
  return () => {};
}

function getIndexedDbAvailability(): boolean {
  return typeof indexedDB !== "undefined";
}

function getServerIndexedDbAvailability(): boolean {
  return true;
}

async function readStats(): Promise<StatsQuery> {
  try {
    const nowMs = Date.now();
    const timeZone = getLocalTimeZone();
    const ranges = STATS_VIEWS.map((view) => getStatsRange(view, nowMs, timeZone));
    const fromMs = Math.min(...ranges.map((range) => range.fromMs));
    const toMs = Math.max(...ranges.map((range) => range.toMs));
    const [sessions, tasks] = await Promise.all([listSessionsInRange(fromMs, toMs), listTasks()]);
    const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
    const input = { sessions, nowMs, timeZone, taskTitles };
    return {
      status: "ready",
      views: {
        day: aggregateStats("day", input),
        week: aggregateStats("week", input),
        month: aggregateStats("month", input),
      },
    };
  } catch (error) {
    return { status: "error", blocked: error instanceof DatabaseBlockedError };
  }
}

export function useStats(): StatsQuery {
  const result = useLiveQuery<StatsQuery>(readStats);

  const indexedDbAvailable = useSyncExternalStore(
    subscribeToIndexedDbAvailability,
    getIndexedDbAvailability,
    getServerIndexedDbAvailability,
  );

  if (!indexedDbAvailable) return ERROR_STATS_QUERY;
  return result ?? LOADING_STATS_QUERY;
}
