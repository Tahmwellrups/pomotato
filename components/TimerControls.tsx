"use client";

import { useTimerStore } from "@/lib/timer/store";

const buttonFocusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700";

export function TimerControls() {
  const status = useTimerStore((state) => state.status);
  const start = useTimerStore((state) => state.start);
  const pause = useTimerStore((state) => state.pause);
  const resume = useTimerStore((state) => state.resume);
  const reset = useTimerStore((state) => state.reset);

  const primaryLabel = status === "running" ? "Pause" : status === "paused" ? "Resume" : "Start";

  const handlePrimary = () => {
    if (status === "running") pause();
    else if (status === "paused") resume();
    else start();
  };

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={handlePrimary}
        className={`min-h-11 rounded-lg bg-amber-700 px-6 py-3 font-medium text-white outline-none hover:bg-amber-800 ${buttonFocusRing}`}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={reset}
        className={`min-h-11 rounded-lg border border-stone-300 bg-white px-6 py-3 font-medium text-stone-700 outline-none hover:border-stone-400 ${buttonFocusRing}`}
      >
        Reset
      </button>
    </div>
  );
}
