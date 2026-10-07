"use client";

import { useTimerStore } from "@/lib/timer/store";
import { MODE_LABELS } from "@/lib/timer/labels";
import type { TimerMode } from "@/lib/timer/types";

const MODE_ORDER: TimerMode[] = ["focus", "shortBreak", "longBreak", "custom"];

export function ModeSelector() {
  const mode = useTimerStore((state) => state.mode);
  const selectMode = useTimerStore((state) => state.selectMode);

  return (
    <fieldset className="w-full">
      <legend className="mb-3 text-center text-sm font-medium text-stone-600">Timer mode</legend>
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
                className={[
                  "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm transition-colors",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-700",
                  checked
                    ? "border-amber-700 bg-amber-200 font-semibold text-amber-900"
                    : "border-stone-300 bg-white text-stone-700 hover:border-stone-400",
                ].join(" ")}
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
