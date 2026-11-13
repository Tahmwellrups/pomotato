"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChimeSnapshot } from "@/hooks/use-chime";
import { CHIME_DURATION_SECONDS, chime, type ChimePreview } from "@/lib/audio/chime";
import { LEVEL_MAX, LEVEL_MIN } from "@/lib/audio/gain";
import { usePreferencesStore } from "@/lib/preferences";

// Follows the sound: change the strikes and this copy follows.
const RING_SECONDS = Math.round(CHIME_DURATION_SECONDS);
const RING_LENGTH = `about ${RING_SECONDS} seconds`;

const buttonClass =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center rounded-lg border border-control-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

const checkboxClass =
  "size-6 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-control-border bg-background checked:border-primary checked:bg-primary forced-colors:checked:bg-[Highlight] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// Same slider as the ambient mixer's: the 2 px track and 24 px thumb carry real
// borders so forced colours still draws both, and the input itself is 44 px
// tall so the hit area is larger than the painted thumb.
const trackClass =
  "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:border-2 [&::-webkit-slider-runnable-track]:border-control-border [&::-webkit-slider-runnable-track]:bg-muted [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-2 [&::-moz-range-track]:border-control-border [&::-moz-range-track]:bg-muted";
const thumbClass =
  "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-popover [&::-webkit-slider-thumb]:bg-primary forced-colors:[&::-webkit-slider-thumb]:bg-[Highlight] [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-popover [&::-moz-range-thumb]:bg-primary forced-colors:[&::-moz-range-thumb]:bg-[Highlight]";
const sliderClass = `h-11 w-full cursor-pointer appearance-none rounded-md bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${trackClass} ${thumbClass}`;

export function ChimeSettings() {
  const { plays } = useChimeSnapshot();
  const enabled = usePreferencesStore((state) => state.chimeEnabled);
  const storedLevel = usePreferencesStore((state) => state.chimeLevel);
  const setChimeEnabled = usePreferencesStore((state) => state.setChimeEnabled);
  const setChimeLevel = usePreferencesStore((state) => state.setChimeLevel);

  // The slider moves a local value on every step and writes the store once per
  // gesture: when the pointer lifts, when focus leaves, or when the page is
  // going away. A keyboard run of twenty steps is one write, not twenty.
  const [level, setLevel] = useState(storedLevel);
  const levelRef = useRef(level);
  const dirtyRef = useRef(false);

  const commit = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setChimeLevel(levelRef.current);
  }, [setChimeLevel]);

  useEffect(() => {
    if (dirtyRef.current) return;
    levelRef.current = storedLevel;
    setLevel(storedLevel);
  }, [storedLevel]);

  useEffect(() => {
    window.addEventListener("pagehide", commit);
    return () => {
      window.removeEventListener("pagehide", commit);
      commit();
    };
  }, [commit]);

  const handleLevel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    levelRef.current = next;
    dirtyRef.current = true;
    setLevel(next);
  };

  // The alarm rings for several seconds, so the same button stops it. This is the only
  // place an alarm can be stopped early.
  const previewRef = useRef<ChimePreview | null>(null);
  const [ringing, setRinging] = useState(false);

  // The stop button leaves with this component, so an audition ends with it.
  // ChimePreview.stop() is a no-op once a session alarm has replaced the preview.
  useEffect(() => {
    return () => {
      const preview = previewRef.current;
      previewRef.current = null;
      preview?.stop();
    };
  }, []);

  const handlePreview = () => {
    if (previewRef.current !== null) {
      previewRef.current.stop();
      return;
    }
    commit();
    // Inside the click, so it also unlocks audio for the chimes that follow.
    chime.prime();
    const preview = chime.preview(levelRef.current);
    previewRef.current = preview;
    setRinging(true);
    void preview.ended.then(() => {
      if (previewRef.current !== preview) return;
      previewRef.current = null;
      setRinging(false);
    });
  };

  return (
    <fieldset data-chime-plays={plays} className="flex flex-col gap-3">
      <legend className="mb-1 font-heading text-lg font-semibold">Session-end sound</legend>
      <label className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-base font-medium sm:max-w-md">
        <input
          type="checkbox"
          className={checkboxClass}
          checked={enabled}
          aria-describedby="chime-state"
          onChange={(event) => setChimeEnabled(event.target.checked)}
        />
        <span className="flex-1">Play a chime when a session ends</span>
        <span aria-hidden="true" className="text-sm text-secondary-foreground tabular-nums">
          {enabled ? "On" : "Off"}
        </span>
      </label>
      <p id="chime-state" className="text-sm text-secondary-foreground">
        {enabled
          ? `The sound rings for ${RING_LENGTH} when a Focus session ends and when a break ends.`
          : `Off means no chime when a session ends. Preview still rings for ${RING_LENGTH}.`}
      </p>
      <div className="flex flex-col gap-0.5 sm:max-w-md">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="chime-volume" className="flex min-h-11 flex-1 items-center text-sm font-medium text-secondary-foreground">
            Chime volume
          </label>
          <span aria-hidden="true" className="text-sm text-secondary-foreground tabular-nums">
            {level}%
          </span>
        </div>
        <input
          id="chime-volume"
          type="range"
          aria-valuetext={`${level} percent`}
          min={LEVEL_MIN}
          max={LEVEL_MAX}
          step={1}
          value={level}
          onChange={handleLevel}
          onPointerUp={commit}
          onPointerCancel={commit}
          onBlur={commit}
          className={sliderClass}
        />
      </div>
      <div>
        <button type="button" className={`${buttonClass} min-w-36 justify-center`} onClick={handlePreview}>
          {ringing ? "Stop preview" : "Preview chime"}
        </button>
      </div>
    </fieldset>
  );
}
