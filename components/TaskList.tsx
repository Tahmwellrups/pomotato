"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  createTask,
  decrementCompleted,
  deleteTask,
  incrementCompleted,
  pinTask,
  reorderTask,
  unpinTask,
  updateTask,
  type Task,
} from "@/lib/db";
import { useCurrentTask } from "@/hooks/use-current-task";
import { useTasks } from "@/hooks/use-tasks";
import { TaskForm, type TaskFormValues } from "./TaskForm";
import { TaskRow } from "./TaskRow";

function dragHandleId(taskId: string): string {
  return `task-drag-${taskId}`;
}

type PendingFocus = { type: "row"; index: number } | { type: "add-title" } | null;

export function TaskList() {
  const tasksQuery = useTasks();
  const currentTaskQuery = useCurrentTask();
  const pinnedId = currentTaskQuery.status === "ready" ? currentTaskQuery.task?.id ?? null : null;
  const tasks = useMemo(() => (tasksQuery.status === "ready" ? tasksQuery.tasks : []), [tasksQuery]);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const isDraggingRef = useRef(false);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const addTitleInputRef = useRef<HTMLInputElement>(null);

  // Keep the locally-reordered id list in sync with the authoritative
  // Dexie order, except mid-drag: a drag drives `orderedIds` itself (see
  // handleDragOver) and must not be overwritten by a query update that
  // still reflects the pre-drop order.
  //
  // `useLayoutEffect`, not `useEffect`: on the very first "ready" render
  // (the transition out of "loading"), `orderedIds` is still `[]` from the
  // initial `useState([])` call, so `orderedTasks` below is briefly empty
  // even though `tasks` already has rows. A plain `useEffect` only fires
  // after the browser has painted that render, which can flash "No tasks
  // yet" for a frame despite data being present. `useLayoutEffect` commits
  // this update before paint instead, matching the same before-paint,
  // post-hydration pattern `useHydrateTimerStore` already uses for task
  // 001's store.
  useLayoutEffect(() => {
    // Also guards against a non-stable "loading" query object (defense in
    // depth on top of the stable reference `useTasks` now returns): there
    // is nothing useful to sync before the first resolved read, so skip the
    // effect entirely until then rather than writing an empty array that
    // could otherwise re-trigger this effect on every render.
    if (tasksQuery.status !== "ready") return;
    if (isDraggingRef.current) return;
    setOrderedIds(tasks.map((task) => task.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tasks is derived fresh from tasksQuery every render; depending on tasksQuery directly would re-run for the same data on every unrelated re-render.
  }, [tasksQuery]);

  // Runs once the delete's resulting re-render lands, moving focus to
  // whatever the task file's spec names as the target: the row that took
  // the deleted position, the new last row, or the add form.
  useEffect(() => {
    if (tasksQuery.status !== "ready") return;
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    if (pending.type === "add-title") {
      addTitleInputRef.current?.focus();
      return;
    }
    const target = tasksQuery.tasks[pending.index] ?? tasksQuery.tasks[tasksQuery.tasks.length - 1];
    if (target) {
      document.getElementById(dragHandleId(target.id))?.focus();
    } else {
      addTitleInputRef.current?.focus();
    }
  }, [tasksQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function titleFor(id: UniqueIdentifier): string {
    return tasks.find((task) => task.id === id)?.title ?? "the task";
  }

  function positionFor(id: UniqueIdentifier): number {
    const index = orderedIds.indexOf(String(id));
    return index === -1 ? 0 : index + 1;
  }

  // Custom announcements: dnd-kit's defaults read out the raw sortable id
  // (a UUID here), which the task file's criteria forbid. These use the
  // task's title and its 1-based position instead, for pickup, every move,
  // drop, and cancel.
  const announcements: Announcements = {
    onDragStart({ active }) {
      return `Picked up ${titleFor(active.id)}. Position ${positionFor(active.id)} of ${orderedIds.length}.`;
    },
    onDragOver({ active, over }) {
      // No movement yet (dnd-kit fires this once right after pickup with
      // `over` equal to `active`): say nothing so the "Picked up …"
      // announcement from onDragStart isn't immediately overwritten.
      if (!over || active.id === over.id) return undefined;
      // dnd-kit batches this callback with the live-region update in the
      // same render as the drag-over event itself, before `handleDragOver`
      // below has committed `setOrderedIds(arrayMove(...))`. Reading
      // `positionFor(active.id)` here would report where `active` *was*,
      // not where it's landing. `over`'s index in the still-unmoved
      // `orderedIds` is exactly where `arrayMove` will place `active`, so
      // use that instead.
      const targetIndex = orderedIds.indexOf(String(over.id));
      const position = targetIndex === -1 ? positionFor(active.id) : targetIndex + 1;
      return `${titleFor(active.id)} moved to position ${position} of ${orderedIds.length}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `Dropped ${titleFor(active.id)}.`;
      return `Dropped ${titleFor(active.id)}. Position ${positionFor(active.id)} of ${orderedIds.length}.`;
    },
    onDragCancel({ active }) {
      return `Cancelled. ${titleFor(active.id)} returned to its original position.`;
    },
  };

  function handleDragStart() {
    isDraggingRef.current = true;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedIds((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    isDraggingRef.current = false;
    const { active } = event;
    const activeId = String(active.id);
    const finalIndex = orderedIds.indexOf(activeId);
    const originalIndex = tasks.findIndex((task) => task.id === activeId);
    if (finalIndex === -1 || originalIndex === -1 || finalIndex === originalIndex) return;
    try {
      await reorderTask(activeId, finalIndex);
    } catch (error) {
      console.error("Failed to persist the new order", error);
      setOrderedIds(tasks.map((task) => task.id));
    }
  }

  function handleDragCancel() {
    isDraggingRef.current = false;
    setOrderedIds(tasks.map((task) => task.id));
  }

  async function handleAdd(values: TaskFormValues) {
    await createTask(values);
  }

  async function handleEdit(id: string, values: TaskFormValues) {
    await updateTask(id, values);
  }

  function handlePinToggle(id: string, currentlyPinned: boolean) {
    const action = currentlyPinned ? unpinTask(id) : pinTask(id);
    action.catch((error: unknown) => {
      console.error("Failed to update the pinned task", error);
    });
  }

  function handleIncrement(id: string) {
    incrementCompleted(id).catch((error: unknown) => {
      console.error("Failed to add a completed pomodoro", error);
    });
  }

  function handleDecrement(id: string) {
    decrementCompleted(id).catch((error: unknown) => {
      console.error("Failed to remove a completed pomodoro", error);
    });
  }

  async function handleDeleteConfirmed(id: string) {
    const index = tasks.findIndex((task) => task.id === id);
    pendingFocusRef.current = { type: "row", index };
    try {
      await deleteTask(id);
    } catch (error) {
      pendingFocusRef.current = null;
      throw error;
    }
  }

  function handleMoveUp(id: string) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index <= 0) return;
    reorderTask(id, index - 1).catch((error: unknown) => {
      console.error("Failed to move the task up", error);
    });
  }

  function handleMoveDown(id: string) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1 || index >= tasks.length - 1) return;
    reorderTask(id, index + 1).catch((error: unknown) => {
      console.error("Failed to move the task down", error);
    });
  }

  const orderedTasks = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task] as const));
    return orderedIds.map((id) => byId.get(id)).filter((task): task is Task => task !== undefined);
  }, [orderedIds, tasks]);

  return (
    <section aria-labelledby="task-list-heading" className="flex w-full flex-col gap-6">
      <h2 id="task-list-heading" className="text-lg font-semibold text-stone-900">
        Tasks
      </h2>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-stone-700">Add a task</h3>
        <TaskForm idPrefix="add-task" submitLabel="Add task" onSubmit={handleAdd} titleInputRef={addTitleInputRef} />
      </div>

      {tasksQuery.status === "loading" ? (
        <p role="status" className="text-sm text-stone-600">
          Loading your tasks…
        </p>
      ) : tasksQuery.status === "error" ? (
        <p role="alert" className="text-sm text-red-700">
          Couldn&apos;t load your tasks. Try reloading the page.
        </p>
      ) : orderedTasks.length === 0 ? (
        <p className="text-sm text-stone-600">No tasks yet. Add your first one above.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-3">
              {orderedTasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isPinned={task.id === pinnedId}
                  canMoveUp={index > 0}
                  canMoveDown={index < orderedTasks.length - 1}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onPinToggle={handlePinToggle}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onEdit={handleEdit}
                  onDeleteConfirmed={handleDeleteConfirmed}
                  dragHandleId={dragHandleId(task.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
