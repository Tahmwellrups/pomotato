"use client";

import { useSyncExternalStore } from "react";
import { chime, type ChimeSnapshot } from "@/lib/audio/chime";

/** How many chimes this document has started. Exposed on the page so a test can watch without audio hardware. */
export function useChimeSnapshot(): ChimeSnapshot {
  return useSyncExternalStore(chime.subscribe, chime.getSnapshot, chime.getServerSnapshot);
}
