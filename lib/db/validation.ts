import type { ValidationIssue } from "./types";

export const TITLE_MIN_LENGTH = 1;
export const TITLE_MAX_LENGTH = 100;
export const ETA_MIN = 1;
export const ETA_MAX = 20;
export const COMPLETED_MIN = 0;
export const COMPLETED_MAX = 999;

/** Counts Unicode code points, not UTF-16 code units, so surrogate-pair
 * characters (including emoji typed into a title) count once each — matching the Field rules
 * table's "counted as Unicode code points". */
function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function validateTitle(rawTitle: string): { value: string; issue: null } | { value: null; issue: ValidationIssue } {
  const trimmed = rawTitle.trim();
  const length = codePointLength(trimmed);
  if (length < TITLE_MIN_LENGTH || length > TITLE_MAX_LENGTH) {
    return {
      value: null,
      issue: {
        field: "title",
        message: `Title must be ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} characters after trimming.`,
      },
    };
  }
  return { value: trimmed, issue: null };
}

export function validateEta(rawEta: number): { value: number; issue: null } | { value: null; issue: ValidationIssue } {
  if (!Number.isInteger(rawEta) || rawEta < ETA_MIN || rawEta > ETA_MAX) {
    return {
      value: null,
      issue: { field: "eta", message: `Estimate must be a whole number from ${ETA_MIN} to ${ETA_MAX}.` },
    };
  }
  return { value: rawEta, issue: null };
}
