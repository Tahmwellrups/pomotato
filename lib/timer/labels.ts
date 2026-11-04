import type { TimerMode, TimerStatus } from "./types";

export const MODE_LABELS: Record<TimerMode, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

export const STATUS_LABELS: Record<TimerStatus, string> = {
  idle: "Ready",
  running: "Running",
  paused: "Paused",
  complete: "Complete",
};
