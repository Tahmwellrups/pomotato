"use client";

import { usePreferencesStore } from "@/lib/preferences";
import { Gauge } from "./Gauge";
import { gaugeLevel } from "./TimerGauge";

interface TimerDisplayProps {
  formatted: string;
  remainingMs: number;
  fullMs: number;
  hasHydrated: boolean;
}

export function TimerDisplay({
  formatted,
  remainingMs,
  fullMs,
  hasHydrated,
}: TimerDisplayProps) {
  const prefsHydrated = usePreferencesStore((state) => state.hasHydrated);
  const storedStyle = usePreferencesStore((state) => state.gaugeStyle);
  const gaugeEnabled = usePreferencesStore((state) => state.gaugeEnabled);
  // Nothing about the gauge is trusted until the preferences have rehydrated:
  // the store holds defaults until then, and a seeded "off" must never flash on.
  // Off renders the same frame and digits with no gauge layer, so nothing shifts.
  const variant = prefsHydrated && gaugeEnabled ? storedStyle : null;

  return (
    <Gauge
      variant={variant}
      progress={gaugeLevel(remainingMs, fullMs) / 100}
      digits={formatted}
      // The gauge itself only mounts once the timer store has, so it never
      // animates down from a stale full level.
      ready={hasHydrated}
      frameClassName="flex min-h-32 w-full items-center justify-center px-6 py-4 sm:min-h-44 lg:min-h-1/2"
    />
  );
}
