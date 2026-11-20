"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useResolvedTokens } from "@/hooks/use-resolved-tokens";
import type { GaugeStylePreference } from "@/lib/preferences";
import SloshGauge from "./SloshGauge";

const GAUGE_TOKENS = {
  liquid: "--gauge-liquid",
  glass: "--popover",
} as const;

interface TimerGaugeProps {
  remainingMs: number;
  fullMs: number;
  /** False until the persisted timer has loaded, so the gauge never animates down from a stale full level. */
  ready: boolean;
  /** `glyph` keeps the spring but paints nothing itself; the digits show the level (see onPaint). */
  style?: GaugeStylePreference;
  /** Spring surface (0-100) and lean (deg) after each paint. Only used by `glyph`. */
  onPaint?: (surface: number, leanDeg: number) => void;
  /**
   * False parks the spring: the level is painted where it is told to be, with no
   * slosh and no ease. Used by the settings previews. The user's reduced-motion
   * setting forces the same behaviour on the live gauge.
   */
  animate?: boolean;
  /** Lets a second surface (the settings previews) carry its own hook for tests without matching the timer's. */
  testId?: string;
}

/** Remaining time as a 0-100 level, from the same remainingMs/fullMs that produce mm:ss. */
export function gaugeLevel(remainingMs: number, fullMs: number): number {
  if (fullMs <= 0) return 0;
  return Math.min(100, Math.max(0, (remainingMs / fullMs) * 100));
}

/**
 * Decorative vessel that sits behind the mm:ss readout. Hidden from assistive
 * tech because mm:ss already says the same thing.
 * `data-gauge-level` is the rounded level QA reads; `data-liquid-color` and
 * `data-glass-color` are the colours currently resolved from the tokens.
 */
export function TimerGauge({
  remainingMs,
  fullMs,
  ready,
  style = "vessel",
  onPaint,
  animate = true,
  testId = "timer-gauge",
}: TimerGaugeProps) {
  const colors = useResolvedTokens(GAUGE_TOKENS);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // Viscosity 0 is the vendored gauge's own "no spring" setting: the surface
  // sits on the level the same frame it changes. Tilt and splash go to 0 with it.
  const still = !animate || reduceMotion;
  const level = gaugeLevel(remainingMs, fullMs);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-testid={testId}
      data-gauge-ready={ready ? "true" : "false"}
      data-gauge-style={style}
      data-gauge-level={ready ? Math.round(level) : undefined}
      data-liquid-color={colors.liquid}
      data-glass-color={colors.glass}
    >
      {ready ? (
        <SloshGauge
          value={level}
          interactive={false}
          liquidColor={style === "glyph" ? "transparent" : colors.liquid}
          glassColor={style === "glyph" ? "transparent" : colors.glass}
          radius={200}
          ticks={0}
          viscosity={still ? 0 : undefined}
          tilt={still ? 0 : 0.2}
          splash={still ? 0 : 0.2}
          ariaLabel="Time remaining"
          className={style === "glyph" ? "" : "border border-border"}
          onPaint={style === "glyph" ? onPaint : undefined}
        />
      ) : null}
    </div>
  );
}
