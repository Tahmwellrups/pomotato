import { openDatabase } from "./database";
import { SessionValidationError } from "./errors";
import { isFocusTypeMode, isSessionMode } from "./session-modes";
import type { LogSessionInput, LogSessionResult, SessionRecord, SessionValidationIssue, Task } from "./types";
import { COMPLETED_MAX } from "./validation";

const PINNED_TASK_KEY = "pinnedTaskId" as const;

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateLogInput(input: LogSessionInput): void {
  const issues: SessionValidationIssue[] = [];
  if (typeof input.runId !== "string" || input.runId.trim().length === 0) {
    issues.push({ field: "runId", message: "runId must be a non-empty string." });
  }
  if (!isSessionMode(input.mode)) {
    issues.push({ field: "mode", message: "mode must be focus, shortBreak, longBreak, or custom." });
  }
  if (!isNonNegativeFinite(input.startedAt)) {
    issues.push({ field: "startedAt", message: "startedAt must be a non-negative epoch ms." });
  }
  if (!isNonNegativeFinite(input.endedAt)) {
    issues.push({ field: "endedAt", message: "endedAt must be a non-negative epoch ms." });
  } else if (isNonNegativeFinite(input.startedAt) && input.endedAt < input.startedAt) {
    issues.push({ field: "endedAt", message: "endedAt must not be earlier than startedAt." });
  }
  if (typeof input.plannedDurationMs !== "number" || !Number.isFinite(input.plannedDurationMs) || input.plannedDurationMs <= 0) {
    issues.push({ field: "plannedDurationMs", message: "plannedDurationMs must be a positive number of ms." });
  }
  if (issues.length > 0) throw new SessionValidationError(issues);
}

/**
 * Logs one timer run that reached its end timestamp, exactly once.
 *
 * Everything happens in ONE `rw` transaction over `sessions`, `tasks`, and
 * `appMeta`:
 * 1. Look up `runId`. If a row already has it, return `{ status: "duplicate" }`
 *    and write nothing (no row, no increment). IndexedDB serializes
 *    overlapping read-write transactions across tabs, so two tabs racing on the
 *    same `runId` cannot both pass this check; the `&runId` unique index is a
 *    second, storage-level guard behind it.
 * 2. Read the pin and the pinned task AT THIS MOMENT (completion time). A
 *    missing/dangling pin means untagged, not an error.
 * 3. Add the session row.
 * 4. If the mode is focus-type and a task is attached, add 1 to its
 *    `completed` (clamped at 999; the row is still logged at 999).
 * Any throw aborts the whole transaction, so a session row and its increment
 * can never disagree.
 *
 * Throws `SessionValidationError` (nothing written) on bad input,
 * `DatabaseUnavailableError` / `DatabaseBlockedError` if the DB cannot open.
 * Never throws for a duplicate or for a deleted/unpinned task.
 */
export async function logCompletedSession(input: LogSessionInput): Promise<LogSessionResult> {
  validateLogInput(input);
  const db = await openDatabase();
  return db.transaction("rw", [db.sessions, db.tasks, db.appMeta], async () => {
    const existing = await db.sessions.where("runId").equals(input.runId).first();
    if (existing) {
      return { status: "duplicate", session: existing, task: null } satisfies LogSessionResult;
    }

    const meta = await db.appMeta.get(PINNED_TASK_KEY);
    const pinned = meta?.value ? await db.tasks.get(meta.value) : undefined;

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      runId: input.runId,
      mode: input.mode,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      plannedDurationMs: input.plannedDurationMs,
      taskId: pinned?.id ?? null,
      taskTitle: pinned?.title ?? null,
    };
    await db.sessions.add(session);

    let updatedTask: Task | null = pinned ?? null;
    if (pinned && isFocusTypeMode(input.mode) && pinned.completed < COMPLETED_MAX) {
      updatedTask = { ...pinned, completed: pinned.completed + 1 };
      await db.tasks.put(updatedTask);
    }
    return { status: "logged", session, task: updatedTask } satisfies LogSessionResult;
  });
}

/**
 * Sessions with `from <= endedAt < to`, ordered by `endedAt` ascending (ties
 * by `id`), read through the `endedAt` index so sessions outside the window
 * are never loaded. Includes every mode; stats filters break-type itself.
 * `from >= to` returns `[]`. Throws `SessionValidationError` if either bound
 * is not a finite number.
 */
export async function listSessionsInRange(from: number, to: number): Promise<SessionRecord[]> {
  const issues: SessionValidationIssue[] = [];
  if (typeof from !== "number" || !Number.isFinite(from)) issues.push({ field: "from", message: "from must be a finite number." });
  if (typeof to !== "number" || !Number.isFinite(to)) issues.push({ field: "to", message: "to must be a finite number." });
  if (issues.length > 0) throw new SessionValidationError(issues);

  const db = await openDatabase();
  if (from >= to) return [];
  const rows = await db.sessions.where("endedAt").between(from, to, true, false).toArray();
  return rows.sort((a, b) => a.endedAt - b.endedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
