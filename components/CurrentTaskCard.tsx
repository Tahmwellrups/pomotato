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
        <p role="alert" className="text-sm text-red-700">
          Couldn&apos;t load the current task.
        </p>
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
        <p className="text-center text-sm text-stone-500">No task pinned yet. Pin one from your task list below.</p>
      )}
    </div>
  );
}
