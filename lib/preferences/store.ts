import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isPreferences,
  migratePreferences,
  PREFERENCE_DEFAULTS,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  sanitizePreferences,
  type Preferences,
  type ThemePreference,
} from "./schema";

interface PreferencesState extends Preferences {
  /** True once the client has rehydrated persisted state. Not persisted itself. */
  hasHydrated: boolean;
}

interface PreferencesActions {
  setTheme: (theme: ThemePreference) => void;
  setHasHydrated: (value: boolean) => void;
}

export type PreferencesStore = PreferencesState & PreferencesActions;

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...PREFERENCE_DEFAULTS,
      hasHydrated: false,
      setTheme: (theme) => set({ theme: sanitizePreferences({ theme }).theme }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      version: PREFERENCES_VERSION,
      // Same reason as lib/timer/store.ts: rehydrate manually after mount so the
      // first client render matches the server-rendered default. The painted
      // theme does not wait for this, the boot script has already set the class.
      skipHydration: true,
      partialize: (state): Preferences => ({ theme: state.theme }),
      migrate: (persisted): Preferences => migratePreferences(persisted),
      // migrate is skipped when the stored version matches, so validate on every
      // rehydration. A bad value falls back to its default and is not written
      // back: persist only writes on a state change or a migration.
      merge: (persisted, current) => {
        const next = isPreferences(persisted) ? persisted : sanitizePreferences(persisted);
        return { ...current, ...next };
      },
      onRehydrateStorage: () => () => {
        usePreferencesStore.getState().setHasHydrated(true);
      },
    }
  )
);
