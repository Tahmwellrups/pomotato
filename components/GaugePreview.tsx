import type { GaugeStylePreference } from "@/lib/preferences";
import { Gauge } from "./Gauge";

/** 60% of a session left. The same convention as the live timer: 1 is full, 0 is empty. */
export const PREVIEW_PROGRESS = 0.6;
/** 60% of a 25:00 Focus session, so the digits and the level agree. */
export const PREVIEW_DIGITS = "15:00";

/**
 * A still frame of the real gauge at a fixed sample. It is the same `Gauge` the
 * timer renders, handed fixed props, so there is no second implementation of
 * either style to keep in step. Nothing here reads the timer: no store, no hook,
 * no clock. Hidden from assistive tech; the option's label carries the name.
 */
export function GaugePreview({ variant }: { variant: GaugeStylePreference }) {
  return (
    <span aria-hidden="true" className="block">
      <Gauge
        variant={variant}
        progress={PREVIEW_PROGRESS}
        digits={PREVIEW_DIGITS}
        animate={false}
        testId={`gauge-preview-${variant}`}
        frameClassName="flex h-28 w-full items-center justify-center overflow-clip rounded-lg"
        digitsSizeClassName="text-5xl"
      />
    </span>
  );
}
