import {
  FOCUS_MINUTES_MAX,
  FOCUS_MINUTES_MIN,
  LONG_BREAK_MINUTES,
  MS_PER_MINUTE,
  SHORT_BREAK_MINUTES,
} from "./constants";
import type { TimerMode, TimerStatus } from "./types";

/** The full duration of a mode, in ms. Focus uses the stored Focus length; both breaks are fixed. */
export function fullDurationMs(mode: TimerMode, focusMinutes: number): number {
  switch (mode) {
    case "focus":
      return focusMinutes * MS_PER_MINUTE;
    case "shortBreak":
      return SHORT_BREAK_MINUTES * MS_PER_MINUTE;
    case "longBreak":
      return LONG_BREAK_MINUTES * MS_PER_MINUTE;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Remaining time, in ms, derived from state and the current wall clock.
 * Never reads from a decremented counter: idle and complete are constants,
 * paused reads the frozen snapshot, and running is always `endTimestamp - now`.
 */
export function getRemainingMs(
  status: TimerStatus,
  endTimestamp: number | null,
  pausedRemainingMs: number | null,
  fullMs: number,
  now: number
): number {
  switch (status) {
    case "idle":
      return fullMs;
    case "complete":
      return 0;
    case "paused":
      return clamp(pausedRemainingMs ?? fullMs, 0, fullMs);
    case "running":
      if (endTimestamp === null) return fullMs;
      return clamp(endTimestamp - now, 0, fullMs);
  }
}

/**
 * Formats remaining ms as MM:SS. Seconds round up (ceiling) so the display
 * only reaches 00:00 once remainingMs is truly 0, never while time is left.
 */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export type FocusMinutesResult = { ok: true; value: number } | { ok: false; error: string };

/** Validates raw Focus-length input: whole minutes, 1 to 180 inclusive. */
export function parseFocusMinutes(raw: string): FocusMinutesResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter a duration in minutes." };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "Enter a whole number of minutes, with no decimals." };
  }
  const value = Number(trimmed);
  if (value < FOCUS_MINUTES_MIN || value > FOCUS_MINUTES_MAX) {
    return { ok: false, error: `Enter a number from ${FOCUS_MINUTES_MIN} to ${FOCUS_MINUTES_MAX}.` };
  }
  return { ok: true, value };
}
