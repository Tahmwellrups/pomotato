"use client";

import { useLayoutEffect } from "react";
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
    void useTimerStore.persist.rehydrate();
  }, []);

  return hasHydrated;
}
