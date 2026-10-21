import { TimerGauge } from "./TimerGauge";

interface TimerDisplayProps {
  formatted: string;
  remainingMs: number;
  fullMs: number;
  hasHydrated: boolean;
}

export function TimerDisplay({ formatted, remainingMs, fullMs, hasHydrated }: TimerDisplayProps) {
  return (
    <div className="relative flex min-h-40 w-full items-center justify-center px-6 py-4 sm:min-h-44 lg:min-h-1/2">
      <TimerGauge remainingMs={remainingMs} fullMs={fullMs} ready={hasHydrated} />
      <p className="relative font-space-grotesk text-6xl font-extrabold tabular-nums text-foreground sm:text-7xl lg:text-8xl">{formatted}</p>
    </div>
  );
}
