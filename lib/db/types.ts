import type { TimerMode } from "../timer/types";
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
  /** Completed pomodoros. Integer, 0-999. Incremented automatically when a focus-type session completes. */
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

/** Timer mode as stored on a session. Same union as the timer store's `TimerMode`. */
export type SessionMode = TimerMode;

/** One timer run that reached its end timestamp, as stored in the `sessions` table. */
export interface SessionRecord {
  /** Row identity. `crypto.randomUUID()`, assigned by the repository. */
  id: string;
  /**
   * Per-run identity supplied by the timer. UNIQUE in the table: the
   * repository treats a second write with the same value as a no-op.
   */
  runId: string;
  mode: SessionMode;
  /** Epoch ms when the run was first started. */
  startedAt: number;
  /** Epoch ms when the run reached zero: the stored end timestamp, never the time it was noticed. Indexed. */
  endedAt: number;
  /** The run's full planned duration in ms. Stats sum this, not `endedAt - startedAt`. */
  plannedDurationMs: number;
  /** Task credited at completion time, or `null` when none was pinned (or the pinned task no longer existed). */
  taskId: string | null;
  /** The credited task's title at log time, or `null` when `taskId` is `null`. Survives task deletion and keeps the breakdown label readable. */
  taskTitle: string | null;
}

/** Input to `logCompletedSession`. The task is NOT passed: the repository reads the pin itself, inside the transaction. */
export interface LogSessionInput {
  runId: string;
  mode: SessionMode;
  startedAt: number;
  endedAt: number;
  plannedDurationMs: number;
}

/** Outcome of `logCompletedSession`. */
export interface LogSessionResult {
  /** `"logged"` for the first write of this `runId`, `"duplicate"` when it was already stored (nothing was written). */
  status: "logged" | "duplicate";
  /** The stored row (for a duplicate, the originally stored one). */
  session: SessionRecord;
  /** The credited task after the increment, or `null` when untagged. For a duplicate, always `null`. */
  task: Task | null;
}

export interface SessionValidationIssue {
  field: "runId" | "mode" | "startedAt" | "endedAt" | "plannedDurationMs" | "from" | "to";
  message: string;
}
