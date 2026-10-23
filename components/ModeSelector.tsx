"use client";

import { useTimerStore } from "@/lib/timer/store";
import { MODE_LABELS } from "@/lib/timer/labels";
import type { TimerMode } from "@/lib/timer/types";
import { modeChipVariants } from "./ui/mode-chip";

const MODE_ORDER: TimerMode[] = ["focus", "shortBreak", "longBreak", "custom"];

export function ModeSelector() {
  const mode = useTimerStore((state) => state.mode);
  const selectMode = useTimerStore((state) => state.selectMode);

  return (
    <fieldset className="w-full">
      <legend className="sr-only">Timer mode</legend>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {MODE_ORDER.map((value) => {
          const checked = mode === value;
          return (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="timer-mode"
                value={value}
                checked={checked}
                onChange={() => selectMode(value)}
                className="peer sr-only"
              />
              <span
                className={modeChipVariants({ checked })}
              >
                {MODE_LABELS[value]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
