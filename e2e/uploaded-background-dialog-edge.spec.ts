// RETIRED (task 010 QA pass 2, job 2; re-point pass 2026-11-10). This file measured the "Your tasks" task
// dialog's edge (--dialog-edge) against the scrimmed page and against the dialog fill, over no image, white
// and black, in both themes. The dialog was deleted in commit 4ca861e ("Panel-only task surface"); the task
// list is now an always-visible panel with no scrim, so there is no task-dialog edge left to measure. Pressing
// Escape no longer closes anything, which is why the old run failed.
//
// Status of the deferred light sub-floor (docs/PLAN.md, "Light dialogs do not separate from the scrimmed page
// at 3:1"): it is NOT fixed. `--dialog-edge` is still `var(--border)` in light (app/globals.css:116), so the
// situation is neither "the fix landed" (flip the marker to a real assertion) nor "the deferral still applies
// to a live surface". The token is still consumed by components/SoundscapeDialog.tsx through components/ui/dialog.tsx,
// so the same 2.00:1 / 1.43:1 sub-floor may still stand on that dialog. Measuring it there needs new painted
// figures, which belongs to the measurement pass. Owner decision needed: re-point this file to the soundscape
// dialog (with its own recorded figures), or close the PLAN item as moot for the deleted task dialog.
//
// The dark case (3:1 floor for the dialog edge) has no live subject in the task panel and is retired with it.
export {};
