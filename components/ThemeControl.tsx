"use client";

import { THEME_VALUES, type ThemePreference } from "@/lib/preferences/schema";
import { usePreferencesStore } from "@/lib/preferences/store";
import { cn } from "@/lib/utils";
import { modeChipVariants } from "./ui/mode-chip";

// The chip is 44 px tall inside a header whose content box is 40 px (the
// fieldset's -my-0.5 buys that), so the shared chip ring, drawn 2 px outside
// the chip, ended 1 px beyond the header's top or bottom edge, where its
// ground is the photograph and not the header. Measured 2.058:1 (dark, white
// image, 1280 px). Pulling the ring inside the chip box puts all of it on the
// header's own fill: its outer edge lands 3 px inside the chip edge, which is
// 1 px inside the header at 320 px, where the chip overhangs the header by 2 px
// (py-0 there) and 5 px inside it from sm up. The ring stays 2 px wide in
// --ring, so it is no smaller as an indicator, only moved. A header with more
// padding would have fixed 1280 and cost 8 px of the 320 x 568 vertical budget.
// The override is here and not in modeChipVariants because ModeSelector shares
// that chip and its ring sits on the frosted panel with room to spare.
const CHIP_RING_INSET = "peer-focus-visible:-outline-offset-5";

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

// Native radios in a fieldset, same shape as ModeSelector: arrow keys, the
// checked state and its announcement come from the browser, and the checked
// option is bold (modeChipVariants), so colour is not the only cue. The legend
// is screen-reader only, like ModeSelector's: the header has no room for a
// visible "Theme" at 320px, and the three option names say what the row does.
export function ThemeControl() {
  const storedTheme = usePreferencesStore((state) => state.theme);
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  // Before rehydration the store holds the default, which may not be what is
  // painted; show `system` rather than claim a stored value we have not read.
  const theme: ThemePreference = hasHydrated ? storedTheme : "system";

  return (
    <fieldset className="-my-0.5 -ml-2">
      <legend className="sr-only">Theme</legend>
      <div className="flex items-center gap-1">
        {THEME_VALUES.map((value) => {
          const checked = theme === value;
          return (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={checked}
                onChange={() => setTheme(value)}
                className="peer sr-only"
              />
              <span className={cn(modeChipVariants({ checked }), CHIP_RING_INSET)}>{THEME_LABELS[value]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
