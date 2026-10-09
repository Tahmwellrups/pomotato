"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. The server snapshot is `false`, so the first
 * client render matches the server output and the real value is read right
 * after mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
