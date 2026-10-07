import type { ValidationIssue } from "./types";

/**
 * Thrown by any repository write when the input fails one or more Field
 * rules. Carries every failing field at once (not just the first) so the UI
 * can show an inline error per invalid field in a single round trip.
 */
export class TaskValidationError extends Error {
  readonly code = "TASK_VALIDATION" as const;
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Invalid task input: ${issues.map((issue) => issue.field).join(", ")}`);
    this.name = "TaskValidationError";
    this.issues = issues;
  }
}

/**
 * Thrown by update, delete, pin, unpin, or reorder when the given task id
 * does not exist. Never thrown for read operations like `listTasks` or
 * `getCurrentTask`, which treat a missing/dangling id as "none" instead.
 */
export class TaskNotFoundError extends Error {
  readonly code = "TASK_NOT_FOUND" as const;

  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = "TaskNotFoundError";
  }
}

/**
 * Thrown by `reorderTask` when `toIndex` is not a finite integer. A `NaN` or
 * a fractional value (for example from an unvalidated drag-and-drop index)
 * has no well-defined position to clamp to — `Array.prototype.splice`
 * silently treats `NaN` as `0` and truncates a fraction, which would move
 * the task to a position the caller never asked for. Writes nothing.
 */
export class InvalidReorderIndexError extends Error {
  readonly code = "INVALID_REORDER_INDEX" as const;

  constructor(toIndex: number) {
    super(`Invalid reorder target index: ${toIndex}. Expected a finite integer.`);
    this.name = "InvalidReorderIndexError";
  }
}

/**
 * Thrown when the repository is used where IndexedDB isn't available (for
 * example during server rendering, a build, or a browser with IndexedDB
 * disabled). Every repository function is `async`, so this surfaces as a
 * rejected promise, never a synchronous throw during import or render.
 */
export class DatabaseUnavailableError extends Error {
  readonly code = "DATABASE_UNAVAILABLE" as const;

  constructor(cause?: unknown) {
    super("IndexedDB is unavailable in this environment.");
    this.name = "DatabaseUnavailableError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
