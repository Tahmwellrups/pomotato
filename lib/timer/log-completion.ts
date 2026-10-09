import { logCompletedSession } from "@/lib/db";
import type { TimerMode } from "./types";

export interface CompletedRun {
  runId: string;
  mode: TimerMode;
  /** Null when the start time was never recorded (a migrated version-1 run). */
  startedAt: number | null;
  /** The stored end timestamp, not the moment completion was noticed. */
  endedAt: number;
  plannedDurationMs: number;
}

/**
 * Fire-and-forget write of a finished run. A rejected write is swallowed so a
 * broken IndexedDB never interrupts the timer; a "duplicate" result is success.
 */
export function logRunCompletion(run: CompletedRun): void {
  const startedAt = Math.max(0, Math.min(run.startedAt ?? run.endedAt - run.plannedDurationMs, run.endedAt));
  void logCompletedSession({
    runId: run.runId,
    mode: run.mode,
    startedAt,
    endedAt: run.endedAt,
    plannedDurationMs: run.plannedDurationMs,
  }).catch((error: unknown) => {
    console.warn("Pomotato could not log a completed session.", error);
  });
}
