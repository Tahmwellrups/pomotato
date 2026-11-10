import type { TimerMode } from "../timer/types";

/**
 * A task as stored in the `tasks` table and returned by the repository.
 *
 * There is no pin. The current task is derived: the first task in display
 * order (see `listTasks`) whose `completed` is false. That "exactly one
 * current task" property is structural because `order` is dense and unique
 * within every sibling group by construction, so the answer is a pure
 * function of the display-ordered list.
 *
 * Optional fields (`parentId`, `emoji`, `color`, `etaMinutes`) are ABSENT
 * when unset: the key does not exist on the stored row. Never `undefined`,
 * never `null`, never a default value.
 */
export interface Task {
  /** Stable, unique, never reused after deletion. */
  id: string;
  /** Trimmed, 1-100 Unicode code points. */
  title: string;
  /** The user has marked this task finished. Never set automatically, never touched by `updateTask`. Not indexed. */
  completed: boolean;
  /**
   * Position among siblings. A dense, unique, zero-based integer WITHIN a
   * sibling group (every task sharing the same `parentId`; absent means top
   * level). Two rows may both hold 0 if their parents differ. Indexed.
   */
  order: number;
  /** The parent task's id. Absent on a top-level task. One level deep only: a parent has no `parentId`, and a `parentId` names a stored top-level task. */
  parentId?: string;
  /** 1-16 Unicode code points after trimming. Stored, not rendered by task 016. */
  emoji?: string;
  /** Free string, 1-64 characters after trimming. No enum: the swatch set is undecided. Stored, not rendered by task 016. */
  color?: string;
  /** Estimated minutes. Integer, 1-1440. Stored, not rendered by task 016. */
  etaMinutes?: number;
  /** Completed pomodoros. Integer, 0-999. Incremented automatically when a focus-type session completes. */
  completedPomodoros: number;
  /** Epoch ms of creation. Never changes after creation (a restore keeps the original). */
  createdAt: number;
  /** Epoch ms of the last real write to this row. Always >= `createdAt`; a write that changes nothing does not move it. */
  updatedAt: number;
}

/** The `tasks` table's on-disk shape. Identical to `Task` today; kept as a
 * separate alias so the Dexie table typing and the repository's public
 * `Task` type can diverge later without a churny rename. */
export type TaskRecord = Task;

/** A task together with its direct children, in `order`. The shape `deleteTask` returns, `restoreTask` accepts and `duplicateTask` returns. `children` is empty for a subtask. */
export interface TaskTree {
  task: Task;
  children: Task[];
}

/**
 * Key/value table for app-wide state that must change atomically with task
 * rows. Modeled as a table so a later version can add keys without a bump.
 * `"pinnedTaskId"` was its only key and was retired in schema version 4
 * (task 014): nothing reads or writes it, and the upgrade deletes the stored
 * row. The literal stays because that upgrade has to name the key.
 */
export interface AppMetaRecord {
  key: "pinnedTaskId";
  value: string | null;
}

/** Input accepted by `createTask`. Only `title` is required. Unknown keys are ignored, never stored. */
export interface CreateTaskInput {
  title: string;
  /** Makes the task a subtask. Must name a stored top-level task, else `TaskValidationError` on `parentId`. */
  parentId?: string;
  /** Insertion index within the sibling group, clamped to `0..groupLength`; later siblings shift down by one. Omitted: appended last. Integer, else `InvalidReorderIndexError`. */
  order?: number;
  emoji?: string;
  color?: string;
  etaMinutes?: number;
}

/**
 * Input accepted by `updateTask`. Only the provided keys are validated and
 * changed. `null` on `emoji`, `color`, `etaMinutes` or `parentId` clears the
 * field (the key is removed from the row). `parentId` set to a task id moves
 * the task to the end of that parent's group; it is rejected when the task has
 * children or the target is not a stored top-level task. Does not touch
 * `completed`, `order` within a group, or `completedPomodoros`.
 */
export interface UpdateTaskInput {
  title?: string;
  emoji?: string | null;
  color?: string | null;
  etaMinutes?: number | null;
  parentId?: string | null;
}

/** One field-level validation failure, suitable for mapping straight onto a form field's inline error. */
export interface ValidationIssue {
  field: "title" | "emoji" | "color" | "etaMinutes" | "parentId";
  message: string;
}

/**
 * A mode that old session rows can carry but the timer no longer produces.
 * Task 013 removed Custom as a selectable mode; rows written before that
 * still say `"custom"` and must keep validating and counting as focus time.
 */
export type LegacySessionMode = "custom";

/**
 * Timer mode as stored on a session: every selectable timer mode plus the
 * legacy value. Built as a union ON TOP of `TimerMode`, never an alias of it,
 * so a new selectable mode is automatically loggable, and shrinking
 * `TimerMode` cannot remove `"custom"` from what is stored.
 */
export type SessionMode = TimerMode | LegacySessionMode;

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
  /** Task credited at completion time, or `null` when there was no current task (empty list, or every task completed). */
  taskId: string | null;
  /** The credited task's title at log time, or `null` when `taskId` is `null`. Survives task deletion and keeps the breakdown label readable. */
  taskTitle: string | null;
}

/** Input to `logCompletedSession`. The task is NOT passed: the repository resolves the current task (first not-completed, in display order) itself, inside the transaction. */
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

/** MIME types the background store accepts. Decided from the file's bytes, never its name or declared type. */
export type BackgroundMimeType = "image/png" | "image/jpeg" | "image/webp";

/**
 * The single row of the `backgrounds` table. Bytes are held as an
 * `ArrayBuffer`, not a `Blob`, so the repository can re-check them on read and
 * so older IndexedDB implementations that mishandle stored Blobs are not a risk.
 */
export interface BackgroundRecord {
  /** `crypto.randomUUID()`. The value the `background` preference holds. A replace mints a new one. */
  id: string;
  mimeType: BackgroundMimeType;
  bytes: ArrayBuffer;
  /** Original file name, trimmed and cut to `BACKGROUND_FILE_NAME_MAX_LENGTH`; `""` when the source had none. Display only. */
  fileName: string;
  /** Byte length of `bytes`. */
  size: number;
  /** Epoch ms of the write. */
  storedAt: number;
}

/** What the UI may know about a stored background without touching the bytes. */
export interface BackgroundInfo {
  id: string;
  mimeType: BackgroundMimeType;
  fileName: string;
  size: number;
}

/** A background ready to paint: the info plus a `Blob` the caller turns into an object URL (and revokes). */
export interface LoadedBackground extends BackgroundInfo {
  blob: Blob;
}

export type BackgroundIssueCode = "empty" | "too-large" | "unsupported-type" | "animated" | "corrupt";

/** Why a file was rejected. `message` is complete, user-facing, and states the limit where one applies. */
export interface BackgroundValidationIssue {
  code: BackgroundIssueCode;
  message: string;
}

/** Outcome of `storeBackground`. A rejection writes nothing and leaves the previous background untouched. */
export type StoreBackgroundResult =
  | { ok: true; background: BackgroundInfo }
  | { ok: false; issue: BackgroundValidationIssue };

/**
 * Outcome of `loadBackground`. `missing` covers a `null` id, no row, a row with
 * a different id, and stored bytes that no longer pass validation. `unavailable`
 * covers IndexedDB absent or blocked. Both mean "paint no background".
 */
export type LoadBackgroundResult =
  | { status: "found"; background: LoadedBackground }
  | { status: "missing" }
  | { status: "unavailable" };
