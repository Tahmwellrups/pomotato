"use client";

import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { listTasks, type Task } from "@/lib/db";

/**
 * Discriminated result for the task list. "loading" covers the gap before
 * the first resolved read (including the whole server render, since
 * `useLiveQuery` never touches Dexie outside the browser); "ready" is the
 * normal case, even with zero tasks; "error" covers a rejected read, for
 * example `DatabaseUnavailableError`.
 *
 * The querier below always resolves, never rejects: it catches everything
 * itself and returns an "error" value instead. `useLiveQuery` re-throws a
 * rejected querier during the *next* render so an ErrorBoundary can catch
 * it, which would take the whole page down since this app has none. Making
 * the querier catch its own failures keeps a database outage a plain,
 * renderable value instead of an uncaught render-time throw.
 */
export type TasksQuery = { status: "loading" } | { status: "ready"; tasks: Task[] } | { status: "error" };

// A single stable reference, not reconstructed per render: `useLiveQuery`
// returns `undefined` on every render before the first resolved read, and
// returning a freshly-allocated `{ status: "loading" }` object here would
// make `TaskList`'s `tasksQuery`-keyed sync effect see a "new" value each
// time, re-running indefinitely until that first read resolves.
const LOADING_TASKS_QUERY: TasksQuery = { status: "loading" };

// Same rationale as `LOADING_TASKS_QUERY`: one stable reference, not a
// fresh literal per render, for the "indexedDB doesn't exist at all" branch
// below.
const ERROR_TASKS_QUERY: TasksQuery = { status: "error" };

// `indexedDB` availability can't change while the page is open, so there is
// nothing to subscribe to; `useSyncExternalStore` is used below purely for
// its built-in "serve `getServerSnapshot` during SSR and the first client
// render, then re-check `getSnapshot` once mounted" behavior, which is
// exactly the hydration-safe, check-only-after-mount timing this needs
// without manually calling `setState` inside an effect.
function subscribeToIndexedDbAvailability(): () => void {
  return () => {};
}

function getIndexedDbAvailability(): boolean {
  return typeof indexedDB !== "undefined";
}

// Always reports "available" for the server-rendered and pre-hydration
// client output: there is no `indexedDB` global during SSR at all, so
// checking real availability here would make every server render (and the
// matching first client render, before `useSyncExternalStore` re-checks)
// look like indexedDB is missing, turning this hook's "loading" state into
// "error" before hydration even finishes.
function getServerIndexedDbAvailability(): boolean {
  return true;
}

export function useTasks(): TasksQuery {
  const result = useLiveQuery<TasksQuery>(async () => {
    try {
      const tasks = await listTasks();
      return { status: "ready", tasks };
    } catch {
      return { status: "error" };
    }
  });

  // Dexie's `liveQuery` silently skips running the querier at all when
  // `indexedDB` doesn't exist in this browser (private-browsing lockdowns,
  // old Safari, etc.) rather than rejecting it, so `result` above stays
  // `undefined` forever in that case and this hook would otherwise report
  // "loading" indefinitely.
  const indexedDbAvailable = useSyncExternalStore(
    subscribeToIndexedDbAvailability,
    getIndexedDbAvailability,
    getServerIndexedDbAvailability,
  );

  if (!indexedDbAvailable) return ERROR_TASKS_QUERY;
  return result ?? LOADING_TASKS_QUERY;
}
