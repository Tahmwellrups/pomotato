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
import { FocusLengthInput } from "./FocusLengthInput";
import { CycleDots } from "./CycleDots";
import { TimerControls } from "./TimerControls";

const ANNOUNCEMENT_CLEAR_MS = 10_000;

export function PomotatoTimer() {
  const hasHydrated = useHydrateTimerStore();

  const mode = useTimerStore((state) => state.mode);
  const status = useTimerStore((state) => state.status);
  const focusMinutes = useTimerStore((state) => state.focusMinutes);
  const endTimestamp = useTimerStore((state) => state.endTimestamp);
  const pausedRemainingMs = useTimerStore((state) => state.pausedRemainingMs);
  const completeIfExpired = useTimerStore((state) => state.completeIfExpired);
  const lastAdvance = useTimerStore((state) => state.lastAdvance);

  const now = useTimerClock(status === "running");
  const fullMs = fullDurationMs(mode, focusMinutes);
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
    }
    prevStatusRef.current = status;
  }, [status, mode, hasHydrated]);

  // Auto-advance leaves "complete" within the same update, so the status
  // transition above never sees it. The store's lastAdvance carries both halves
  // ("Focus complete. Short break started."), keyed on the completed run's end
  // timestamp, and is cleared after rehydration so a reload announces nothing.
  // It is not wiped when the status changes. The text is emptied after a pause
  // so the next advance, which often reads the same words, is announced again
  // instead of being a no-op text change in the live region.
  const announcedAdvanceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hasHydrated || lastAdvance === null) return;
    if (announcedAdvanceRef.current === lastAdvance.endedAt) return;
    announcedAdvanceRef.current = lastAdvance.endedAt;
    const { completedMode, nextMode, started } = lastAdvance;
    setAnnouncement(
      `${MODE_LABELS[completedMode]} complete. ${MODE_LABELS[nextMode]} ${started ? "started" : "ready"}.`
    );
    const clear = window.setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_CLEAR_MS);
    return () => window.clearTimeout(clear);
  }, [lastAdvance, hasHydrated]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <div className="flex w-full flex-col gap-1">
        <ModeSelector />
        <CycleDots />
      </div>
      <TimerDisplay
        formatted={formatRemaining(remainingMs)}
        remainingMs={remainingMs}
        fullMs={fullMs}
        hasHydrated={hasHydrated}
      />
      <FocusLengthInput />
      <TimerControls />
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
