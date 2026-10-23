"use client";

import { useEffect, useRef, useState } from "react";
import { useTimerStore } from "@/lib/timer/store";
import { parseCustomMinutes } from "@/lib/timer/time";

export function CustomDurationInput() {
  const customMinutes = useTimerStore((state) => state.customMinutes);
  const status = useTimerStore((state) => state.status);
  const setCustomMinutes = useTimerStore((state) => state.setCustomMinutes);

  const [rawValue, setRawValue] = useState(() => String(customMinutes));
  const [error, setError] = useState<string | null>(null);
  const isFocusedRef = useRef(false);

  const disabled = status === "running" || status === "paused";

  // Keep the field in sync with the store (e.g. after a reload) unless the
  // person is actively typing in it.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setRawValue(String(customMinutes));
      setError(null);
    }
  }, [customMinutes]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setRawValue(next);

    const result = parseCustomMinutes(next);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setCustomMinutes(result.value);
  };

  return (
    <div className="flex w-full max-w-xs flex-col gap-1">
      <label htmlFor="custom-duration" className="text-sm font-medium text-muted-foreground">
        Custom duration (minutes)
      </label>
      <input
        id="custom-duration"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={rawValue}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? "custom-duration-error" : undefined}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
        }}
        onChange={handleChange}
        className="min-h-11 rounded-lg border border-control-border bg-popover px-3 py-2 text-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-[color-mix(in_srgb,var(--muted-foreground)_56%,var(--muted))]"
      />
      {error !== null ? (
        <p id="custom-duration-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
