"use client";

import { useCallback, useRef } from "react";
import { usePreferencesStore } from "@/lib/preferences";
import { TimerGauge } from "./TimerGauge";

interface TimerDisplayProps {
  formatted: string;
  remainingMs: number;
  fullMs: number;
  hasHydrated: boolean;
}

const DIGITS_BASE =
  "relative font-space-grotesk text-6xl font-extrabold tabular-nums sm:text-7xl lg:text-8xl";

// In-glyph style. The digits are always a solid, painted text layer in the
// foreground colour. The two-tone fill is a separate ::after overlay that repeats
// the time through attr() on an empty aria-hidden span, so assistive tech hears
// the time once, clips a hard two-stop gradient to its own glyphs and sits on top. Lose the background image and only the overlay disappears; the
// solid digits stay. The overlay is generated content, so the readout is still
// one selectable text node. The spring writes --gauge-surface / --gauge-lean on
// the frame, and the stop maps that level onto the ink (the ink sits 14%..84% of
// the line box). The stop is 14 + 0.7 * level, plus up to 4 more over the last
// 10 levels, so level 100 clears the ink top and goes one flat colour.
// Under forced colours the overlay is dropped.
const DIGITS_GLYPH = "text-foreground";
const OVERLAY = [
  "after:pointer-events-none after:absolute after:inset-0 after:select-none after:content-[attr(data-time)] after:text-transparent",
  "supports-[background-clip:text]:after:[-webkit-background-clip:text] supports-[background-clip:text]:after:[background-clip:text]",
  `supports-[background-clip:text]:after:[background-image:linear-gradient(calc(var(--gauge-lean,0deg)_*_-1),var(--accent-foreground)_calc(14%_+_var(--gauge-surface,100)_*_0.7%_+_max(0,var(--gauge-surface,100)_-_90)_*_0.4%),var(--muted-foreground)_calc(14%_+_var(--gauge-surface,100)_*_0.7%_+_max(0,var(--gauge-surface,100)_-_90)_*_0.4%))]`,
  "forced-colors:hidden",
].join(" ");

export function TimerDisplay({
  formatted,
  remainingMs,
  fullMs,
  hasHydrated,
}: TimerDisplayProps) {
  const prefsHydrated = usePreferencesStore((state) => state.hasHydrated);
  const storedStyle = usePreferencesStore((state) => state.gaugeStyle);
  // The stored value is only trusted once rehydrated, and the gauge itself only
  // mounts once the timer store has, so a glyph reader never sees a vessel frame.
  const style = prefsHydrated ? storedStyle : "vessel";
  const frame = useRef<HTMLDivElement>(null);

  const onPaint = useCallback((surface: number, leanDeg: number) => {
    const el = frame.current;
    if (!el) return;
    el.style.setProperty("--gauge-surface", surface.toFixed(3));
    el.style.setProperty("--gauge-lean", `${leanDeg.toFixed(3)}deg`);
  }, []);

  const glyph = style === "glyph" && hasHydrated;

  return (
    <div
      ref={frame}
      className="relative flex min-h-40 w-full items-center justify-center px-6 py-4 sm:min-h-44 lg:min-h-1/2"
    >
      <TimerGauge
        remainingMs={remainingMs}
        fullMs={fullMs}
        ready={hasHydrated}
        style={style}
        onPaint={onPaint}
      />
      <p
        className={
          glyph
            ? `${DIGITS_BASE} ${DIGITS_GLYPH}`
            : `${DIGITS_BASE} text-foreground`
        }
      >
        {formatted}
        {glyph ? (
          <span aria-hidden="true" data-time={formatted} className={OVERLAY} />
        ) : null}
      </p>
    </div>
  );
}
