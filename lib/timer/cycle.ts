import { CYCLE_LENGTH } from "./constants";
import type { TimerMode } from "./types";

export interface CycleStep {
  nextMode: TimerMode;
  nextPosition: number;
}

/**
 * Pure transition for a completed run. Focus adds one to the position (capped
 * at the cycle length) and goes to the long break once the cycle is full, else
 * the short break. Any break returns to Focus; only the long break zeroes the
 * position, a short break leaves it alone.
 */
export function nextCycleStep(completedMode: TimerMode, position: number): CycleStep {
  switch (completedMode) {
    case "focus": {
      const nextPosition = Math.min(position + 1, CYCLE_LENGTH);
      return { nextMode: nextPosition >= CYCLE_LENGTH ? "longBreak" : "shortBreak", nextPosition };
    }
    case "shortBreak":
      return { nextMode: "focus", nextPosition: position };
    case "longBreak":
      return { nextMode: "focus", nextPosition: 0 };
  }
}
