"use client";

import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/lib/preferences";
import type { DurationKey } from "@/lib/timer/constants";
import { parseMinutes } from "@/lib/timer/time";

interface DurationFieldProps {
  durationKey: DurationKey;
  /** Element id of the input. The error node is `${id}-error`. */
  id: string;
  label: string;
}

// One of the three session-length fields. A typed or pasted value goes through
// the same handler and the same parser: only a valid whole number inside this
// field's own bounds reaches the store, so the stored value always keeps its
// last valid entry. The field is enabled in every timer state, because the
// running session carries its own length and a change lands on the next one.
export function DurationField({ durationKey, id, label }: DurationFieldProps) {
  const stored = usePreferencesStore((state) => state[durationKey]);
  const setDuration = usePreferencesStore((state) => state.setDuration);

  const [rawValue, setRawValue] = useState(() => String(stored));
  const [error, setError] = useState<string | null>(null);
  const isFocusedRef = useRef(false);

  // Follow the store (a reload, or Reset to defaults) unless the person is typing.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setRawValue(String(stored));
      setError(null);
    }
  }, [stored]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setRawValue(next);

    const result = parseMinutes(durationKey, next);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setDuration(durationKey, result.value);
  };

  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1 max-sm:flex-row max-sm:flex-wrap max-sm:items-center max-sm:justify-between">
      <label htmlFor={id} className="text-sm font-medium text-secondary-foreground max-sm:flex max-sm:min-h-11 max-sm:items-center">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={rawValue}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
        }}
        onChange={handleChange}
        className="min-h-11 w-28 rounded-lg border border-control-border bg-popover px-3 py-2 text-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      {error !== null ? (
        <p id={errorId} role="alert" className="text-sm text-destructive max-sm:basis-full">
          {error}
        </p>
      ) : null}
    </div>
  );
}
