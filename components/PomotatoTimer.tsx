"use client";

import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/lib/preferences";
import { useChimeSnapshot } from "@/hooks/use-chime";
import { useTimerStore } from "@/lib/timer/store";
import { useTimerNow } from "./TimerClockProvider";
import { fullDurationMs, formatRemaining, getRemainingMs } from "@/lib/timer/time";
import { MODE_LABELS } from "@/lib/timer/labels";
import type { TimerStatus } from "@/lib/timer/types";
import { ModeSelector } from "./ModeSelector";
import { TimerDisplay } from "./TimerDisplay";
import { CycleDots } from "./CycleDots";
import { TimerControls } from "./TimerControls";

const ANNOUNCEMENT_CLEAR_MS = 10_000;

export function PomotatoTimer() {
  const hasHydrated = useTimerStore((state) => state.hasHydrated);

  const mode = useTimerStore((state) => state.mode);
  const status = useTimerStore((state) => state.status);
  const plannedDurationMs = useTimerStore((state) => state.plannedDurationMs);
  const focusMinutes = usePreferencesStore((state) => state.focusMinutes);
  const shortBreakMinutes = usePreferencesStore((state) => state.shortBreakMinutes);
  const longBreakMinutes = usePreferencesStore((state) => state.longBreakMinutes);
  const { plays } = useChimeSnapshot();
  const endTimestamp = useTimerStore((state) => state.endTimestamp);
  const pausedRemainingMs = useTimerStore((state) => state.pausedRemainingMs);
  const lastAdvance = useTimerStore((state) => state.lastAdvance);

  const now = useTimerNow();
  // A run that is counting or frozen is measured against the length it started
  // with. Idle and complete follow the settings, so an edit shows up at once.
  const fullMs = plannedDurationMs ?? fullDurationMs(mode, { focusMinutes, shortBreakMinutes, longBreakMinutes });
  const remainingMs = getRemainingMs(status, endTimestamp, pausedRemainingMs, fullMs, now);

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
  //
  // The ref is seeded with the advance that already exists when this component
  // mounts, so only an advance observed while mounted is announced. One that
  // happened while the person was on another route is history by the time they
  // return. The chime (TimerClockProvider) is deliberately not like this: it
  // fires for an advance observed on any route, the announcement only for one
  // observed here. Do not "align" the two.
  const announcedAdvanceRef = useRef<number | null>(useTimerStore.getState().lastAdvance?.endedAt ?? null);
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
    <div data-chime-plays={plays} className="flex w-full max-w-md flex-col items-center gap-3 sm:gap-8">
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
      <TimerControls />
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
