"use client";

import { useThemeSync } from "@/hooks/use-theme-sync";

/** Renders nothing. Mounted once in the root layout so /stats follows the theme too. */
export function ThemeSync() {
  useThemeSync();
  return null;
}
