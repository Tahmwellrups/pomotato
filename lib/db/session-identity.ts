import type { SessionMode } from "./types";

/**
 * Deterministic run identity for a timer state that predates per-run ids
 * (a persisted version-1 `pomotato-timer` entry). Two tabs migrating the same
 * stored run derive the same value, so they still dedupe against each other;
 * a random id generated per tab would not. Only for migrated entries: every
 * run started after the migration gets a fresh `crypto.randomUUID()`.
 */
export function legacyRunId(mode: SessionMode, endTimestamp: number): string {
  return `legacy:${mode}:${endTimestamp}`;
}
