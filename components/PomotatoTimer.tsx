"use client";

import { useEffect, useRef, useState } from "react";
import { useTimerStore } from "@/lib/timer/store";
import { useHydrateTimerStore } from "@/hooks/use-hydrate-timer-store";
import { useTimerClock } from "@/hooks/use-timer-clock";
import { fullDurationMs, formatRemaining, getRemainingMs } from "@/lib/timer/time";
import { MODE_LABELS } from "@/lib/timer/labels";
import type { TimerStatus } from "@/lib/timer/types";
import { ModeSelector } from "./ModeSelector";
import { TimerDisplay } from "./TimerDisplay";
import { CustomDurationInput } from "./CustomDurationInput";
import { TimerControls } from "./TimerControls";

export function PomotatoTimer() {
  const hasHydrated = useHydrateTimerStore();

  const mode = useTimerStore((state) => state.mode);
  const status = useTimerStore((state) => state.status);
  const customMinutes = useTimerStore((state) => state.customMinutes);
  const endTimestamp = useTimerStore((state) => state.endTimestamp);
  const pausedRemainingMs = useTimerStore((state) => state.pausedRemainingMs);
  const completeIfExpired = useTimerStore((state) => state.completeIfExpired);

  const now = useTimerClock(status === "running");
  const fullMs = fullDurationMs(mode, customMinutes);
  const remainingMs = getRemainingMs(status, endTimestamp, pausedRemainingMs, fullMs, now);

  // The only place a tick can change timer state: flipping to "complete" once
  // the stored end timestamp has passed. This never decrements a counter.
  useEffect(() => {
    if (status === "running" && remainingMs <= 0) {
      completeIfExpired(now);
    }
  }, [status, remainingMs, now, completeIfExpired]);

  // Announce completion once, through a polite live region, without
  // re-announcing on every reload that happens to already be complete.
  // `prevStatusRef` starts `null` and only gets a real value once hydration
  // has finished (see use-hydrate-timer-store.ts): before that, `status` is
  // always the pre-hydration default ("idle"), so comparing against it would
  // read a persisted-"complete" reload as a fresh idle->complete transition
  // and announce on every load. The first post-hydration run instead just
  // seeds the baseline with no announcement; only a transition observed
  // *after* that baseline is a genuine in-session completion.
  const prevStatusRef = useRef<TimerStatus | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!hasHydrated) return;
    const previous = prevStatusRef.current;
    if (previous === null) {
      prevStatusRef.current = status;
      return;
    }
    if (previous !== "complete" && status === "complete") {
      setAnnouncement(`${MODE_LABELS[mode]} complete`);
    } else if (previous === "complete" && status !== "complete") {
      setAnnouncement("");
    }
    prevStatusRef.current = status;
  }, [status, mode, hasHydrated]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <ModeSelector />
      <TimerDisplay modeLabel={MODE_LABELS[mode]} formatted={formatRemaining(remainingMs)} status={status} />
      {mode === "custom" ? <CustomDurationInput /> : null}
      <TimerControls />
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
