import type { PaletteColorId } from "./palette";

/**
 * A task as stored in the `tasks` table and returned by the repository.
 *
 * The pin is deliberately not a field here — see `AppMetaRecord` — so that
 * "exactly one task pinned" is a structural property of the data (a single
 * nullable reference) rather than an invariant the write path has to police
 * across many rows.
 */
export interface Task {
  /** Stable, unique, never reused after deletion. */
  id: string;
  /** Trimmed, 1-100 Unicode code points. */
  title: string;
  /** Exactly one emoji grapheme cluster. */
  emoji: string;
  /** Identifier of one entry in the fixed palette (see `./palette`), not a raw color value. */
  colorId: PaletteColorId;
  /** Estimated pomodoros. Integer, 1-20. */
  eta: number;
  /** Completed pomodoros. Integer, 0-999. Not wired to the timer in this task. */
  completed: number;
  /**
   * Display order. A dense, unique, zero-based integer among all tasks.
   * Renumbered on every structural change (create, delete, reorder) so
   * uniqueness and density hold by construction, not by UI discipline.
   */
  position: number;
}

/** The `tasks` table's on-disk shape. Identical to `Task` today; kept as a
 * separate alias so the Dexie table typing and the repository's public
 * `Task` type can diverge later without a churny rename. */
export type TaskRecord = Task;

/**
 * Single-row key/value table for app-wide state that must change atomically
 * with task rows, starting with the pin. Modeled as a table (not a field on
 * `PomotatoDatabase`) so a later schema version can add more keys without a
 * version bump just for app state.
 */
export interface AppMetaRecord {
  key: "pinnedTaskId";
  /** The pinned task's id, or `null` when nothing is pinned. */
  value: string | null;
}

/** Input accepted by `createTask`. Every field is optional except `title`; omitted fields take the defaults from the task file's Field rules table. */
export interface CreateTaskInput {
  title: string;
  emoji?: string;
  colorId?: string;
  eta?: number;
}

/** Input accepted by `updateTask`. Only the provided keys are validated and changed; omitted keys keep their stored value. Does not touch `completed`, `position`, or the pin — those have their own repository functions. */
export interface UpdateTaskInput {
  title?: string;
  emoji?: string;
  colorId?: string;
  eta?: number;
}

/** One field-level validation failure, suitable for mapping straight onto a form field's inline error. */
export interface ValidationIssue {
  field: "title" | "emoji" | "colorId" | "eta";
  message: string;
}
