/**
 * The timer end of the Focus-length carry (task 017). Called when a version 3
 * timer entry is migrated, just before `focusMinutes` leaves the timer store.
 * `lib/preferences/legacy-focus.ts` is the other end; see it for why both exist.
 *
 * A Focus length already stored in preferences wins and nothing is written.
 * Otherwise the value is moved into preferences, in memory when that store has
 * already rehydrated and straight into its stored entry when it has not (a
 * `setState` before rehydration would persist the defaults over the entry).
 */
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  sanitizePreferences,
  usePreferencesStore,
} from "@/lib/preferences";
import { isDurationMinutes } from "./time";

export function carryFocusMinutesToPreferences(minutes: number): void {
  if (!isDurationMinutes("focusMinutes", minutes)) return;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    const envelope = typeof parsed === "object" && parsed !== null ? (parsed as { state?: unknown }) : {};
    const state: unknown = envelope.state;
    const stored =
      typeof state === "object" && state !== null ? (state as { focusMinutes?: unknown }).focusMinutes : undefined;
    if (stored !== undefined) return;

    if (usePreferencesStore.persist.hasHydrated()) {
      usePreferencesStore.setState({ focusMinutes: minutes });
      return;
    }
    // HAZARD (reviewer, task 017 finding 10): this is the second writer to
    // `pomotato-preferences`, and it stamps the current version onto data it only
    // sanitised. That is correct today because `migratePreferences` is literally
    // `sanitizePreferences`. The day a preferences migration does more than
    // sanitise, this line would stamp the new version onto un-migrated data and
    // the real `migrate` would then be skipped on the version match. Anyone
    // adding such a migration must route this write through it.
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ state: { ...sanitizePreferences(state), focusMinutes: minutes }, version: PREFERENCES_VERSION })
    );
  } catch {
    // Storage blocked or unreadable: the timer still migrates, the length falls back to the default.
  }
}
