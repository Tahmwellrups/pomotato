import { isPaletteColorId, type PaletteColorId } from "./palette";
import type { ValidationIssue } from "./types";

export const TITLE_MIN_LENGTH = 1;
export const TITLE_MAX_LENGTH = 100;
export const ETA_MIN = 1;
export const ETA_MAX = 20;
export const COMPLETED_MIN = 0;
export const COMPLETED_MAX = 999;

/** Counts Unicode code points, not UTF-16 code units, so surrogate-pair
 * characters (including emoji) count once each — matching the Field rules
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

/**
 * True when `value` is exactly one emoji grapheme cluster: a single-codepoint
 * pictograph, a ZWJ sequence, a skin-tone modifier sequence, a two-codepoint
 * regional-indicator flag, or a keycap sequence. Plain letters, digits,
 * punctuation, a lone regional indicator, multiple emoji, and emoji-plus-text
 * all fail, because each either segments into more than one grapheme
 * cluster or segments into one cluster with no code point qualifying below.
 */
export function isEmojiGraphemeCluster(value: string): boolean {
  if (value.length === 0) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(value), (entry) => entry.segment);
  if (segments.length !== 1 || segments[0] !== value) return false;

  const codePoints = Array.from(value);

  const hasExtendedPictographic = codePoints.some((cp) => /\p{Extended_Pictographic}/u.test(cp));
  if (hasExtendedPictographic) return true;

  const isFlag = codePoints.length === 2 && codePoints.every((cp) => /\p{Regional_Indicator}/u.test(cp));
  if (isFlag) return true;

  const isKeycap =
    codePoints.length === 3 &&
    /^[0-9#*]$/.test(codePoints[0]) &&
    codePoints[1] === "️" &&
    codePoints[2] === "⃣";
  if (isKeycap) return true;

  return false;
}

export function validateEmoji(rawEmoji: string): { value: string; issue: null } | { value: null; issue: ValidationIssue } {
  if (!isEmojiGraphemeCluster(rawEmoji)) {
    return {
      value: null,
      issue: { field: "emoji", message: "Emoji must be exactly one emoji." },
    };
  }
  return { value: rawEmoji, issue: null };
}

export function validateColorId(rawColorId: string): { value: PaletteColorId; issue: null } | { value: null; issue: ValidationIssue } {
  if (!isPaletteColorId(rawColorId)) {
    return {
      value: null,
      issue: { field: "colorId", message: "Color must be one of the fixed palette options." },
    };
  }
  return { value: rawColorId, issue: null };
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
