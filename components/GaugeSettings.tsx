"use client";

import { GAUGE_STYLE_VALUES, DEFAULT_GAUGE_STYLE, usePreferencesStore, type GaugeStylePreference } from "@/lib/preferences";
import { GaugePreview } from "./GaugePreview";

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

const FOCUS_RING =
  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring";

// The switch is a native checkbox with role="switch". On and off differ by the
// thumb's side and by the words On / Off, so colour is never the only cue, and
// under forced colours the track and thumb keep their borders.
const TRACK =
  "relative inline-block h-7 w-12 shrink-0 rounded-full border-2 border-control-border bg-muted transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>span]:translate-x-5 forced-colors:peer-checked:bg-[Highlight] motion-reduce:transition-none";
const THUMB =
  "absolute left-0.5 top-0.5 size-5 rounded-full border-2 border-control-border bg-background transition-transform motion-reduce:transition-none";

// Native radios in a fieldset. Checked is carried by a check mark, a bold name
// and a 2px primary edge against the 1px control edge, never by fill alone.
// Forced colours repaints every border in one system colour and drops
// box-shadow, so there the checked card gets a 3px border instead (padding
// shrinks by the same 2px, so nothing moves).
export function GaugeSettings() {
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const storedStyle = usePreferencesStore((state) => state.gaugeStyle);
  const storedEnabled = usePreferencesStore((state) => state.gaugeEnabled);
  const setGaugeStyle = usePreferencesStore((state) => state.setGaugeStyle);
  const setGaugeEnabled = usePreferencesStore((state) => state.setGaugeEnabled);
  // Until rehydration the store holds the defaults, which may not be what is stored.
  const gaugeStyle = hasHydrated ? storedStyle : DEFAULT_GAUGE_STYLE;
  const enabled = hasHydrated ? storedEnabled : false;

  return (
    <section aria-labelledby="gauge-heading" className="flex flex-col gap-3">
      <h2 id="gauge-heading" className="mb-1 font-heading text-lg font-semibold">
        Timer gauge
      </h2>
      <label className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-base font-medium sm:max-w-md">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={enabled}
          aria-checked={enabled}
          onChange={(event) => setGaugeEnabled(event.target.checked)}
          // A native checkbox toggles on Space only; a switch also takes Enter.
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            setGaugeEnabled(!enabled);
          }}
        />
        <span aria-hidden="true" className={`${TRACK} ${FOCUS_RING}`}>
          <span className={THUMB} />
        </span>
        <span className="flex-1">Show timer gauge</span>
        <span aria-hidden="true" className="text-sm text-secondary-foreground tabular-nums">
          {enabled ? "On" : "Off"}
        </span>
      </label>

      {/* aria-disabled, not disabled: native disabled radios leave the tab order,
          and this line could then never be reached by keyboard. */}
      <fieldset
        className="flex min-w-0 flex-col gap-3"
        aria-describedby={enabled ? undefined : "gauge-style-hint"}
      >
        <legend className="text-sm font-medium text-secondary-foreground">Gauge style</legend>
        {enabled ? null : (
          <p id="gauge-style-hint" className="text-sm text-secondary-foreground">
            Turn on the gauge to choose a style.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GAUGE_STYLE_VALUES.map((value) => {
            const checked = gaugeStyle === value;
            // Presentation only: while off, the checked radio stays checked for
            // keyboard and assistive tech, but no card wears the selected look.
            const marked = checked && enabled;
            const nameId = `gauge-style-${value}-name`;
            const detailId = `gauge-style-${value}-detail`;
            return (
              <label key={value} className={`group flex ${enabled ? "cursor-pointer" : "cursor-default"}`}>
                <input
                  type="radio"
                  name="gauge-style"
                  value={value}
                  checked={checked}
                  aria-disabled={enabled ? undefined : true}
                  aria-labelledby={nameId}
                  aria-describedby={enabled ? detailId : `${detailId} gauge-style-hint`}
                  onChange={() => {
                    if (enabled) setGaugeStyle(value);
                  }}
                  // A controlled native radio re-checks itself when its click is
                  // cancelled, and arrows are what move a radio group's selection,
                  // so both are stopped while off. Tab still lands on the checked one.
                  onClick={(event) => {
                    if (!enabled) event.preventDefault();
                  }}
                  onKeyDown={(event) => {
                    if (!enabled && event.key.startsWith("Arrow")) event.preventDefault();
                  }}
                  className="peer sr-only"
                />
                <span
                  className={`flex w-full flex-col gap-3 rounded-lg border border-control-border p-3 transition-colors ${enabled ? "peer-checked:border-primary peer-checked:shadow-[inset_0_0_0_1px_var(--primary)] peer-checked:forced-colors:border-[3px] peer-checked:forced-colors:p-[0.6875rem]" : ""} motion-reduce:transition-none ${FOCUS_RING}`}
                >
                  <span className={enabled ? "block" : "block opacity-50"}>
                    <GaugePreview variant={value} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span id={nameId} className={marked ? "font-bold" : "font-medium"}>
                      {GAUGE_COPY[value].name}
                    </span>
                    {marked ? (
                      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 text-primary forced-colors:text-[Highlight]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3.5 3.5L13 4.5" />
                      </svg>
                    ) : null}
                  </span>
                  <span id={detailId} className="text-sm text-secondary-foreground">
                    {GAUGE_COPY[value].detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
