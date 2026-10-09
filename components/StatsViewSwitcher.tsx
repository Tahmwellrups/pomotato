"use client";

import type { StatsView } from "@/lib/stats";

const OPTIONS: { value: StatsView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

interface StatsViewSwitcherProps {
  value: StatsView;
  onChange: (view: StatsView) => void;
}

// Native radios inside a fieldset: arrow keys, Space, and the checked state
// come from the browser, and the checked state is announced without color.
export function StatsViewSwitcher({ value, onChange }: StatsViewSwitcherProps) {
  return (
    <fieldset>
      <legend className="sr-only">Time range</legend>
      <div className="flex gap-2">
        {OPTIONS.map((option) => {
          const checked = value === option.value;
          return (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                name="stats-view"
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <span
                className={[
                  "inline-flex min-h-11 min-w-20 items-center justify-center rounded-lg border px-4 py-2 text-sm transition-colors motion-reduce:transition-none",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                  checked
                    ? "border-primary bg-accent font-semibold text-accent-foreground"
                    : "border-border bg-card text-secondary-foreground hover:border-secondary-foreground",
                ].join(" ")}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
