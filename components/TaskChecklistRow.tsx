"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RiDraggable } from "react-icons/ri";
import type { Task } from "@/lib/db";
import { actionButtonClass } from "./task-row-styles";
import { TaskForm, type TaskFormValues } from "./TaskForm";

type RowMode = "display" | "editing" | "confirming-delete";

interface TaskChecklistRowProps {
  task: Task;
  isCurrent: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Resolves true once the write is stored, false if it failed. */
  onToggleDone: (id: string, done: boolean) => Promise<boolean>;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onEdit: (id: string, values: TaskFormValues) => Promise<void>;
  /** Performs the delete; a rejection leaves the row in place and returns it to display mode. */
  onDeleteConfirmed: (id: string) => Promise<void>;
  dragHandleId: string;
  /** DOM id for the Edit button, so the list can refocus "the task that took this position" after a different row is deleted. */
  editButtonId: string;
}

// The panel's row, and the only task row in the app: tick, current marker,
// drag handle, move up/down, -1/+1, edit and delete.
export function TaskChecklistRow({
  task,
  isCurrent,
  canMoveUp,
  canMoveDown,
  onToggleDone,
  onMoveUp,
  onMoveDown,
  onIncrement,
  onDecrement,
  onEdit,
  onDeleteConfirmed,
  dragHandleId,
  editButtonId,
}: TaskChecklistRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  // The box shows the tick the moment it is clicked, then follows the stored
  // value. `base` is what was stored when she clicked: once the stored value
  // moves off it the write has landed and the stored value takes over, and a
  // failed write drops the pending tick so the box shows what is stored.
  const [pending, setPending] = useState<{ base: boolean; value: boolean } | null>(null);
  const checked = pending !== null && pending.base === task.done ? pending.value : task.done;

  const [mode, setMode] = useState<RowMode>("display");
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const previousModeRef = useRef<RowMode>("display");

  // Focus lands somewhere predictable on every exit from a non-display mode:
  // back on Edit after an edit (saved or cancelled), back on Delete after
  // backing out of the confirmation. A confirmed delete removes the row, so
  // that case belongs to the list (TaskChecklist), not here.
  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = mode;
    if (previous === mode) return;
    if (mode === "confirming-delete") {
      confirmCancelRef.current?.focus();
    } else if (mode === "display") {
      if (previous === "editing") editButtonRef.current?.focus();
      if (previous === "confirming-delete") deleteButtonRef.current?.focus();
    }
  }, [mode]);

  function handleChange(next: boolean) {
    setPending({ base: task.done, value: next });
    void onToggleDone(task.id, next).then((stored) => {
      if (!stored) setPending(null);
    });
  }

  async function handleEditSubmit(values: TaskFormValues) {
    await onEdit(task.id, values);
    setMode("display");
  }

  async function handleConfirmDelete() {
    try {
      await onDeleteConfirmed(task.id);
    } catch {
      setMode("display");
    }
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setMode("display");
    }
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  const deleteConfirmPromptId = `task-${task.id}-delete-confirm`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      aria-current={isCurrent ? "true" : undefined}
      className={[
        "flex flex-col gap-1 rounded-xl border bg-card p-2",
        isCurrent ? "border-primary" : "border-border",
        isDragging ? "opacity-60 ring-2 ring-ring" : "",
      ].join(" ")}
    >
      {mode === "editing" ? (
        <TaskForm
          idPrefix={`task-${task.id}-edit`}
          initialValues={{ title: task.title, eta: task.eta }}
          submitLabel="Save"
          onSubmit={handleEditSubmit}
          onCancel={() => setMode("display")}
        />
      ) : (
        <>
          {/*
            The marker is words, not just the border colour: "current" has to
            survive greyscale and forced colours, and it names the same task
            the timer card above is showing. It reuses the accent pair that
            marked the old pinned state, so no colour is added.
          */}
          {isCurrent ? (
            <span className="ml-13 w-fit rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              Current task
            </span>
          ) : null}

          {/*
            Line one carries the tick, the title and the count and nothing
            else: the seven buttons wrap on their own line below. The row's
            inner width is about 248 px at 320 and 310 px in the xl panel,
            and the tick cell (44), its gap (8) and the count (~50 with its
            gap) leave the title about 138 px at 320 and 200 px at 1280. A
            button on this line would be paid for out of the title, which is
            the collapse-to-zero-width bug task 002 lost a fix loop to. The
            label owns the title so the whole line toggles the box, and the
            box draws a native control so forced-colors keeps a checked
            state without help.
          */}
          <div className="flex items-center gap-2">
            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2">
              <span className="grid size-11 shrink-0 place-items-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => handleChange(event.target.checked)}
                  className="size-6 cursor-pointer accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </span>
              <span
                className={`min-w-0 flex-1 font-medium break-words ${
                  task.done ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {task.title}
              </span>
            </label>
            <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
              {task.completed} / {task.eta}
            </span>
          </div>

          {mode === "confirming-delete" ? (
            <div
              role="group"
              aria-labelledby={deleteConfirmPromptId}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--destructive)_6%,var(--card))] p-2"
              onKeyDown={handleConfirmKeyDown}
            >
              <p id={deleteConfirmPromptId} className="text-sm text-destructive">
                Delete &ldquo;{task.title}&rdquo;? This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  ref={confirmCancelRef}
                  onClick={() => setMode("display")}
                  className={actionButtonClass}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-destructive px-3 text-sm font-medium text-destructive-foreground outline-none hover:bg-[color-mix(in_srgb,var(--destructive),var(--foreground)_20%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                id={dragHandleId}
                ref={setActivatorNodeRef}
                aria-label={`Reorder ${task.title}`}
                className={`${actionButtonClass} shrink-0 cursor-grab touch-none active:cursor-grabbing`}
                {...attributes}
                {...listeners}
              >
                <RiDraggable aria-hidden="true" className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => onMoveUp(task.id)}
                disabled={!canMoveUp}
                aria-label={`Move ${task.title} up`}
                className={actionButtonClass}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                onClick={() => onMoveDown(task.id)}
                disabled={!canMoveDown}
                aria-label={`Move ${task.title} down`}
                className={actionButtonClass}
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                onClick={() => onDecrement(task.id)}
                disabled={task.completed <= 0}
                aria-label={`-1, remove a completed pomodoro from ${task.title}`}
                className={actionButtonClass}
              >
                -1
              </button>
              <button
                type="button"
                onClick={() => onIncrement(task.id)}
                disabled={task.completed >= 999}
                aria-label={`+1, add a completed pomodoro to ${task.title}`}
                className={actionButtonClass}
              >
                +1
              </button>
              <button
                type="button"
                id={editButtonId}
                ref={editButtonRef}
                onClick={() => setMode("editing")}
                aria-label={`Edit ${task.title}`}
                className={actionButtonClass}
              >
                Edit
              </button>
              <button
                type="button"
                ref={deleteButtonRef}
                onClick={() => setMode("confirming-delete")}
                aria-label={`Delete ${task.title}`}
                className={actionButtonClass}
              >
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
