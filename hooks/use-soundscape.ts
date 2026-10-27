"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { soundscape, type SoundscapeSnapshot, type StartResult } from "@/lib/audio/engine";
import { preloadLayerFiles } from "@/lib/audio/files";
import type { Mix } from "@/lib/audio/mix";
import { usePreferencesStore } from "@/lib/preferences";

/** The live graph, for anything that only reads it (the dialog's trigger). */
export function useSoundscapeSnapshot(): SoundscapeSnapshot {
  // The trigger is on every page, so this fetches the layer files at page load.
  useEffect(() => {
    preloadLayerFiles();
  }, []);
  return useSyncExternalStore(soundscape.subscribe, soundscape.getSnapshot, soundscape.getServerSnapshot);
}

const BLOCKED = "Your browser did not start the sound. Press Start sound to try again.";
const UNSUPPORTED = "This browser cannot play generated audio.";

function failureMessage(result: StartResult): string | null {
  if (result === "blocked") return BLOCKED;
  if (result === "unsupported") return UNSUPPORTED;
  return null;
}

/**
 * Every action here runs inside the click that caused it, which is what lets
 * the engine start audio under autoplay policy. `message` is empty until an
 * action produces one, so a live region bound to it stays silent on arrival.
 */
export function useSoundscape() {
  const mix = usePreferencesStore((state) => state.mix);
  const setMix = usePreferencesStore((state) => state.setMix);
  const snapshot = useSoundscapeSnapshot();
  const [message, setMessage] = useState("");
  // Id of the newest message-producing action. A promise that settles after a
  // newer action began is stale and must not write its message.
  const latestAction = useRef(0);

  const commit = useCallback(
    (next: Mix, playing: boolean, success: string) => {
      const action = ++latestAction.current;
      setMix(next);
      void soundscape.apply(next, playing).then((result) => {
        if (action !== latestAction.current) return;
        setMessage(failureMessage(result) ?? success);
      });
    },
    [setMix]
  );

  const setLayerOn = useCallback(
    (id: string, label: string, on: boolean) => {
      const next: Mix = { ...mix, [id]: { ...mix[id], on } };
      commit(next, on ? true : soundscape.getSnapshot().playing, `${label} ${on ? "on" : "off"}.`);
    },
    [commit, mix]
  );

  const setLayerLevel = useCallback(
    (id: string, level: number) => {
      const next: Mix = { ...mix, [id]: { ...mix[id], level } };
      setMix(next);
      void soundscape.apply(next, soundscape.getSnapshot().playing);
    },
    [mix, setMix]
  );

  const audible = Object.values(snapshot.layers).some((layer) => layer.on);
  const anyOn = Object.values(mix).some((layer) => layer.on);

  const toggleAll = useCallback(() => {
    if (audible) {
      commit(mix, false, "All sound stopped. Your mix is kept.");
    } else if (anyOn) {
      commit(mix, true, "Sound started.");
    } else {
      latestAction.current += 1;
      setMessage("No layer is on yet. Turn one on to hear it.");
    }
  }, [anyOn, audible, commit, mix]);

  return { mix, audible, message, setLayerOn, setLayerLevel, toggleAll };
}
