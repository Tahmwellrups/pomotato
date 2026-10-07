"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PALETTE, type Task } from "@/lib/db";
import { TaskColorDot } from "./TaskColorDot";
import { TaskForm, type TaskFormValues } from "./TaskForm";

type RowMode = "display" | "editing" | "confirming-delete";

interface TaskRowProps {
  task: Task;
  isPinned: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onPinToggle: (id: string, currentlyPinned: boolean) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onEdit: (id: string, values: TaskFormValues) => Promise<void>;
  /** Performs the actual delete and reports success/failure back; a rejection means the row stays and returns to display mode instead of vanishing. */
  onDeleteConfirmed: (id: string) => Promise<void>;
  /** DOM id for the drag handle, so `TaskList` can refocus "the task that took this position" after a different row is deleted. */
  dragHandleId: string;
}

const actionButtonClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 outline-none hover:border-stone-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:opacity-40";

export function TaskRow({
  task,
  isPinned,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onPinToggle,
  onIncrement,
  onDecrement,
  onEdit,
  onDeleteConfirmed,
  dragHandleId,
}: TaskRowProps) {
  const [mode, setMode] = useState<RowMode>("display");
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const previousModeRef = useRef<RowMode>("display");

  // Focus lands somewhere predictable on every exit from a non-display
  // mode: back on Edit after an edit (saved or cancelled), back on Delete
  // after backing out of the confirmation. A successful delete instead
  // removes this row entirely, so that case is handled by the list owner,
  // not here.
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

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  const colorName = PALETTE.find((entry) => entry.id === task.colorId)?.name ?? task.colorId;
  const deleteConfirmPromptId = `task-${task.id}-delete-confirm`;

  function handleEditCancel() {
    setMode("display");
  }

  async function handleEditSubmit(values: TaskFormValues) {
    await onEdit(task.id, values);
    setMode("display");
  }

  function handleCancelDeleteKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setMode("display");
    }
  }

  async function handleConfirmDelete() {
    try {
      await onDeleteConfirmed(task.id);
    } catch {
      setMode("display");
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3",
        isDragging ? "opacity-60 ring-2 ring-amber-700" : "",
      ].join(" ")}
    >
      {mode === "editing" ? (
        <div className="flex-1">
          <TaskForm
            idPrefix={`task-${task.id}-edit`}
            initialValues={{ title: task.title, emoji: task.emoji, colorId: task.colorId, eta: task.eta }}
            submitLabel="Save"
            onSubmit={handleEditSubmit}
            onCancel={handleEditCancel}
          />
        </div>
      ) : (
        <>
          {/*
            The title line only ever shares width with the drag handle and
            the count badge, never with the action buttons below: at the
            card's rendered width (a few hundred px, set by its parent
            container, not by the viewport) there isn't room for a title
            column to stay readable next to up to seven fixed-width action
            buttons on the same line. Putting the actions on their own row
            keeps the title's flex-1/min-w-0 shrink target from collapsing
            toward zero width — see the "Title row never shares width with
            actions" implementation note for how this was measured.
          */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id={dragHandleId}
              ref={setActivatorNodeRef}
              aria-label={`Reorder ${task.title}`}
              className={`${actionButtonClass} shrink-0 cursor-grab touch-none active:cursor-grabbing`}
              {...attributes}
              {...listeners}
            >
              Reorder
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TaskColorDot colorId={task.colorId} className="h-4 w-4 shrink-0" />
              <span className="sr-only">{colorName} color.</span>
              <span aria-hidden="true" className="shrink-0 text-2xl leading-none">
                {task.emoji}
              </span>
              <span className="min-w-0 flex-1 font-medium break-words text-stone-900">{task.title}</span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-stone-600">
                {task.completed} / {task.eta}
              </span>
            </div>
          </div>

          {mode === "confirming-delete" ? (
            <div
              role="group"
              aria-labelledby={deleteConfirmPromptId}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-2"
              onKeyDown={handleCancelDeleteKeyDown}
            >
              <p id={deleteConfirmPromptId} className="text-sm text-red-900">
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
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-3 text-sm font-medium text-white outline-none hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => onPinToggle(task.id, isPinned)}
                aria-pressed={isPinned}
                aria-label={isPinned ? `Unpin ${task.title}` : `Pin ${task.title} as current task`}
                className={[actionButtonClass, isPinned ? "border-amber-700 bg-amber-100 text-amber-900" : ""].join(" ")}
              >
                {isPinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
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
