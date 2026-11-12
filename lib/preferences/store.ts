import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isLevel, type Mix } from "../audio/mix";
import type { DurationKey } from "../timer/constants";
import { isDurationMinutes } from "../timer/time";
import { readLegacyTimerFocusMinutes } from "./legacy-focus";
import {
  migratePreferences,
  PREFERENCE_DEFAULTS,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  sanitizePreferences,
  type BackgroundPreference,
  type GaugeStylePreference,
  type Preferences,
} from "./schema";

interface PreferencesState extends Preferences {
  /** True once the client has rehydrated persisted state. Not persisted itself. */
  hasHydrated: boolean;
}

interface PreferencesActions {
  setGaugeStyle: (gaugeStyle: GaugeStylePreference) => void;
  setBackground: (background: BackgroundPreference) => void;
  setMix: (mix: Mix) => void;
  setTaskPanelVisible: (visible: boolean) => void;
  /** Ignores a value outside that length's own bounds, so the stored value keeps its last valid entry. */
  setDuration: (key: DurationKey, minutes: number) => void;
  /** Puts the three session lengths back to their defaults. Nothing else changes. */
  resetDurations: () => void;
  setChimeEnabled: (enabled: boolean) => void;
  /** Ignores anything that is not an integer 0 to 100. */
  setChimeLevel: (level: number) => void;
  setHasHydrated: (value: boolean) => void;
}

export type PreferencesStore = PreferencesState & PreferencesActions;

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...PREFERENCE_DEFAULTS,
      hasHydrated: false,
      setGaugeStyle: (gaugeStyle) =>
        set({ gaugeStyle: sanitizePreferences({ gaugeStyle }).gaugeStyle }),
      setBackground: (background) => set({ background: sanitizePreferences({ background }).background }),
      setMix: (mix) => set({ mix: sanitizePreferences({ mix }).mix }),
      setTaskPanelVisible: (visible) =>
        set({ taskPanelVisible: sanitizePreferences({ taskPanelVisible: visible }).taskPanelVisible }),
      setDuration: (key, minutes) => {
        if (!isDurationMinutes(key, minutes)) return;
        set({ [key]: minutes });
      },
      resetDurations: () =>
        set({
          focusMinutes: PREFERENCE_DEFAULTS.focusMinutes,
          shortBreakMinutes: PREFERENCE_DEFAULTS.shortBreakMinutes,
          longBreakMinutes: PREFERENCE_DEFAULTS.longBreakMinutes,
        }),
      setChimeEnabled: (enabled) => set({ chimeEnabled: typeof enabled === "boolean" ? enabled : PREFERENCE_DEFAULTS.chimeEnabled }),
      setChimeLevel: (level) => {
        if (!isLevel(level)) return;
        set({ chimeLevel: level });
      },
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      version: PREFERENCES_VERSION,
      // Same reason as lib/timer/store.ts: rehydrate manually after mount so the
      // first client render matches the server-rendered default.
      skipHydration: true,
      partialize: (state): Preferences => ({
        gaugeStyle: state.gaugeStyle,
        background: state.background,
        mix: state.mix,
        taskPanelVisible: state.taskPanelVisible,
        focusMinutes: state.focusMinutes,
        shortBreakMinutes: state.shortBreakMinutes,
        longBreakMinutes: state.longBreakMinutes,
        chimeEnabled: state.chimeEnabled,
        chimeLevel: state.chimeLevel,
      }),
      // A version-2 entry has no Focus length of its own, so the one the old
      // timer store holds (if any) becomes it. An entry already at version 3
      // is never touched: a stored Focus length beats a stale timer entry.
      migrate: (persisted, version): Preferences => {
        const migrated = migratePreferences(persisted);
        if (version >= 3) return migrated;
        const carried = readLegacyTimerFocusMinutes();
        return carried === null ? migrated : { ...migrated, focusMinutes: carried };
      },
      // migrate is skipped when the stored version matches, so validate on every
      // rehydration. A bad value falls back to its default, and persist then
      // writes the sanitised state back over the bad entry (QA's 009 probe;
      // DECISIONS 2026-10-23), so malformed bytes do not survive a load.
      merge: (persisted, current) => {
        if (persisted === undefined || persisted === null) {
          // No preferences entry at all: the only place an old timer entry's
          // Focus length can still come from.
          const carried = readLegacyTimerFocusMinutes();
          const fresh = sanitizePreferences(persisted);
          return { ...current, ...fresh, focusMinutes: carried ?? fresh.focusMinutes };
        }
        // Always sanitised, never spread as stored: an unknown key left in the
        // envelope by an older version (task 019's `theme`) must not reach the
        // state, or it would be written back. Valid keys pass through unchanged.
        return { ...current, ...sanitizePreferences(persisted) };
      },
      onRehydrateStorage: () => () => {
        usePreferencesStore.getState().setHasHydrated(true);
      },
    }
  )
);
