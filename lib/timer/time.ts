import { DURATION_LIMITS, MS_PER_MINUTE, type DurationKey } from "./constants";
import type { TimerMode, TimerStatus } from "./types";

/** The three session lengths in whole minutes, as stored in preferences. */
export type Durations = Readonly<Record<DurationKey, number>>;

/** Which stored length each mode reads. */
export const MODE_DURATION_KEY: Readonly<Record<TimerMode, DurationKey>> = {
  focus: "focusMinutes",
  shortBreak: "shortBreakMinutes",
  longBreak: "longBreakMinutes",
};

/** The full duration of a mode, in ms. The only place minutes become milliseconds. */
export function fullDurationMs(mode: TimerMode, durations: Durations): number {
  return durations[MODE_DURATION_KEY[mode]] * MS_PER_MINUTE;
}

/** True for a whole number of minutes inside that field's own bounds. */
export function isDurationMinutes(key: DurationKey, value: unknown): value is number {
  const { min, max } = DURATION_LIMITS[key];
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
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

export type MinutesResult = { ok: true; value: number } | { ok: false; error: string };

/** Validates raw input for one length field: whole minutes inside that field's own bounds. */
export function parseMinutes(key: DurationKey, raw: string): MinutesResult {
  const { min, max } = DURATION_LIMITS[key];
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter a duration in minutes." };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "Enter a whole number of minutes, with no decimals." };
  }
  const value = Number(trimmed);
  if (value < min || value > max) {
    return { ok: false, error: `Enter a number from ${min} to ${max}.` };
  }
  return { ok: true, value };
}
