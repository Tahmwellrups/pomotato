"use client";

import { FaTasks } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/lib/preferences/store";

// The Button base already draws a 1px border + ring on focus; the app-wide
// pattern is a 2px outline, which is easier to see on cream, so swap one for
// the other here.
const focusClass =
  "focus-visible:border-border focus-visible:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// The one control for showing and hiding the task panel, and the only way back
// to it once hidden. It sits on the bare photograph with its three siblings,
// so it carries .control-edge like them. The name never changes: the state is
// aria-expanded, so a screen reader hears the same control in both states.
// Until the store has rehydrated it reports the server-rendered default
// (expanded); a stored "hidden" is already painted by the boot script.
export function TaskPanelToggle() {
  const stored = usePreferencesStore((state) => state.taskPanelVisible);
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const setTaskPanelVisible = usePreferencesStore((state) => state.setTaskPanelVisible);
  const visible = hasHydrated ? stored : true;

  return (
    <Button
      type="button"
      variant="default"
      aria-label="Tasks"
      aria-expanded={visible}
      onClick={() => setTaskPanelVisible(!visible)}
      className={`control-edge flex size-11 cursor-pointer items-center rounded-xl border-none bg-primary text-base text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground motion-reduce:transition-none ${focusClass}`}
    >
      <FaTasks className="size-4.5 place-self-center-safe" />
    </Button>
  );
}
