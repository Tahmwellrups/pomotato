import type { PaletteColorId } from "@/lib/db";
import { TASK_COLOR_HEX } from "./task-palette-colors";

interface TaskColorDotProps {
  colorId: PaletteColorId;
  className?: string;
}

/**
 * A plain, decorative color swatch. Never carries text on top of it, so the
 * 3:1 non-text contrast bar against the surrounding card is what applies,
 * not the 4.5:1 text bar. Always paired with a text name somewhere in the
 * surrounding markup (a form label or a visually-hidden span); this element
 * is `aria-hidden` and never the only way the color is conveyed.
 */
export function TaskColorDot({ colorId, className }: TaskColorDotProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full border border-black/10 ${className ?? "h-3.5 w-3.5"}`}
      style={{ backgroundColor: TASK_COLOR_HEX[colorId] }}
    />
  );
}
