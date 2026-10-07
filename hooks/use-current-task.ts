"use client";

import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCurrentTask, type Task } from "@/lib/db";

/**
 * Same shape and rationale as `TasksQuery` in `use-tasks.ts`: "loading"
 * until the first resolved read, "ready" with `task: null` when nothing is
 * pinned (the normal empty case, not an error), "error" on a rejected read.
 * The querier catches its own failures so a database outage never becomes
 * an uncaught render-time throw.
 */
export type CurrentTaskQuery = { status: "loading" } | { status: "ready"; task: Task | null } | { status: "error" };

// Same rationale as `LOADING_TASKS_QUERY` in `use-tasks.ts`: a stable
// reference so callers keyed on this value (via `useEffect` deps) don't
// re-run on every render while the first read is still pending.
const LOADING_CURRENT_TASK_QUERY: CurrentTaskQuery = { status: "loading" };

// Same rationale as `ERROR_TASKS_QUERY` in `use-tasks.ts`: one stable
// reference for the "indexedDB doesn't exist at all" branch below.
const ERROR_CURRENT_TASK_QUERY: CurrentTaskQuery = { status: "error" };

// Same rationale as the three functions of the same name in `use-tasks.ts`:
// `indexedDB` availability can't change at runtime, so `useSyncExternalStore`
// is used purely for its hydration-safe "server snapshot, then re-check on
// the client after mount" timing, not for an actual subscription.
function subscribeToIndexedDbAvailability(): () => void {
  return () => {};
}

function getIndexedDbAvailability(): boolean {
  return typeof indexedDB !== "undefined";
}

function getServerIndexedDbAvailability(): boolean {
  return true;
}

export function useCurrentTask(): CurrentTaskQuery {
  const result = useLiveQuery<CurrentTaskQuery>(async () => {
    try {
      const task = await getCurrentTask();
      return { status: "ready", task };
    } catch {
      return { status: "error" };
    }
  });

  // See `useTasks` in `use-tasks.ts` for why this check exists: Dexie's
  // `liveQuery` never runs the querier at all when `indexedDB` doesn't
  // exist, so `result` would otherwise stay `undefined` (and this hook
  // would report "loading" forever) instead of surfacing an error.
  const indexedDbAvailable = useSyncExternalStore(
    subscribeToIndexedDbAvailability,
    getIndexedDbAvailability,
    getServerIndexedDbAvailability,
  );

  if (!indexedDbAvailable) return ERROR_CURRENT_TASK_QUERY;
  return result ?? LOADING_CURRENT_TASK_QUERY;
}
