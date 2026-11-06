import type { TimerMode } from "../timer/types";

/**
 * A task as stored in the `tasks` table and returned by the repository.
 *
 * There is no pin. The current task is derived: the first task in display
 * order whose `done` is false. That "exactly one current task" property is
 * still structural, now because `position` is dense and unique by
 * construction (every structural write renumbers), so the answer is a pure
 * function of the sorted list with no write path left to police. Task 014
 * retired the pin; before it, the guarantee came from a single nullable
 * reference in `appMeta`.
 */
export interface Task {
  /** Stable, unique, never reused after deletion. */
  id: string;
  /** Trimmed, 1-100 Unicode code points. */
  title: string;
  /** Estimated pomodoros. Integer, 1-20. */
  eta: number;
  /** Completed pomodoros. Integer, 0-999. Incremented automatically when a focus-type session completes. */
  completed: number;
  /**
   * The user has marked this task finished. Independent of `completed` and
   * `eta`: a task can be done at 0 of 5 pomodoros, and not done at 7 of 3.
   * Never set automatically, never touched by `updateTask`. Not indexed.
   */
  done: boolean;
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

/** Input accepted by `createTask`. Every field is optional except `title`; omitted fields take the defaults from the task file's Field rules table. */
export interface CreateTaskInput {
  title: string;
  eta?: number;
}

/** Input accepted by `updateTask`. Only the provided keys are validated and changed; omitted keys keep their stored value. Does not touch `completed`, `position`, or `done` — those have their own repository functions. */
export interface UpdateTaskInput {
  title?: string;
  eta?: number;
}

/** One field-level validation failure, suitable for mapping straight onto a form field's inline error. */
export interface ValidationIssue {
  field: "title" | "eta";
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
  /** Task credited at completion time, or `null` when there was no current task (empty list, or every task done). */
  taskId: string | null;
  /** The credited task's title at log time, or `null` when `taskId` is `null`. Survives task deletion and keeps the breakdown label readable. */
  taskTitle: string | null;
}

/** Input to `logCompletedSession`. The task is NOT passed: the repository resolves the current task (first not-done, by position) itself, inside the transaction. */
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
