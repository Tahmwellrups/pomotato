"use client";

import { useState } from "react";
import { usePreferencesStore } from "@/lib/preferences";
import { DURATION_LIMITS } from "@/lib/timer/constants";
import { useTimerStore } from "@/lib/timer/store";
import type { TimerMode } from "@/lib/timer/types";
import { DurationField } from "./DurationField";

const SESSION_NOUN: Record<TimerMode, string> = {
  focus: "Focus session",
  shortBreak: "short break",
  longBreak: "long break",
};

const buttonClass =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center rounded-lg border border-control-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

const { focusMinutes: focusLimits, shortBreakMinutes: shortLimits, longBreakMinutes: longLimits } = DURATION_LIMITS;

export function SessionLengths() {
  const mode = useTimerStore((state) => state.mode);
  const status = useTimerStore((state) => state.status);
  const resetDurations = usePreferencesStore((state) => state.resetDurations);
  // Bumped by Reset to defaults. A new key remounts the fields, which clears
  // text and errors even when the stored value was already the default.
  const [resetCount, setResetCount] = useState(0);

  const sessionIsLive = status === "running" || status === "paused";

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-heading text-lg font-semibold">Session lengths</legend>
      <p className="text-sm text-secondary-foreground">
        Whole minutes. Focus runs {focusLimits.min} to {focusLimits.max}, short break {shortLimits.min} to{" "}
        {shortLimits.max}, long break {longLimits.min} to {longLimits.max}.
      </p>
      {sessionIsLive ? (
        <p className="text-sm text-secondary-foreground">
          Your {SESSION_NOUN[mode]} is {status === "running" ? "running" : "paused"} and keeps the length it started with.
          A new length applies from the next session of that type.
        </p>
      ) : null}
      <div key={resetCount} className="flex flex-col gap-3 sm:max-w-xs">
        <DurationField durationKey="focusMinutes" id="focus-length" label="Focus length (minutes)" />
        <DurationField durationKey="shortBreakMinutes" id="short-break-length" label="Short break length (minutes)" />
        <DurationField durationKey="longBreakMinutes" id="long-break-length" label="Long break length (minutes)" />
      </div>
      <div>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            resetDurations();
            setResetCount((count) => count + 1);
          }}
        >
          Reset to defaults
        </button>
      </div>
    </fieldset>
  );
}
