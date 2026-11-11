import { usePreferencesStore } from "@/lib/preferences";
import type { Durations } from "./time";

/** The three session lengths as they are stored right now. The one settings source the timer reads. */
export function readDurations(): Durations {
  const { focusMinutes, shortBreakMinutes, longBreakMinutes } = usePreferencesStore.getState();
  return { focusMinutes, shortBreakMinutes, longBreakMinutes };
}
