"use client";

import { FaVolumeUp } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSoundscape, useSoundscapeSnapshot } from "@/hooks/use-soundscape";
import { LEVEL_MAX, LEVEL_MIN } from "@/lib/audio/gain";
import { LAYERS } from "@/lib/audio/layers";

// Same shape as SettingsButton, so the trigger's resolved border, fill and glyph
// colours are the ones already measured for that control on the page ground.
const focusClass =
  "focus-visible:transition-none focus-visible:ring-0 focus-visible:border-control-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const checkboxClass =
  "size-6 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-control-border bg-background checked:border-primary checked:bg-primary forced-colors:checked:bg-[Highlight] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// The fill is the thumb's position and the percentage beside it, not a painted
// track: an inline gradient would need a colour in a style attribute. The track
// and thumb carry real borders so forced colours still draws both. The track
// border is 2 px because a 1 px stroke on a half-pixel boundary has no
// fully-covered row, so it cannot meet the 3:1 non-text floor at any token value.
const trackClass =
  "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:border-2 [&::-webkit-slider-runnable-track]:border-control-border [&::-webkit-slider-runnable-track]:bg-muted [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-2 [&::-moz-range-track]:border-control-border [&::-moz-range-track]:bg-muted";
const thumbClass =
  "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-popover [&::-webkit-slider-thumb]:bg-primary forced-colors:[&::-webkit-slider-thumb]:bg-[Highlight] [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-popover [&::-moz-range-thumb]:bg-primary forced-colors:[&::-moz-range-thumb]:bg-[Highlight]";
const faderClass = `h-11 w-full cursor-pointer appearance-none rounded-md bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${trackClass} ${thumbClass}`;

function Mixer() {
  const { mix, audible, message, setLayerOn, setLayerLevel, toggleAll } = useSoundscape();

  return (
    <>
      <ul className="grid gap-3">
        {LAYERS.map((layer) => {
          const entry = mix[layer.id];
          return (
            <li key={layer.id} className="grid gap-0.5">
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-base font-medium">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={entry.on}
                    onChange={(event) => setLayerOn(layer.id, layer.label, event.target.checked)}
                  />
                  {layer.label}
                </label>
                <span aria-hidden="true" className="text-sm text-muted-foreground tabular-nums">
                  {entry.on ? "On" : "Off"}, {entry.level}%
                </span>
              </div>
              <input
                type="range"
                aria-label={`${layer.label} level`}
                aria-valuetext={`${entry.level} percent`}
                min={LEVEL_MIN}
                max={LEVEL_MAX}
                step={1}
                value={entry.level}
                onChange={(event) => setLayerLevel(layer.id, Number(event.target.value))}
                className={faderClass}
              />
            </li>
          );
        })}
      </ul>
      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={toggleAll}
          className="h-11 justify-self-start rounded-xl px-4 text-base cursor-pointer motion-reduce:transition-none focus-visible:ring-0 focus-visible:border-control-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {audible ? "Stop all sound" : "Start sound"}
        </Button>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </>
  );
}

export function SoundscapeDialog() {
  const snapshot = useSoundscapeSnapshot();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          aria-label="Ambient sound"
          data-soundscape={JSON.stringify(snapshot)}
          data-soundscape-context={snapshot.context}
          className={`size-11 rounded-xl border-control-border text-base cursor-pointer motion-reduce:transition-none ${focusClass}`}
        >
          <FaVolumeUp className="size-4.5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        onOpenAutoFocus={(event) => {
          // Same choice as the task list: focus Close, which is never destructive
          // and never moves a slider by accident. Falls back to the content node.
          event.preventDefault();
          if (!(event.target instanceof HTMLElement)) return;
          const close = event.target.querySelector<HTMLElement>('[data-slot="dialog-close"]');
          (close ?? event.target).focus();
        }}
        className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-3 overflow-y-auto"
      >
        <DialogHeader className="gap-1 pr-20">
          <DialogTitle className="text-xl leading-tight font-semibold">Ambient sound</DialogTitle>
          <DialogDescription>
            Turn on as many as you like and set each level.
          </DialogDescription>
        </DialogHeader>
        <Mixer />
      </DialogContent>
    </Dialog>
  );
}
