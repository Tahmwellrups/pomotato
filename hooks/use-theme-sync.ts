"use client";

import { useLayoutEffect } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { applyResolvedTheme, resolveTheme } from "@/lib/preferences/schema";
import { usePreferencesStore } from "@/lib/preferences/store";

const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Keeps `<html class="dark">` in step with the stored preference and the OS.
 *
 * The boot script has already painted the right class before first paint, so
 * nothing is applied until the store has rehydrated: until then the store holds
 * the default `system`, which can contradict a stored `dark`.
 *
 * `osPrefersDark` only re-runs the effect when the OS flips. The value the
 * effect resolves with is read live from matchMedia, because the hook's own
 * value is the server snapshot (`false`) during the hydration commit and
 * resolving with it could paint `light` for one frame on a dark OS.
 */
export function useThemeSync(): void {
  const theme = usePreferencesStore((state) => state.theme);
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const osPrefersDark = useMediaQuery(OS_DARK_QUERY);

  useLayoutEffect(() => {
    void usePreferencesStore.persist.rehydrate();
  }, []);

  useLayoutEffect(() => {
    if (!hasHydrated) return;
    const liveOsPrefersDark = window.matchMedia(OS_DARK_QUERY).matches;
    applyResolvedTheme(document.documentElement, resolveTheme(theme, liveOsPrefersDark));
  }, [theme, hasHydrated, osPrefersDark]);
}
