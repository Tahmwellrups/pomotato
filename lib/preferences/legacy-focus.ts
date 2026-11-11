/**
 * Task 017 moved the Focus length from the timer store (`pomotato-timer`,
 * versions up to 3) into preferences. The two stores rehydrate independently
 * and in no guaranteed order, so the carry is written from both ends and is
 * safe to run twice: whichever side loads first moves the value, and a Focus
 * length already stored in preferences always wins over the stale timer entry.
 *
 * This file is the preferences end. It only reads the old timer entry; the
 * timer end (`lib/timer/carry-focus.ts`) does the write once it migrates.
 * Every read here is guarded: storage blocked, JSON malformed or no window
 * all read as "nothing to carry".
 */
import { TIMER_STORAGE_KEY } from "../timer/constants";
import { isDurationMinutes } from "../timer/time";

const LAST_TIMER_VERSION_WITH_FOCUS_MINUTES = 3;

/** The Focus length a timer entry at version 3 still holds, or null when it holds none. */
export function readLegacyTimerFocusMinutes(): number | null {
  try {
    const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const envelope = parsed as { version?: unknown; state?: unknown };
    if (envelope.version !== LAST_TIMER_VERSION_WITH_FOCUS_MINUTES) return null;
    if (typeof envelope.state !== "object" || envelope.state === null) return null;
    const minutes = (envelope.state as { focusMinutes?: unknown }).focusMinutes;
    return isDurationMinutes("focusMinutes", minutes) ? minutes : null;
  } catch {
    return null;
  }
}
