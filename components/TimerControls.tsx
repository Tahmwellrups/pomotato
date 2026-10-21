"use client";

import { useState } from "react";
import { useResolvedTokens } from "@/hooks/use-resolved-tokens";
import { useTimerStore } from "@/lib/timer/store";
import type { TimerStatus } from "@/lib/timer/types";
import HoldButton from "./HoldButton";
import { FaPause, FaPlay } from "react-icons/fa";
import { Button } from "./ui/button";
import { FaArrowsRotate } from "react-icons/fa6";

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
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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

  const primaryLabel =
    status === 'running' ? (
      <FaPause className="h-5 w-5" />
    ) : status === 'paused' ? (
      <FaPlay className="h-5 w-5" />
    ) : (
      <FaPlay className="h-5 w-5" />
    )

  const primaryName = status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Start'

  const handlePrimary = () => {
    if (status === "running") pause();
    else if (status === "paused") resume();
    else start();
  };

  return (
    <div className="relative flex gap-3">
      <Button
        type="button"
        aria-label={primaryName}
        onClick={handlePrimary}
        className={`min-h-11 rounded-lg px-4 py-2 bg-primary font-medium text-primary-foreground outline-none cursor-pointer hover:bg-[color-mix(in_srgb,var(--primary),var(--foreground)_30%)] ${buttonFocusRing}`}
      >
        {primaryLabel}
      </Button>
      <HoldButton
        holdTime={RESET_HOLD_MS}
        glow={false}
        wave={false}
        radius={8}
        ariaLabel="Reset"
        doneLabel="Reset"
        resetAfter={600}
        backgroundColor={resetColors.background}
        fillColor={resetColors.fill}
        textColor={resetColors.text}
        fillTextColor={resetColors.fillText}
        className="min-h-11 px-0.5 py-2 border border-border"
        onTap={() => setHintStatus(status)}
        onHold={() => {
          setHintStatus(null)
          reset()
        }}
      >
        <FaArrowsRotate className="h-5 w-5 m-0 p-0" />
      </HoldButton>
      <p
        role="status"
        aria-live="polite"
        className="font-comfortaa absolute inset-x-0 top-full mt-4 text-center text-sm text-muted-foreground"
      >
        {showHoldHint ? 'Press and hold Reset to confirm.' : ''}
      </p>
    </div>
  )
}
