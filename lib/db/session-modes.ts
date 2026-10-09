import type { SessionMode } from "./types";

/** Every mode a session can carry. The single list the write path validates against. */
export const SESSION_MODES: readonly SessionMode[] = ["focus", "shortBreak", "longBreak", "custom"];

/**
 * The one place that decides what counts as focus. `focus` and `custom` are
 * focus-type; `shortBreak` and `longBreak` are break-type. Both the write
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
