"use client";

import { useLayoutEffect } from "react";
import { Surface } from "@/components/Surface";
import { TaskChecklist, TASK_PANEL_HEADING_ID } from "@/components/TaskChecklist";
import { usePreferencesStore } from "@/lib/preferences/store";

// Fixed by the boot script's contract: absent means shown.
const TASK_PANEL_ATTRIBUTE = "data-task-panel";
const TASK_PANEL_HIDDEN = "hidden";

// The only task surface on "/". From xl up it is pinned lower-left, beside the
// timer column; below xl it is ordinary content after the timer, for the same
// reason the bottom-right cluster is (BottomControls): a viewport-pinned
// panel on a phone covers Start. xl and not lg because the centred 28rem
// column leaves only 288 px either side at 1024, which is less than this
// panel plus its margin; at 1280 the panel's box ends where the column starts
// (x 416), with its own 16 px right padding as the gap. The panel is
// out of flow at xl, so app/page.tsx's bottom padding reserves nothing for it.
// It is the only landmark it adds: a region named "Task list" by aria-label,
// since the panel has no visible heading.
//
// Hiding. The stored preference is only readable after rehydration, so the
// server render and the first client render both show the panel. A stored
// "hidden" is painted correctly before that by the boot script, which sets
// data-task-panel="hidden" on <html>, and a rule in globals.css that hides
// [data-task-panel-root] while the attribute is there. Once rehydrated this
// component takes over: it unmounts the panel when hidden, and keeps the
// attribute in step with the store so that showing it again is not undone by
// the stylesheet. Below xl the panel is in flow after the timer, so hiding it
// moves only the cluster beneath it, never the timer.
export function TaskPanel() {
  const visible = usePreferencesStore((state) => state.taskPanelVisible);
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);

  useLayoutEffect(() => {
    if (!hasHydrated) return;
    const root = document.documentElement;
    if (visible) root.removeAttribute(TASK_PANEL_ATTRIBUTE);
    else root.setAttribute(TASK_PANEL_ATTRIBUTE, TASK_PANEL_HIDDEN);
  }, [visible, hasHydrated]);

  if (hasHydrated && !visible) return null;

  return (
    <section
      data-task-panel-root=""
      aria-labelledby={TASK_PANEL_HEADING_ID}
      className="flex w-full max-w-md flex-col xl:fixed xl:bottom-0 xl:left-0 xl:z-10 xl:w-125 xl:max-w-none xl:p-4 xl:pb-12 xl:pl-12"
    >
      <Surface kind="solid" className="flex min-h-0 flex-col gap-3 p-3 xl:max-h-[min(30rem,calc(100dvh-10rem))]">
        <h2 id={TASK_PANEL_HEADING_ID} className="px-1 text-sm font-semibold text-secondary-foreground">
          Task list
        </h2>
        <TaskChecklist />
      </Surface>
    </section>
  );
}
