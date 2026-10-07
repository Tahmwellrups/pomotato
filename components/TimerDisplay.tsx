import { STATUS_LABELS } from "@/lib/timer/labels";
import type { TimerStatus } from "@/lib/timer/types";

interface TimerDisplayProps {
  modeLabel: string;
  formatted: string;
  status: TimerStatus;
}

export function TimerDisplay({ modeLabel, formatted, status }: TimerDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-stone-200 bg-white px-10 py-8">
      <p className="text-sm font-medium tracking-wide text-stone-500">{modeLabel}</p>
      <p className="font-mono text-6xl font-semibold tabular-nums text-stone-900 sm:text-7xl">{formatted}</p>
      <p className="text-sm text-stone-500">{STATUS_LABELS[status]}</p>
    </div>
  );
}
