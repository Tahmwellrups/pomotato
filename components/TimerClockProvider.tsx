"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useHydrateTimerStore } from "@/hooks/use-hydrate-timer-store";
import { useTimerClock } from "@/hooks/use-timer-clock";
import { chime } from "@/lib/audio/chime";
import { usePreferencesStore } from "@/lib/preferences";
import { useTimerStore } from "@/lib/timer/store";

const TimerNowContext = createContext<number | null>(null);

/**
 * The wall-clock reading the timer display renders from. Falls back to a
 * single non-ticking read when no provider is mounted.
 */
export function useTimerNow(): number {
  const now = useContext(TimerNowContext);
  const [fallback] = useState(() => Date.now());
  return now ?? fallback;
}

/**
 * Mounted once in the root layout, so it survives client-side navigation. It
 * is the one owner of the timer's clock and of completion: it rehydrates the
 * store, reads the clock (the only interval, in `useTimerClock`), calls
 * `completeIfExpired` and fires the session-end chime on every route. The
 * timer page only reads `now` from here for its display.
 */
export function TimerClockProvider({ children }: { children: ReactNode }) {
  const hasHydrated = useHydrateTimerStore();
  const status = useTimerStore((state) => state.status);
  const endTimestamp = useTimerStore((state) => state.endTimestamp);
  const completeIfExpired = useTimerStore((state) => state.completeIfExpired);
  const lastAdvance = useTimerStore((state) => state.lastAdvance);

  const now = useTimerClock(status === "running");

  // The only place a tick can change timer state: flipping past the stored end
  // timestamp. This never decrements a counter.
  useEffect(() => {
    if (status === "running" && endTimestamp !== null && now >= endTimestamp) {
      completeIfExpired(now);
    }
  }, [status, endTimestamp, now, completeIfExpired]);

  // The chime is keyed on the completed run's end timestamp, as the polite
  // announcement is, and inherits its reload behaviour: rehydration clears
  // `lastAdvance`, so a refresh, or a refocus after this advance already
  // chimed, plays nothing. The ref lives here, in a component the layout keeps
  // mounted, so a route change cannot reset it. The call is synchronous, with
  // no await between the observed advance and the sound being scheduled.
  const chimedAdvanceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hasHydrated || lastAdvance === null) return;
    if (chimedAdvanceRef.current === lastAdvance.endedAt) return;
    chimedAdvanceRef.current = lastAdvance.endedAt;
    const { chimeEnabled, chimeLevel } = usePreferencesStore.getState();
    if (!chimeEnabled) return;
    try {
      void Promise.resolve(chime.play(chimeLevel)).catch((error: unknown) => {
        console.warn("Pomotato could not play the session chime.", error);
      });
    } catch (error) {
      console.warn("Pomotato could not play the session chime.", error);
    }
  }, [lastAdvance, hasHydrated]);

  return <TimerNowContext.Provider value={now}>{children}</TimerNowContext.Provider>;
}
