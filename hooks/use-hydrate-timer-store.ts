"use client";

import { useLayoutEffect } from "react";
import { usePreferencesStore } from "@/lib/preferences";
import { useTimerStore } from "@/lib/timer/store";

/**
 * Triggers the store's deferred persist rehydration after the client has
 * mounted. `useLayoutEffect` runs after hydration is already reconciled
 * against the server markup, so this update is a normal post-mount
 * re-render, not a hydration mismatch, and it lands before the browser
 * paints the hydrated frame.
 */
export function useHydrateTimerStore(): boolean {
  const hasHydrated = useTimerStore((state) => state.hasHydrated);

  useLayoutEffect(() => {
    // The session lengths live in preferences, and a reload that lands on an
    // expired run starts the next one from them while the timer rehydrates, so
    // preferences have to be in first. Rehydration reads synchronous storage
    // synchronously, so this is settled before the next line runs.
    if (!usePreferencesStore.persist.hasHydrated()) void usePreferencesStore.persist.rehydrate();
    void useTimerStore.persist.rehydrate();
  }, []);

  return hasHydrated;
}
