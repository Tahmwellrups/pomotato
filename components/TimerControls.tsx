"use client";

import { useState } from "react";
import { useResolvedTokens } from "@/hooks/use-resolved-tokens";
import { useTimerStore } from "@/lib/timer/store";
import type { TimerStatus } from "@/lib/timer/types";
import HoldButton from "./HoldButton";

// Time the user must keep Reset pressed. Inside the 500-1200 ms window the
// task allows; long enough that a stray click cannot trigger it.
const RESET_HOLD_MS = 800;

const RESET_TOKENS = {
  background: "--popover",
  fill: "--primary",
  text: "--secondary-foreground",
  fillText: "--primary-foreground",
} as const;

const buttonFocusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700";

export function TimerControls() {
  const status = useTimerStore((state) => state.status);
  const start = useTimerStore((state) => state.start);
  const pause = useTimerStore((state) => state.pause);
  const resume = useTimerStore((state) => state.resume);
  const reset = useTimerStore((state) => state.reset);
  const resetColors = useResolvedTokens(RESET_TOKENS);
  // The hint belongs to the status the tap happened in, so it drops once the timer moves on.
  const [hintStatus, setHintStatus] = useState<TimerStatus | null>(null);
  const showHoldHint = hintStatus === status;

  const primaryLabel = status === "running" ? "Pause" : status === "paused" ? "Resume" : "Start";

  const handlePrimary = () => {
    if (status === "running") pause();
    else if (status === "paused") resume();
    else start();
  };

  return (
    <div className="relative flex gap-3">
      <button
        type="button"
        onClick={handlePrimary}
        className={`min-h-11 rounded-lg bg-amber-700 px-6 py-3 font-medium text-white outline-none hover:bg-amber-800 ${buttonFocusRing}`}
      >
        {primaryLabel}
      </button>
      <HoldButton
        holdTime={RESET_HOLD_MS}
        glow={false}
        wave={false}
        radius={8}
        doneLabel="Reset"
        resetAfter={600}
        backgroundColor={resetColors.background}
        fillColor={resetColors.fill}
        textColor={resetColors.text}
        fillTextColor={resetColors.fillText}
        className="min-h-11 border border-border"
        onTap={() => setHintStatus(status)}
        onHold={() => {
          setHintStatus(null);
          reset();
        }}
      >
        Reset
      </HoldButton>
      <p
        role="status"
        aria-live="polite"
        className="absolute inset-x-0 top-full mt-2 text-center text-sm text-muted-foreground"
      >
        {showHoldHint ? "Press and hold Reset to confirm." : ""}
      </p>
    </div>
  );
}
