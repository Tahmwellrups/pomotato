import type { EntityTable } from "dexie";
import { openDatabase } from "./database";
import { InvalidDoneValueError, InvalidReorderIndexError, TaskNotFoundError, TaskValidationError } from "./errors";
import type { CreateTaskInput, Task, TaskRecord, UpdateTaskInput, ValidationIssue } from "./types";
import { COMPLETED_MAX, COMPLETED_MIN, validateEta, validateTitle } from "./validation";

const DEFAULT_ETA = 1;
const DEFAULT_COMPLETED = 0;

/** Stored rows can predate `done` or carry something that is not a boolean; only a real `true` counts as done. */
export function normalizeTask(row: Task): Task {
  return typeof row.done === "boolean" ? row : { ...row, done: false };
}

function sortByPosition(tasks: Task[]): Task[] {
  return tasks.map(normalizeTask).sort((a, b) => a.position - b.position);
}

/** The current task: first in display order whose `done` is false, or `null`. Shared with `logCompletedSession` so both resolve it identically. */
export function firstNotDone(rows: Task[]): Task | null {
  return sortByPosition(rows).find((task) => !task.done) ?? null;
}

/** Reassigns dense, zero-based positions matching the array's current order, so uniqueness holds by construction after every structural change. */
function renumber(tasks: Task[]): Task[] {
  return tasks.map((task, index) => ({ ...task, position: index }));
}

interface ValidatedTaskFields {
  title: string;
  eta: number;
}

function validateCreateInput(input: CreateTaskInput): ValidatedTaskFields {
  const issues: ValidationIssue[] = [];

  let title = "";
  const titleResult = validateTitle(input.title);
  if (titleResult.issue) issues.push(titleResult.issue);
  else title = titleResult.value;

  let eta = DEFAULT_ETA;
  const etaResult = validateEta(input.eta ?? DEFAULT_ETA);
  if (etaResult.issue) issues.push(etaResult.issue);
  else eta = etaResult.value;

  if (issues.length > 0) {
    throw new TaskValidationError(issues);
  }

  return { title, eta };
}

function validateUpdateInput(input: UpdateTaskInput): Partial<ValidatedTaskFields> {
  const issues: ValidationIssue[] = [];
  const patch: Partial<ValidatedTaskFields> = {};

  if (input.title !== undefined) {
    const result = validateTitle(input.title);
    if (result.issue) issues.push(result.issue);
    else patch.title = result.value;
  }
  if (input.eta !== undefined) {
    const result = validateEta(input.eta);
    if (result.issue) issues.push(result.issue);
    else patch.eta = result.value;
  }

  if (issues.length > 0) {
    throw new TaskValidationError(issues);
  }

  return patch;
}

async function getNormalized(table: EntityTable<TaskRecord, "id">, id: string): Promise<Task> {
  const row = await table.get(id);
  if (!row) throw new TaskNotFoundError(id);
  return normalizeTask(row);
}

/** Creates a task, validating every field per the Field rules table. Rejects with `TaskValidationError` (listing every failing field) and writes nothing on any failure. Added at the end of the display order. */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const fields = validateCreateInput(input);
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await db.tasks.toArray();
    const task: Task = {
      id: crypto.randomUUID(),
      title: fields.title,
      eta: fields.eta,
      completed: DEFAULT_COMPLETED,
      done: false,
      position: existing.length,
    };
    await db.tasks.add(task);
    return task;
  });
}

/** Updates only the provided fields (title, eta), validated the same way as `createTask`. Keys outside that set are ignored, never stored. Omitted fields, `completed`, `position`, and `done` are left untouched. Throws `TaskValidationError` on bad input or `TaskNotFoundError` if `id` doesn't exist; writes nothing in either case. */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const patch = validateUpdateInput(input);
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await getNormalized(db.tasks, id);
    const updated: Task = { ...existing, ...patch };
    await db.tasks.put(updated);
    return updated;
  });
}

/**
 * Deletes a task and renumbers the remaining tasks' positions (preserving
 * their relative order) in one transaction. If it was the current task, the
 * next not-done task is current with no further write. Throws `TaskNotFoundError` if `id` doesn't exist.
 */
export async function deleteTask(id: string): Promise<void> {
  const db = await openDatabase();
  await db.transaction("rw", db.tasks, async () => {
    const existing = await db.tasks.get(id);
    if (!existing) throw new TaskNotFoundError(id);

    await db.tasks.delete(id);

    const remaining = renumber(sortByPosition(await db.tasks.toArray()));
    await db.tasks.bulkPut(remaining);
  });
}

/**
 * Moves the task with id `id` to display index `toIndex` (clamped to the
 * list's bounds) and renumbers every task's position to match, in one
 * transaction — so positions are unique and dense by construction after any
 * sequence of moves, not by relying on callers to avoid collisions. Moving a
 * task to the index it already occupies writes nothing. Returns the full
 * list in its new order. Throws `TaskNotFoundError` if `id` doesn't exist,
 * or `InvalidReorderIndexError` if `toIndex` is not a finite integer (an
 * out-of-range integer is still accepted and clamped to the list's bounds —
 * only `NaN`, `Infinity`, and fractional values are rejected).
 */
export async function reorderTask(id: string, toIndex: number): Promise<Task[]> {
  if (!Number.isInteger(toIndex)) {
    throw new InvalidReorderIndexError(toIndex);
  }
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const tasks = sortByPosition(await db.tasks.toArray());
    const currentIndex = tasks.findIndex((task) => task.id === id);
    if (currentIndex === -1) throw new TaskNotFoundError(id);

    const clampedTarget = Math.max(0, Math.min(toIndex, tasks.length - 1));
    if (clampedTarget === currentIndex) {
      return tasks;
    }

    const [moved] = tasks.splice(currentIndex, 1);
    tasks.splice(clampedTarget, 0, moved);

    const renumbered = renumber(tasks);
    await db.tasks.bulkPut(renumbered);
    return renumbered;
  });
}

/**
 * Sets whether a task is finished. Independent of the pomodoro count: it never
 * reads or changes `completed`, and `incrementCompleted` never calls it.
 * Setting the value it already holds writes nothing and returns the record
 * as stored. Throws `InvalidDoneValueError` (nothing written) when `done` is not
 * a boolean, or `TaskNotFoundError` if `id` doesn't exist.
 */
export async function setTaskDone(id: string, done: boolean): Promise<Task> {
  if (typeof done !== "boolean") {
    throw new InvalidDoneValueError(done);
  }
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await getNormalized(db.tasks, id);
    if (existing.done === done) return existing;
    const updated: Task = { ...existing, done };
    await db.tasks.put(updated);
    return updated;
  });
}

/** Adds exactly 1 to the completed count, clamped at 999 (a no-op, not an error, once already there). Throws `TaskNotFoundError` if `id` doesn't exist. */
export async function incrementCompleted(id: string): Promise<Task> {
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await getNormalized(db.tasks, id);
    if (existing.completed >= COMPLETED_MAX) return existing;
    const updated: Task = { ...existing, completed: existing.completed + 1 };
    await db.tasks.put(updated);
    return updated;
  });
}

/** Removes exactly 1 from the completed count, clamped at 0 (a no-op, not an error, once already there). Throws `TaskNotFoundError` if `id` doesn't exist. */
export async function decrementCompleted(id: string): Promise<Task> {
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await getNormalized(db.tasks, id);
    if (existing.completed <= COMPLETED_MIN) return existing;
    const updated: Task = { ...existing, completed: existing.completed - 1 };
    await db.tasks.put(updated);
    return updated;
  });
}

/** Lists every task in display order. Deterministic: the same stored data always sorts the same way, since order is read from the `position` field rather than table insertion order. */
export async function listTasks(): Promise<Task[]> {
  const db = await openDatabase();
  return sortByPosition(await db.tasks.toArray());
}

/**
 * Returns the current task: the first task in `position` order whose `done` is
 * false, or `null` when the list is empty or every task is done. Reads only
 * `tasks`; there is no stored reference that could dangle, so it never throws
 * for a data reason. Reordering is how the current task changes.
 */
export async function getCurrentTask(): Promise<Task | null> {
  const db = await openDatabase();
  return firstNotDone(await db.tasks.toArray());
}
