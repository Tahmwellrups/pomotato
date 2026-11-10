"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Quiet time after the last keystroke before typed text is written. */
export const TITLE_DEBOUNCE_MS = 300;

interface UseInlineTitleOptions {
  /** The title as stored; empty for a row that has never been written. */
  storedTitle: string;
  /** Writes a trimmed, non-empty title. Resolves false when the write failed. */
  save: (title: string) => Promise<boolean>;
}

/**
 * The text of one inline-edited row: the live value, a ~300 ms debounce into
 * `save`, and the moments that skip the wait: blur, an explicit flush, unmount,
 * and the page going away. `beforeunload` is listened to as well as `pagehide`
 * because a reload straight after typing only landed in testing when the write
 * was started that early; it is still best effort, since the browser may drop a
 * transaction opened while the page is going away.
 *
 * An empty or whitespace-only value is never passed to `save`; a stored row that
 * is left empty goes back to its stored title on blur instead.
 */
export function useInlineTitle({ storedTitle, save }: UseInlineTitleOptions) {
  const [value, setValue] = useState(storedTitle);
  const [dirty, setDirty] = useState(false);
  const [seenStoredTitle, setSeenStoredTitle] = useState(storedTitle);

  // Follow the stored title unless the user has unsaved typing in flight. Done
  // during render (React's derived-state pattern) so there is no frame showing
  // the old value.
  if (seenStoredTitle !== storedTitle) {
    setSeenStoredTitle(storedTitle);
    if (!dirty) setValue(storedTitle);
  }

  const latest = useRef({ value, storedTitle, save });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const baselineRef = useRef(storedTitle);

  useEffect(() => {
    latest.current = { value: dirty ? latest.current.value : value, storedTitle, save };
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    clearTimer();
    const { value: typed, storedTitle: stored, save: write } = latest.current;
    const trimmed = typed.trim();
    if (trimmed === "" || trimmed === stored) {
      setDirty(false);
      return;
    }
    const revision = revisionRef.current;
    void write(trimmed).then((ok) => {
      if (revisionRef.current !== revision) return;
      setDirty(false);
      if (!ok) setValue(latest.current.storedTitle);
    });
  }, [clearTimer]);

  const onChange = useCallback(
    (next: string) => {
      latest.current.value = next;
      revisionRef.current += 1;
      setValue(next);
      setDirty(true);
      clearTimer();
      timerRef.current = setTimeout(flush, TITLE_DEBOUNCE_MS);
    },
    [clearTimer, flush],
  );

  const onFocus = useCallback(() => {
    if (timerRef.current === null) baselineRef.current = latest.current.storedTitle;
  }, []);

  const onBlur = useCallback(() => {
    flush();
    const typed = latest.current.value;
    const trimmed = typed.trim();
    const next = trimmed === "" ? latest.current.storedTitle : trimmed;
    if (next !== typed) {
      latest.current.value = next;
      setValue(next);
    }
  }, [flush]);

  // Escape: drop what was typed and go back to the title the row had when the
  // edit began. If the debounce already wrote part of the edit, the baseline is
  // written back so a reload agrees with the screen.
  const cancelEdit = useCallback(() => {
    clearTimer();
    revisionRef.current += 1;
    setDirty(false);
    const { storedTitle: stored, save: write } = latest.current;
    const baseline = baselineRef.current;
    if (baseline !== "" && baseline !== stored) {
      latest.current.value = baseline;
      setValue(baseline);
      void write(baseline).then((ok) => {
        if (!ok) setValue(latest.current.storedTitle);
      });
      return;
    }
    latest.current.value = stored;
    setValue(stored);
  }, [clearTimer]);

  useEffect(() => {
    function onPageHide() {
      if (timerRef.current !== null) flush();
    }
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      if (timerRef.current !== null) flush();
    };
  }, [flush]);

  return { value, onChange, onFocus, onBlur, cancelEdit, flush };
}
