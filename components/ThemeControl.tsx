"use client";

import { THEME_VALUES, type ThemePreference } from "@/lib/preferences/schema";
import { usePreferencesStore } from "@/lib/preferences/store";
import { modeChipVariants } from "./ui/mode-chip";

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
              <span className={modeChipVariants({ checked })}>{THEME_LABELS[value]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
