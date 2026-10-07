import type { TimerMode, TimerStatus } from "./types";

export const MODE_LABELS: Record<TimerMode, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
  custom: "Custom",
};

export const STATUS_LABELS: Record<TimerStatus, string> = {
  idle: "Ready",
  running: "Running",
  paused: "Paused",
  complete: "Complete",
};
