"use client";

interface UndoToastProps {
  /** What was deleted, or null when there is nothing to undo. */
  message: string | null;
  onUndo: () => void;
}

// The status container is always mounted and the toast is inserted into it:
// screen readers only announce changes to a live region that already exists.
// Polite, not assertive: the delete was the user's own action, and an
// assertive announcement would cut across the screen reader reading out where
// focus just landed. It is not a dialog and never takes focus; Undo sits in the
// tab order straight after "Add task".
export function UndoToast({ message, onUndo }: UndoToastProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {message !== null ? (
        <div className="flex items-center gap-2 rounded-xl border border-control-border bg-popover py-1 pr-1 pl-3 text-sm text-popover-foreground duration-150 animate-in fade-in-0 motion-reduce:animate-none">
          <p className="min-w-0 flex-1 truncate">{message}</p>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-control-border px-3 font-semibold text-foreground outline-none hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
