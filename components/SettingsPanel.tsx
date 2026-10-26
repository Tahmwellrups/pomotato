"use client";

import Link from "next/link";
import { GAUGE_STYLE_VALUES, DEFAULT_GAUGE_STYLE, usePreferencesStore, type GaugeStylePreference } from "@/lib/preferences";

const linkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 outline-none transition-colors hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

// Each description says what the option does, not how it looks. The in-glyph
// one says out loud that it has no level at full and at empty (task 008, 20).
const GAUGE_COPY: Record<GaugeStylePreference, { name: string; detail: string }> = {
  vessel: {
    name: "Vessel",
    detail: "A pool drains behind the digits. The level shows the whole way down, including at full and at empty.",
  },
  glyph: {
    name: "In the digits",
    detail: "The digits themselves fill. At full and at empty they are one flat colour, so no level shows then.",
  },
};

// Native radios in a fieldset, the ThemeControl shape. Checked is carried by a
// bold name and a 2px primary edge against the 1px control edge, never by fill,
// so it holds in greyscale and forced colours. No lifted background: dark
// --popover has no headroom to raise.
export function SettingsPanel() {
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const storedStyle = usePreferencesStore((state) => state.gaugeStyle);
  const setGaugeStyle = usePreferencesStore((state) => state.setGaugeStyle);
  // Until rehydration the store holds the default, which may not be what is stored.
  const gaugeStyle = hasHydrated ? storedStyle : DEFAULT_GAUGE_STYLE;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col items-start gap-1">
        <Link href="/" className={linkClass}>
          Back to the timer
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-heading text-lg font-semibold">Timer gauge</legend>
        {GAUGE_STYLE_VALUES.map((value) => (
          <label key={value} className="block cursor-pointer">
            <input
              type="radio"
              name="gauge-style"
              value={value}
              checked={gaugeStyle === value}
              onChange={() => setGaugeStyle(value)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 flex-col gap-1 rounded-lg border border-control-border px-4 py-3 transition-colors peer-checked:border-primary peer-checked:shadow-[inset_0_0_0_1px_var(--primary)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring motion-reduce:transition-none">
              <span className={gaugeStyle === value ? "font-bold" : "font-medium"}>{GAUGE_COPY[value].name}</span>
              <span className="text-sm text-secondary-foreground">{GAUGE_COPY[value].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </main>
  );
}
