"use client";

import { useEffect, useState } from "react";

/**
 * Supplies the current wall-clock time (epoch ms) and refreshes it:
 * - on an interval while `isRunning`, so the display updates at least once
 *   a second (this only drives re-renders; remaining time is always
 *   recomputed from a stored end timestamp, never decremented here)
 * - on `visibilitychange` and `focus`, so backgrounding/sleep/wake snap the
 *   display to the correct value immediately instead of waiting for a tick
 */
export function useTimerClock(isRunning: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const sync = () => setNow(Date.now());
    sync();

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);

    let intervalId: number | undefined;
    if (isRunning) {
      intervalId = window.setInterval(sync, 250);
    }

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [isRunning]);

  return now;
}
