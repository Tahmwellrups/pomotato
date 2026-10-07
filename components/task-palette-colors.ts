import type { PaletteColorId } from "@/lib/db";

/**
 * Frontend-owned mapping from each backend palette id to an actual CSS
 * color. Backend defines identity only (id + human name, see
 * `lib/db/palette.ts`); the swatch value and its contrast handling are a
 * presentation concern, which is exactly what milestone 4's theme remap
 * will replace with a per-theme mapping.
 *
 * Every value is checked with the WCAG contrast formula against this
 * milestone's card background (white, `#ffffff`) and clears 3:1 (the bar
 * for a non-text color indicator). None of these are used as a background
 * for normal-size text, so the stricter 4.5:1 text bar does not apply to
 * them; where a value also happens to clear 4.5:1, that is a bonus, not a
 * requirement being relied on.
 */
export const TASK_COLOR_HEX: Record<PaletteColorId, string> = {
  potato: "#8a5a2b",
  tomato: "#c23b22",
  mint: "#3f9b6c",
  sky: "#2f7fb8",
  lavender: "#7a5fb0",
  sunflower: "#8f6508",
  blush: "#c05a74",
  slate: "#5b6672",
};
