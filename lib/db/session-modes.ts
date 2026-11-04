import type { SessionMode } from "./types";

/**
 * Exhaustive by construction: a `Record` keyed by `SessionMode` fails
 * typecheck if a stored mode is missing, and fails on an unknown key. Dropping
 * `"custom"` here (or from `SessionMode`) cannot happen quietly.
 *
 * `"custom"` persists after the timer stopped producing it (task 013) because
 * `sessions` rows written earlier still carry it.
 */
const SESSION_MODE_SET: Record<SessionMode, true> = {
  focus: true,
  shortBreak: true,
  longBreak: true,
  custom: true,
};

/** Every mode a session can carry. The single list the write path validates against. */
export const SESSION_MODES: readonly SessionMode[] = Object.keys(SESSION_MODE_SET) as SessionMode[];

/**
 * The one place that decides what counts as focus. `focus` and `custom` are
 * focus-type; `shortBreak` and `longBreak` are break-type. `custom` is a
 * historical value: no new row gets it, old rows still do. Both the write
 * path (task increment) and `lib/stats` (aggregation) call this; nothing else
 * may re-derive the rule. Pure and free of Dexie imports so `lib/stats` can
 * use it without touching IndexedDB.
 */
export function isFocusTypeMode(mode: SessionMode): boolean {
  return mode === "focus" || mode === "custom";
}

export function isSessionMode(value: unknown): value is SessionMode {
  return typeof value === "string" && (SESSION_MODES as readonly string[]).includes(value);
}
