"use client";

import { useEffect, useRef, useState } from "react";
import { useTimerStore } from "@/lib/timer/store";
import { parseFocusMinutes } from "@/lib/timer/time";

export function FocusLengthInput() {
  const focusMinutes = useTimerStore((state) => state.focusMinutes);
  const status = useTimerStore((state) => state.status);
  const mode = useTimerStore((state) => state.mode);
  const setFocusMinutes = useTimerStore((state) => state.setFocusMinutes);

  const [rawValue, setRawValue] = useState(() => String(focusMinutes));
  const [error, setError] = useState<string | null>(null);
  const isFocusedRef = useRef(false);

  // The field sets the next Focus run's length and is present in every mode.
  // Only a Focus run that is counting or frozen locks it; a running break does
  // not, since the next Focus run has not begun. setFocusMinutes ignores the
  // write under the same condition, so this is the visible half of that rule.
  const disabled = mode === "focus" && (status === "running" || status === "paused");

  // Keep the field in sync with the store (e.g. after a reload) unless the
  // person is actively typing in it.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setRawValue(String(focusMinutes));
      setError(null);
    }
  }, [focusMinutes]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setRawValue(next);

    const result = parseFocusMinutes(next);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setFocusMinutes(result.value);
  };

  return (
    <div className="flex w-full max-w-xs flex-col gap-1">
      <label htmlFor="focus-length" className="text-sm font-medium text-muted-foreground">
        Focus length (minutes)
      </label>
      <input
        id="focus-length"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={rawValue}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? "focus-length-error" : undefined}
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
        <p id="focus-length-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
