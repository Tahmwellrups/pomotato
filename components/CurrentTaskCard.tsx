"use client";

import { useCurrentTask } from "@/hooks/use-current-task";
import { TaskColorDot } from "./TaskColorDot";

const cardClass = "flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white px-6 py-5";

export function CurrentTaskCard() {
  const query = useCurrentTask();

  if (query.status === "loading") {
    return (
      <div className={cardClass}>
        <p className="text-sm font-medium tracking-wide text-stone-500">Current task</p>
        <p role="status" className="text-sm text-stone-500">
          Loading…
        </p>
      </div>
    );
  }

  if (query.status === "error") {
    return (
      <div className={cardClass}>
        <p className="text-sm font-medium tracking-wide text-stone-500">Current task</p>
        <p role="alert" className="text-center text-sm text-red-700">
          {query.blocked
            ? "Couldn't load the current task. Another Pomotato tab is still using an older version. Close other Pomotato tabs, then reload."
            : "Couldn't load the current task. Pomotato keeps your tasks in this browser's storage, so check that private browsing or a storage setting isn't blocking it, then reload."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-lg border border-border bg-background px-5 py-2 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Reload
        </button>
      </div>
    );
  }

  const { task } = query;

  return (
    <div className={cardClass}>
      <p className="text-sm font-medium tracking-wide text-stone-500">Current task</p>
      {task ? (
        <div className="flex max-w-full items-center gap-2">
          <TaskColorDot colorId={task.colorId} className="h-3.5 w-3.5" />
          <span aria-hidden="true" className="text-2xl leading-none">
            {task.emoji}
          </span>
          <span className="min-w-0 break-words font-medium text-stone-900">{task.title}</span>
          <span className="shrink-0 font-mono text-sm tabular-nums text-stone-600">
            {task.completed} / {task.eta}
          </span>
        </div>
      ) : (
        <p className="text-center text-sm text-stone-500">Pin a task from Your tasks whenever you&apos;re ready.</p>
      )}
    </div>
  );
}
