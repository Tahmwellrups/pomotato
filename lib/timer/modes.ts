import type { TimerMode } from "./types";

/**
 * The selectable modes, as an exhaustive `Record` so a fourth mode added to
 * `TimerMode` fails typecheck here until it is listed, and an extra key fails
 * too. Tests assert `TIMER_MODES` is exactly these three.
 */
const TIMER_MODE_SET: Record<TimerMode, true> = {
  focus: true,
  shortBreak: true,
  longBreak: true,
};

export const TIMER_MODES: readonly TimerMode[] = Object.keys(TIMER_MODE_SET) as TimerMode[];

export function isTimerMode(value: unknown): value is TimerMode {
  return typeof value === "string" && (TIMER_MODES as readonly string[]).includes(value);
}
