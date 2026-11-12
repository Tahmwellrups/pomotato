import type { ValidationIssue } from "./types";

export const TITLE_MIN_LENGTH = 1;
export const TITLE_MAX_LENGTH = 100;
export const ETA_MINUTES_MIN = 1;
export const ETA_MINUTES_MAX = 1440;
export const EMOJI_MAX_LENGTH = 16;
export const COLOR_MAX_LENGTH = 64;
export const COMPLETED_MIN = 0;
export const COMPLETED_MAX = 999;

/** Counts Unicode code points, not UTF-16 code units, so surrogate-pair
 * characters (including emoji typed into a title) count once each — matching the Field rules
 * table's "counted as Unicode code points". */
function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function validateTitle(rawTitle: string): { value: string; issue: null } | { value: null; issue: ValidationIssue } {
  const trimmed = typeof rawTitle === "string" ? rawTitle.trim() : "";
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

type Validated<T> = { value: T; issue: null } | { value: null; issue: ValidationIssue };

export function validateEtaMinutes(raw: number): Validated<number> {
  if (!Number.isInteger(raw) || raw < ETA_MINUTES_MIN || raw > ETA_MINUTES_MAX) {
    return {
      value: null,
      issue: { field: "etaMinutes", message: `Estimate must be a whole number of minutes from ${ETA_MINUTES_MIN} to ${ETA_MINUTES_MAX}.` },
    };
  }
  return { value: raw, issue: null };
}

export function validateEmoji(raw: string): Validated<string> {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const length = codePointLength(trimmed);
  if (length < 1 || length > EMOJI_MAX_LENGTH) {
    return { value: null, issue: { field: "emoji", message: `Emoji must be 1-${EMOJI_MAX_LENGTH} characters after trimming.` } };
  }
  return { value: trimmed, issue: null };
}

/** `color` is a free string: length-checked only, never compared against a palette. */
export function validateColor(raw: string): Validated<string> {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const length = codePointLength(trimmed);
  if (length < 1 || length > COLOR_MAX_LENGTH) {
    return { value: null, issue: { field: "color", message: `Color must be 1-${COLOR_MAX_LENGTH} characters after trimming.` } };
  }
  return { value: trimmed, issue: null };
}
