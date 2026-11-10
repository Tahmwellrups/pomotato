import type { EntityTable } from "dexie";
import { openDatabase } from "./database";
import { InvalidCompletedValueError, InvalidReorderIndexError, TaskNotFoundError, TaskValidationError } from "./errors";
import type { CreateTaskInput, Task, TaskRecord, TaskTree, UpdateTaskInput, ValidationIssue } from "./types";
import { COMPLETED_MAX, COMPLETED_MIN, validateColor, validateEmoji, validateEtaMinutes, validateTitle } from "./validation";

type TaskTable = EntityTable<TaskRecord, "id">;

/** Stored rows can carry something that is not the declared type; only a real `true` counts as completed, only a non-negative integer counts as a pomodoro count. */
export function normalizeTask(row: Task): Task {
  const completed = typeof row.completed === "boolean" ? row.completed : false;
  const completedPomodoros =
    typeof row.completedPomodoros === "number" && Number.isInteger(row.completedPomodoros) && row.completedPomodoros >= 0
      ? row.completedPomodoros
      : 0;
  const createdAt = Number.isFinite(row.createdAt) ? row.createdAt : 0;
  const updatedAt = Number.isFinite(row.updatedAt) ? row.updatedAt : createdAt;
  if (
    completed === row.completed &&
    completedPomodoros === row.completedPomodoros &&
    createdAt === row.createdAt &&
    updatedAt === row.updatedAt
  ) {
    return row;
  }
  return { ...row, completed, completedPomodoros, createdAt, updatedAt };
}

function compareByOrder(a: Task, b: Task): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Every task sharing `parentId` (`undefined` = top level), sorted by `order`. */
function siblingsOf(rows: Task[], parentId: string | undefined): Task[] {
  return rows.filter((row) => row.parentId === parentId).sort(compareByOrder);
}

/**
 * Display order, a pure function of the rows: top-level tasks by `order`, each
 * followed by its own children by their `order`. A child whose parent is not
 * stored (never produced by the repository) is kept, after everything else,
 * rather than dropped.
 */
export function displayOrder(rows: Task[]): Task[] {
  const normalized = rows.map(normalizeTask);
  const top = normalized.filter((row) => row.parentId === undefined).sort(compareByOrder);
  const topIds = new Set(top.map((row) => row.id));
  const result: Task[] = [];
  for (const parent of top) {
    result.push(parent);
    result.push(...siblingsOf(normalized, parent.id));
  }
  result.push(...normalized.filter((row) => row.parentId !== undefined && !topIds.has(row.parentId)).sort(compareByOrder));
  return result;
}

/** The current task: first in display order whose `completed` is false, or `null`. Shared with `logCompletedSession` so both resolve it identically. */
export function firstNotCompleted(rows: Task[]): Task | null {
  return displayOrder(rows).find((task) => !task.completed) ?? null;
}

/** A later `updatedAt` than the row's previous one, even inside one millisecond. Keeps `createdAt <= updatedAt` and makes "moved" observable. */
function stampAfter(previous: number): number {
  return Math.max(Date.now(), previous + 1);
}

function touch(row: Task, patch: Partial<Task> = {}): Task {
  return { ...row, ...patch, updatedAt: stampAfter(row.updatedAt) };
}

/** Rows of `group` (already in the desired sequence) whose `order` is not their index, rewritten with the index and a fresh `updatedAt`. Rows already in place are not returned, so they are not written. */
function renumberChanges(group: Task[]): Task[] {
  const changed: Task[] = [];
  group.forEach((row, index) => {
    if (row.order !== index) changed.push(touch(row, { order: index }));
  });
  return changed;
}

function sameRow(a: Task, b: Task): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a as unknown as Record<string, unknown>)[key] !== (b as unknown as Record<string, unknown>)[key]) return false;
  }
  return true;
}

function clampIndex(index: number, max: number): number {
  return Math.max(0, Math.min(index, max));
}

/** A copy of `row` with only the Task keys, so an unknown key can never ride along into storage. Optional keys are copied only when present. */
function pickTask(row: Task): Task {
  const task: Task = {
    id: row.id,
    title: row.title,
    completed: row.completed,
    order: row.order,
    completedPomodoros: row.completedPomodoros,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.parentId !== undefined) task.parentId = row.parentId;
  if (row.emoji !== undefined) task.emoji = row.emoji;
  if (row.color !== undefined) task.color = row.color;
  if (row.etaMinutes !== undefined) task.etaMinutes = row.etaMinutes;
  return task;
}

interface ValidatedFields {
  title?: string;
  emoji?: string | null;
  color?: string | null;
  etaMinutes?: number | null;
}

function validateFields(
  input: { title?: string; emoji?: string | null; color?: string | null; etaMinutes?: number | null },
  requireTitle: boolean,
  extraIssues: ValidationIssue[] = [],
): ValidatedFields {
  const issues: ValidationIssue[] = [...extraIssues];
  const out: ValidatedFields = {};

  if (input.title !== undefined || requireTitle) {
    const result = validateTitle(input.title as string);
    if (result.issue) issues.push(result.issue);
    else out.title = result.value;
  }
  if (input.emoji !== undefined) {
    if (input.emoji === null) out.emoji = null;
    else {
      const result = validateEmoji(input.emoji);
      if (result.issue) issues.push(result.issue);
      else out.emoji = result.value;
    }
  }
  if (input.color !== undefined) {
    if (input.color === null) out.color = null;
    else {
      const result = validateColor(input.color);
      if (result.issue) issues.push(result.issue);
      else out.color = result.value;
    }
  }
  if (input.etaMinutes !== undefined) {
    if (input.etaMinutes === null) out.etaMinutes = null;
    else {
      const result = validateEtaMinutes(input.etaMinutes);
      if (result.issue) issues.push(result.issue);
      else out.etaMinutes = result.value;
    }
  }

  if (issues.length > 0) throw new TaskValidationError(issues);
  return out;
}

/** Applies validated optional fields to a row: a string/number sets it, `null` removes the key, `undefined` leaves it. */
function applyOptional(row: Task, fields: ValidatedFields): Task {
  const next: Task = { ...row };
  if (fields.title !== undefined) next.title = fields.title;
  if (fields.emoji === null) delete next.emoji;
  else if (fields.emoji !== undefined) next.emoji = fields.emoji;
  if (fields.color === null) delete next.color;
  else if (fields.color !== undefined) next.color = fields.color;
  if (fields.etaMinutes === null) delete next.etaMinutes;
  else if (fields.etaMinutes !== undefined) next.etaMinutes = fields.etaMinutes;
  return next;
}

function parentIssue(message: string): ValidationIssue {
  return { field: "parentId", message };
}

/** Throws a `parentId` validation error unless `parentId` names a stored top-level task (and is not `selfId`). */
function assertValidParent(rows: Task[], parentId: string, selfId: string | null): void {
  if (typeof parentId !== "string") throw new TaskValidationError([parentIssue("parentId must be a task id.")]);
  if (parentId === selfId) throw new TaskValidationError([parentIssue("A task cannot be its own parent.")]);
  const parent = rows.find((row) => row.id === parentId);
  if (!parent) throw new TaskValidationError([parentIssue("parentId does not name a stored task.")]);
  if (parent.parentId !== undefined) {
    throw new TaskValidationError([parentIssue("Subtasks are one level deep: a subtask cannot be a parent.")]);
  }
}

async function getNormalized(table: TaskTable, id: string): Promise<Task> {
  const row = await table.get(id);
  if (!row) throw new TaskNotFoundError(id);
  return normalizeTask(row);
}

/**
 * Creates a task, validating every field. Rejects with `TaskValidationError`
 * (listing every failing field) and writes nothing on any failure, including a
 * `parentId` that names no stored task or a task that is itself a subtask.
 * Inserted at `input.order` within its sibling group (default: last); later
 * siblings shift down by one in the same transaction. Unknown keys, including
 * the retired `done`, `eta` and `position`, are ignored and never stored.
 * Throws `InvalidReorderIndexError` when `order` is not an integer.
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const parentId = input.parentId;
  const parentTypeIssues: ValidationIssue[] =
    parentId !== undefined && typeof parentId !== "string" ? [parentIssue("parentId must be a task id.")] : [];
  const fields = validateFields(input, true, parentTypeIssues);
  if (input.order !== undefined && !Number.isInteger(input.order)) throw new InvalidReorderIndexError(input.order);

  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const rows = (await db.tasks.toArray()).map(normalizeTask);
    if (parentId !== undefined) assertValidParent(rows, parentId, null);
    const group = siblingsOf(rows, parentId);
    const index = clampIndex(input.order ?? group.length, group.length);
    const now = Date.now();
    const base: Task = {
      id: crypto.randomUUID(),
      title: "",
      completed: false,
      order: index,
      completedPomodoros: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (parentId !== undefined) base.parentId = parentId;
    const task = applyOptional(base, fields);

    const sequence = [...group];
    sequence.splice(index, 0, task);
    await db.tasks.bulkPut([task, ...renumberChanges(sequence).filter((row) => row.id !== task.id)]);
    return task;
  });
}

/**
 * Updates only the provided fields (`title`, `emoji`, `color`, `etaMinutes`,
 * `parentId`), validated like `createTask`; `null` clears an optional field.
 * Keys outside that set are ignored, never stored. A change that leaves every
 * field as stored writes nothing and does not move `updatedAt`. Setting
 * `parentId` moves the task to the end of that group and renumbers both groups
 * (see `UpdateTaskInput`). Throws `TaskValidationError` on bad input or
 * `TaskNotFoundError` if `id` doesn't exist; writes nothing in either case.
 */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const fields = validateFields(input, false);
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const rows = (await db.tasks.toArray()).map(normalizeTask);
    const existing = rows.find((row) => row.id === id);
    if (!existing) throw new TaskNotFoundError(id);

    let updated = applyOptional(existing, fields);
    const writes: Task[] = [];

    if (input.parentId !== undefined && input.parentId !== (existing.parentId ?? null)) {
      if (input.parentId !== null) {
        assertValidParent(rows, input.parentId, id);
        if (rows.some((row) => row.parentId === id)) {
          throw new TaskValidationError([parentIssue("A task that has subtasks cannot become a subtask.")]);
        }
      }
      const target = input.parentId ?? undefined;
      const oldGroup = siblingsOf(rows, existing.parentId).filter((row) => row.id !== id);
      writes.push(...renumberChanges(oldGroup));
      updated = { ...updated, order: siblingsOf(rows, target).length };
      if (target === undefined) delete updated.parentId;
      else updated.parentId = target;
    }

    if (sameRow(updated, existing)) return existing;
    const stored = touch(updated);
    await db.tasks.bulkPut([stored, ...writes]);
    return stored;
  });
}

/**
 * Deletes a task and, when it is a parent, its children, in one transaction,
 * then renumbers the deleted task's own sibling group densely (deleting a child
 * touches only its parent's group; deleting a parent touches only the top
 * level). Returns what was removed, exactly as stored, so a caller can hand it
 * to `restoreTask`. Throws `TaskNotFoundError` if `id` doesn't exist.
 */
export async function deleteTask(id: string): Promise<TaskTree> {
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const rows = (await db.tasks.toArray()).map(normalizeTask);
    const existing = rows.find((row) => row.id === id);
    if (!existing) throw new TaskNotFoundError(id);

    const children = siblingsOf(rows, id);
    await db.tasks.bulkDelete([id, ...children.map((child) => child.id)]);

    const remaining = siblingsOf(rows, existing.parentId).filter((row) => row.id !== id);
    const changes = renumberChanges(remaining);
    if (changes.length > 0) await db.tasks.bulkPut(changes);
    return { task: existing, children };
  });
}

/**
 * Puts back what `deleteTask` returned: the task with its original `id`,
 * `createdAt` and every other field, at its recorded `order` within its group
 * (clamped to last when the group has since shrunk below it), and its children
 * under it at their own ids and relative order. Later siblings shift down. Every
 * restored row gets a later `updatedAt`. Restoring twice is a NO-OP: when a row
 * with the task's id is already stored, nothing is written and the stored task
 * is returned, so it can never duplicate a row. Throws `TaskNotFoundError` (naming the
 * parent) when a restored subtask's parent is no longer stored or is itself a
 * subtask; writes nothing.
 */
export async function restoreTask(tree: TaskTree): Promise<Task> {
  const snapshot = normalizeTask(pickTask(tree.task));
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const rows = (await db.tasks.toArray()).map(normalizeTask);
    const already = rows.find((row) => row.id === snapshot.id);
    if (already) return already;

    if (snapshot.parentId !== undefined) {
      const parent = rows.find((row) => row.id === snapshot.parentId);
      if (!parent || parent.parentId !== undefined) throw new TaskNotFoundError(snapshot.parentId);
    }

    const group = siblingsOf(rows, snapshot.parentId);
    const index = clampIndex(snapshot.order, group.length);
    const restored = touch(snapshot, { order: index });
    const sequence = [...group];
    sequence.splice(index, 0, restored);
    const writes: Task[] = [restored, ...renumberChanges(sequence).filter((row) => row.id !== restored.id)];

    if (snapshot.parentId === undefined) {
      const known = new Set(rows.map((row) => row.id));
      const kids = tree.children
        .map((child) => normalizeTask(pickTask(child)))
        .filter((child) => !known.has(child.id) && child.id !== restored.id)
        .sort(compareByOrder);
      kids.forEach((child, childIndex) => {
        writes.push(touch({ ...child, parentId: restored.id }, { order: childIndex }));
      });
    }
    await db.tasks.bulkPut(writes);
    return restored;
  });
}

/**
 * Copies a task directly below the original. A parent is copied with its
 * children (fresh ids, `order` 0..n-1 under the copy); a subtask is copied as a
 * sibling directly below it and touches no other group. The copy keeps `title`,
 * `completed`, `completedPomodoros`, `emoji`, `color` and `etaMinutes`, with fresh
 * `id`, `createdAt` and `updatedAt`. Later siblings in the group shift down by
 * one (and get a later `updatedAt`, being rewritten). Returns the new rows.
 * Throws `TaskNotFoundError` if `id` doesn't exist.
 */
export async function duplicateTask(id: string): Promise<TaskTree> {
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const rows = (await db.tasks.toArray()).map(normalizeTask);
    const source = rows.find((row) => row.id === id);
    if (!source) throw new TaskNotFoundError(id);

    const now = Date.now();
    const copyOf = (original: Task, patch: Partial<Task>): Task => ({
      ...pickTask(original),
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...patch,
    });

    const group = siblingsOf(rows, source.parentId);
    const sourceIndex = group.findIndex((row) => row.id === id);
    const copy = copyOf(source, { order: sourceIndex + 1 });
    const sequence = [...group];
    sequence.splice(sourceIndex + 1, 0, copy);
    const children = siblingsOf(rows, id).map((child, index) => copyOf(child, { parentId: copy.id, order: index }));

    await db.tasks.bulkPut([copy, ...children, ...renumberChanges(sequence).filter((row) => row.id !== copy.id)]);
    return { task: copy, children };
  });
}

/**
 * Moves the task with id `id` to index `toIndex` WITHIN ITS OWN SIBLING GROUP
 * (clamped to the group's bounds) and renumbers that group, in one
 * transaction. A parent carries its children with it (they are ordered by their
 * own `order` under it); a subtask can never leave its parent. Moving a task to
 * the index it already occupies writes nothing. Returns the whole list in
 * display order. Throws `TaskNotFoundError` if `id` doesn't exist, or
 * `InvalidReorderIndexError` if `toIndex` is not an integer.
 */
export async function reorderTask(id: string, toIndex: number): Promise<Task[]> {
  if (!Number.isInteger(toIndex)) {
    throw new InvalidReorderIndexError(toIndex);
  }
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const rows = (await db.tasks.toArray()).map(normalizeTask);
    const existing = rows.find((row) => row.id === id);
    if (!existing) throw new TaskNotFoundError(id);

    const group = siblingsOf(rows, existing.parentId);
    const currentIndex = group.findIndex((row) => row.id === id);
    const target = clampIndex(toIndex, group.length - 1);
    if (target === currentIndex) return displayOrder(rows);

    const [moved] = group.splice(currentIndex, 1);
    group.splice(target, 0, moved);
    const changes = renumberChanges(group);
    await db.tasks.bulkPut(changes);
    const byId = new Map(changes.map((row) => [row.id, row]));
    return displayOrder(rows.map((row) => byId.get(row.id) ?? row));
  });
}

/**
 * Sets whether a task is finished. Independent of the pomodoro count: it never
 * reads or changes `completedPomodoros`, and `incrementCompleted` never calls
 * it. Does not cascade to a parent's children or a child's parent. Setting the
 * value it already holds writes nothing and returns the record as stored. Throws
 * `InvalidCompletedValueError` (nothing written) when `completed` is not a
 * boolean, or `TaskNotFoundError` if `id` doesn't exist.
 */
export async function setTaskCompleted(id: string, completed: boolean): Promise<Task> {
  if (typeof completed !== "boolean") {
    throw new InvalidCompletedValueError(completed);
  }
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await getNormalized(db.tasks, id);
    if (existing.completed === completed) return existing;
    const updated = touch(existing, { completed });
    await db.tasks.put(updated);
    return updated;
  });
}

/** Adds exactly 1 to `completedPomodoros`, clamped at 999 (a no-op, not an error, once already there). Throws `TaskNotFoundError` if `id` doesn't exist. */
export async function incrementCompleted(id: string): Promise<Task> {
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await getNormalized(db.tasks, id);
    if (existing.completedPomodoros >= COMPLETED_MAX) return existing;
    const updated = touch(existing, { completedPomodoros: existing.completedPomodoros + 1 });
    await db.tasks.put(updated);
    return updated;
  });
}

/**
 * Removes exactly 1 from `completedPomodoros`, clamped at 0 (a no-op, not an
 * error, once already there). Throws `TaskNotFoundError` if `id` doesn't exist.
 * No surface calls this since task 016 removed the +1/-1 controls; it is kept
 * for when the count surface returns.
 */
export async function decrementCompleted(id: string): Promise<Task> {
  const db = await openDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await getNormalized(db.tasks, id);
    if (existing.completedPomodoros <= COMPLETED_MIN) return existing;
    const updated = touch(existing, { completedPomodoros: existing.completedPomodoros - 1 });
    await db.tasks.put(updated);
    return updated;
  });
}

/** Lists every task in display order (top-level by `order`, each parent's children right after it). Deterministic: the same stored data always sorts the same way. */
export async function listTasks(): Promise<Task[]> {
  const db = await openDatabase();
  return displayOrder(await db.tasks.toArray());
}

/**
 * Returns the current task: the first task in display order whose `completed`
 * is false, or `null` when the list is empty or every task is completed. Reads
 * only `tasks`; there is no stored reference that could dangle.
 */
export async function getCurrentTask(): Promise<Task | null> {
  const db = await openDatabase();
  return firstNotCompleted(await db.tasks.toArray());
}
