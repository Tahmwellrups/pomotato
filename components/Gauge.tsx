"use client";

import { useCallback, useRef } from "react";
import type { GaugeStylePreference } from "@/lib/preferences";
import { TimerGauge } from "./TimerGauge";

/**
 * Shared sizes for the digits. The timer keeps the default; a preview card
 * passes a smaller one.
 */
export const GAUGE_DIGITS_SIZE = "text-6xl sm:text-7xl lg:text-8xl";

const DIGITS_BASE = "relative font-space-grotesk font-extrabold tabular-nums";

// In-glyph style. The digits are always a solid, painted text layer in the
// foreground colour. The two-tone fill is a separate ::after overlay that repeats
// the time through attr() on an empty aria-hidden span, so assistive tech hears
// the time once, clips a hard two-stop gradient to its own glyphs and sits on top.
// Lose the background image and only the overlay disappears; the solid digits
// stay. The overlay is generated content, so the readout is still one selectable
// text node. The gauge writes --gauge-surface / --gauge-lean on the frame, and
// the stop maps that level onto the ink (the ink sits 14%..84% of the line box).
// The stop is 14 + 0.7 * level, plus up to 4 more over the last 10 levels, so
// level 100 clears the ink top and goes one flat colour. Under forced colours
// the overlay is dropped.
const OVERLAY = [
  "after:pointer-events-none after:absolute after:inset-0 after:select-none after:content-[attr(data-time)] after:text-transparent",
  "supports-[background-clip:text]:after:[-webkit-background-clip:text] supports-[background-clip:text]:after:[background-clip:text]",
  `supports-[background-clip:text]:after:[background-image:linear-gradient(calc(var(--gauge-lean,0deg)_*_-1),var(--accent-foreground)_calc(14%_+_var(--gauge-surface,100)_*_0.7%_+_max(0,var(--gauge-surface,100)_-_90)_*_0.4%),var(--muted-foreground)_calc(14%_+_var(--gauge-surface,100)_*_0.7%_+_max(0,var(--gauge-surface,100)_-_90)_*_0.4%))]`,
  "forced-colors:hidden",
].join(" ");

/** Fraction of the session that is left, 0 to 1. 1 at the start of a session, draining to 0. */
export type GaugeProgress = number;

export interface GaugeProps {
  /** `null` renders the digits alone: no layer, no overlay, no wrapper. The off state. */
  variant: GaugeStylePreference | null;
  /** Fraction remaining, 0 to 1. The same convention the live timer uses: 1 is a full pool. */
  progress: GaugeProgress;
  /** The readout to paint. The timer passes mm:ss; a preview passes fixed sample digits. */
  digits: string;
  /** False until the data behind `progress` is trustworthy, so the gauge never animates down from a stale level. Default true. */
  ready?: boolean;
  /** False for a still frame at `progress` (the settings previews). The live timer leaves it true. */
  animate?: boolean;
  /** Overrides `data-testid` on the gauge layer. */
  testId?: string;
  /** Sizing of the frame the gauge fills. */
  frameClassName?: string;
  /** Font size of the digits. */
  digitsSizeClassName?: string;
}

/**
 * The one presentational gauge: a variant and a 0-1 progress value, nothing
 * about timers. The live timer and the settings previews both render this, so a
 * preview cannot drift from what the timer paints. It owns the digits layer
 * because the `glyph` style paints the digits themselves.
 */
export function Gauge({
  variant,
  progress,
  digits,
  ready = true,
  animate = true,
  testId,
  frameClassName = "",
  digitsSizeClassName = GAUGE_DIGITS_SIZE,
}: GaugeProps) {
  const frame = useRef<HTMLDivElement>(null);

  // glyph only: the spring in the vessel renderer reports its surface and lean,
  // and the digits' gradient reads them as custom properties on the frame.
  const onPaint = useCallback((surface: number, leanDeg: number) => {
    const el = frame.current;
    if (!el) return;
    el.style.setProperty("--gauge-surface", surface.toFixed(3));
    el.style.setProperty("--gauge-lean", `${leanDeg.toFixed(3)}deg`);
  }, []);

  const glyph = variant === "glyph" && ready;
  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;

  return (
    <div ref={frame} className={`relative ${frameClassName}`}>
      {variant === null ? null : (
        <TimerGauge
          remainingMs={clamped}
          fullMs={1}
          ready={ready}
          style={variant}
          onPaint={variant === "glyph" ? onPaint : undefined}
          animate={animate}
          testId={testId}
        />
      )}
      <p className={`${DIGITS_BASE} ${digitsSizeClassName} text-foreground`}>
        {digits}
        {glyph ? <span aria-hidden="true" data-time={digits} className={OVERLAY} /> : null}
      </p>
    </div>
  );
}
