"use client";

import { useTimerStore } from "@/lib/timer/store";
import { CYCLE_LENGTH } from "@/lib/timer/constants";
import { MODE_LABELS } from "@/lib/timer/labels";
import type { TimerMode, TimerStatus } from "@/lib/timer/types";

// The four-dot cycle read-out. It is a status display, not a control: nothing
// here is focusable or clickable, the dots are aria-hidden, and one visually
// hidden sentence carries the position for assistive tech.
//
// Four painted treatments, and no fifth (styles live in app/globals.css under
// .cycle-dot, keyed on data-treatment):
//   done            solid          a Focus run of this cycle is finished
//   pending         muted, smaller a Focus run still to come
//   active-running  pulsing        the Focus run is counting right now
//   active-idle     outlined ring  the Focus run is the current one but not counting
//
// Purpose of the motion (R-19, R-31): the pulse is the only moving thing in
// the cluster and it marks one real, transient state, a Focus run counting
// down. It runs only while status is "running", so an idle or paused page
// animates nothing. Under prefers-reduced-motion it collapses into the ring,
// not into nothing, so a reduced-motion user still sees which run is current.
// There is no glow, and no colour beyond the two the pulse moves between and
// the ring's stroke.
//
// A break mode paints no active dot: the dots describe the cycle, and during a
// break the next Focus run is not the current one. cyclePosition 4 (all four
// done) also has no active dot, including a hand-picked Focus while the long
// break is still owed, where the fifth dot would not exist.
export type DotTreatment = "done" | "pending" | "active-running" | "active-idle";

function dotTreatment(
  index: number,
  position: number,
  mode: TimerMode,
  status: TimerStatus
): DotTreatment {
  if (index < position) return "done";
  if (index === position && mode === "focus") {
    return status === "running" ? "active-running" : "active-idle";
  }
  return "pending";
}

function positionSentence(mode: TimerMode, position: number): string {
  if (mode === "focus") {
    return position >= CYCLE_LENGTH
      ? `Focus, ${CYCLE_LENGTH} of ${CYCLE_LENGTH} runs done, long break owed`
      : `Focus ${position + 1} of ${CYCLE_LENGTH}`;
  }
  return `${MODE_LABELS[mode]}, ${position} of ${CYCLE_LENGTH} focus runs done`;
}

export function CycleDots() {
  const mode = useTimerStore((state) => state.mode);
  const status = useTimerStore((state) => state.status);
  const position = useTimerStore((state) => state.cyclePosition);

  return (
    <div className="flex justify-center">
      <div aria-hidden="true" className="flex h-4 items-center gap-3">
        {Array.from({ length: CYCLE_LENGTH }, (_, index) => (
          <span
            key={index}
            className="cycle-dot"
            data-treatment={dotTreatment(index, position, mode, status)}
          />
        ))}
      </div>
      <p className="sr-only">{positionSentence(mode, position)}</p>
    </div>
  );
}
