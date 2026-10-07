import { getDatabase } from "./database";
import { InvalidReorderIndexError, TaskNotFoundError, TaskValidationError } from "./errors";
import { DEFAULT_PALETTE_COLOR_ID, type PaletteColorId } from "./palette";
import type { CreateTaskInput, Task, UpdateTaskInput, ValidationIssue } from "./types";
import { COMPLETED_MAX, COMPLETED_MIN, validateColorId, validateEmoji, validateEta, validateTitle } from "./validation";

const DEFAULT_EMOJI = "\u{1F954}"; // 🥔
const DEFAULT_ETA = 1;
const DEFAULT_COMPLETED = 0;

/** Single key in the `appMeta` table that records the current pin. */
const PINNED_TASK_KEY = "pinnedTaskId" as const;

function sortByPosition(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.position - b.position);
}

/** Reassigns dense, zero-based positions matching the array's current order, so uniqueness holds by construction after every structural change. */
function renumber(tasks: Task[]): Task[] {
  return tasks.map((task, index) => ({ ...task, position: index }));
}

interface ValidatedTaskFields {
  title: string;
  emoji: string;
  colorId: PaletteColorId;
  eta: number;
}

function validateCreateInput(input: CreateTaskInput): ValidatedTaskFields {
  const issues: ValidationIssue[] = [];

  let title = "";
  const titleResult = validateTitle(input.title);
  if (titleResult.issue) issues.push(titleResult.issue);
  else title = titleResult.value;

  let emoji = DEFAULT_EMOJI;
  const emojiResult = validateEmoji(input.emoji ?? DEFAULT_EMOJI);
  if (emojiResult.issue) issues.push(emojiResult.issue);
  else emoji = emojiResult.value;

  let colorId: PaletteColorId = DEFAULT_PALETTE_COLOR_ID;
  const colorResult = validateColorId(input.colorId ?? DEFAULT_PALETTE_COLOR_ID);
  if (colorResult.issue) issues.push(colorResult.issue);
  else colorId = colorResult.value;

  let eta = DEFAULT_ETA;
  const etaResult = validateEta(input.eta ?? DEFAULT_ETA);
  if (etaResult.issue) issues.push(etaResult.issue);
  else eta = etaResult.value;

  if (issues.length > 0) {
    throw new TaskValidationError(issues);
  }

  return { title, emoji, colorId, eta };
}

function validateUpdateInput(input: UpdateTaskInput): Partial<ValidatedTaskFields> {
  const issues: ValidationIssue[] = [];
  const patch: Partial<ValidatedTaskFields> = {};

  if (input.title !== undefined) {
    const result = validateTitle(input.title);
    if (result.issue) issues.push(result.issue);
    else patch.title = result.value;
  }
  if (input.emoji !== undefined) {
    const result = validateEmoji(input.emoji);
    if (result.issue) issues.push(result.issue);
    else patch.emoji = result.value;
  }
  if (input.colorId !== undefined) {
    const result = validateColorId(input.colorId);
    if (result.issue) issues.push(result.issue);
    else patch.colorId = result.value;
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

/** Creates a task, validating every field per the Field rules table. Rejects with `TaskValidationError` (listing every failing field) and writes nothing on any failure. Added at the end of the display order. */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const fields = validateCreateInput(input);
  const db = getDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await db.tasks.toArray();
    const task: Task = {
      id: crypto.randomUUID(),
      title: fields.title,
      emoji: fields.emoji,
      colorId: fields.colorId,
      eta: fields.eta,
      completed: DEFAULT_COMPLETED,
      position: existing.length,
    };
    await db.tasks.add(task);
    return task;
  });
}

/** Updates only the provided fields (title, emoji, colorId, eta), validated the same way as `createTask`. Omitted fields, `completed`, `position`, and the pin are left untouched. Throws `TaskValidationError` on bad input or `TaskNotFoundError` if `id` doesn't exist; writes nothing in either case. */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const patch = validateUpdateInput(input);
  const db = getDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await db.tasks.get(id);
    if (!existing) throw new TaskNotFoundError(id);
    const updated: Task = { ...existing, ...patch };
    await db.tasks.put(updated);
    return updated;
  });
}

/**
 * Deletes a task, renumbers the remaining tasks' positions (preserving
 * their relative order), and clears the pin if this task was pinned — all
 * in one transaction, so no read ever sees a pin dangling on a deleted id.
 * Throws `TaskNotFoundError` if `id` doesn't exist.
 */
export async function deleteTask(id: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.tasks, db.appMeta], async () => {
    const existing = await db.tasks.get(id);
    if (!existing) throw new TaskNotFoundError(id);

    await db.tasks.delete(id);

    const remaining = renumber(sortByPosition(await db.tasks.toArray()));
    await db.tasks.bulkPut(remaining);

    const meta = await db.appMeta.get(PINNED_TASK_KEY);
    if (meta?.value === id) {
      await db.appMeta.put({ key: PINNED_TASK_KEY, value: null });
    }
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
  const db = getDatabase();
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
 * Pins `id` as the current task. Because the pin lives as a single nullable
 * reference in `appMeta` rather than a field on every task row, "at most one
 * task pinned" holds structurally: there is only ever one value to overwrite,
 * so pinning B while A is pinned can never leave a read observing both or
 * neither. Throws `TaskNotFoundError` if `id` doesn't exist.
 */
export async function pinTask(id: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.tasks, db.appMeta], async () => {
    const existing = await db.tasks.get(id);
    if (!existing) throw new TaskNotFoundError(id);
    await db.appMeta.put({ key: PINNED_TASK_KEY, value: id });
  });
}

/**
 * Unpins `id`. A no-op if `id` is valid but isn't the currently pinned task
 * (idempotent). Throws `TaskNotFoundError` if `id` doesn't exist.
 */
export async function unpinTask(id: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.tasks, db.appMeta], async () => {
    const existing = await db.tasks.get(id);
    if (!existing) throw new TaskNotFoundError(id);
    const meta = await db.appMeta.get(PINNED_TASK_KEY);
    if (meta?.value === id) {
      await db.appMeta.put({ key: PINNED_TASK_KEY, value: null });
    }
  });
}

/** Adds exactly 1 to the completed count, clamped at 999 (a no-op, not an error, once already there). Throws `TaskNotFoundError` if `id` doesn't exist. */
export async function incrementCompleted(id: string): Promise<Task> {
  const db = getDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await db.tasks.get(id);
    if (!existing) throw new TaskNotFoundError(id);
    if (existing.completed >= COMPLETED_MAX) return existing;
    const updated: Task = { ...existing, completed: existing.completed + 1 };
    await db.tasks.put(updated);
    return updated;
  });
}

/** Removes exactly 1 from the completed count, clamped at 0 (a no-op, not an error, once already there). Throws `TaskNotFoundError` if `id` doesn't exist. */
export async function decrementCompleted(id: string): Promise<Task> {
  const db = getDatabase();
  return db.transaction("rw", db.tasks, async () => {
    const existing = await db.tasks.get(id);
    if (!existing) throw new TaskNotFoundError(id);
    if (existing.completed <= COMPLETED_MIN) return existing;
    const updated: Task = { ...existing, completed: existing.completed - 1 };
    await db.tasks.put(updated);
    return updated;
  });
}

/** Lists every task in display order. Deterministic: the same stored data always sorts the same way, since order is read from the `position` field rather than table insertion order. */
export async function listTasks(): Promise<Task[]> {
  const db = getDatabase();
  return sortByPosition(await db.tasks.toArray());
}

/**
 * Returns the pinned task, or `null` if nothing is pinned. Also returns
 * `null` — never throws — if the stored pin references a task id that no
 * longer exists (for example, data written by a future version, or a bug
 * elsewhere that left a dangling reference): a missing lookup reads as "no
 * current task", the same as no pin at all.
 */
export async function getCurrentTask(): Promise<Task | null> {
  const db = getDatabase();
  const meta = await db.appMeta.get(PINNED_TASK_KEY);
  if (!meta || meta.value === null) return null;
  const task = await db.tasks.get(meta.value);
  return task ?? null;
}
