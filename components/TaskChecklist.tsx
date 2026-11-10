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
  TaskValidationError,
  createTask,
  decrementCompleted,
  deleteTask,
  incrementCompleted,
  reorderTask,
  setTaskDone,
  updateTask,
  type Task,
} from "@/lib/db";
import { useTasks } from "@/hooks/use-tasks";
import { TaskChecklistRow } from "./TaskChecklistRow";
import { TaskForm, type TaskFormValues } from "./TaskForm";

function dragHandleId(taskId: string): string {
  return `task-drag-${taskId}`;
}

function editButtonId(taskId: string): string {
  return `task-edit-${taskId}`;
}

type PendingFocus = { type: "row"; index: number } | null;

export const TASK_PANEL_HEADING_ID = "task-panel-heading";

const WRITE_FAILED = "Couldn't save that change. Your list is showing what is stored. Try again.";

// The panel's whole task surface: the add form, the list and every write a
// row can make. It owns the app's one DndContext, so there is never a second
// drag surface to cross wires with.
export function TaskChecklist() {
  const tasksQuery = useTasks();
  const tasks = useMemo(() => (tasksQuery.status === "ready" ? tasksQuery.tasks : []), [tasksQuery]);
  // The current task is the first one not ticked, in stored order. Read from
  // the stored list rather than the drag-time order so the marker does not
  // jump while a row is held.
  const currentId = useMemo(() => tasks.find((task) => !task.done)?.id ?? null, [tasks]);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const addTitleInputRef = useRef<HTMLInputElement>(null);

  // Runs once a delete's re-render lands and moves focus where the task
  // file's spec names: the row that took the deleted position, else the new
  // last row, else the add form's title. Without it the focused Delete button
  // unmounts and focus falls to <body>.
  useEffect(() => {
    if (tasksQuery.status !== "ready") return;
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const target = tasksQuery.tasks[pending.index] ?? tasksQuery.tasks[tasksQuery.tasks.length - 1];
    if (target) {
      document.getElementById(editButtonId(target.id))?.focus();
    } else {
      addTitleInputRef.current?.focus();
    }
  }, [tasksQuery]);

  // Keep the locally-reordered id list in sync with the authoritative
  // Dexie order, except mid-drag: a drag drives `orderedIds` itself (see
  // handleDragOver) and must not be overwritten by a query update that
  // still reflects the pre-drop order.
  //
  // `useLayoutEffect`, not `useEffect`: on the first "ready" render
  // `orderedIds` is still `[]`, so the list is briefly empty even though
  // `tasks` has rows. A plain effect would let the browser paint that frame.
  useLayoutEffect(() => {
    if (tasksQuery.status !== "ready") return;
    if (isDraggingRef.current) return;
    setOrderedIds(tasks.map((task) => task.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tasks is derived fresh from tasksQuery every render; depending on tasksQuery directly would re-run for the same data on every unrelated re-render.
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

  // dnd-kit's defaults read out the raw sortable id (a UUID here). These use
  // the task's title and its 1-based position instead.
  const announcements: Announcements = {
    onDragStart({ active }) {
      return `Picked up ${titleFor(active.id)}. Position ${positionFor(active.id)} of ${orderedIds.length}.`;
    },
    onDragOver({ active, over }) {
      // dnd-kit fires this once right after pickup with `over` equal to
      // `active`: say nothing so "Picked up ..." is not overwritten.
      if (!over || active.id === over.id) return undefined;
      // This runs in the same render as the drag-over event, before
      // handleDragOver has committed the new order, so `over`'s index in the
      // still-unmoved list is exactly where `arrayMove` will place `active`.
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

  function reportFailure(message: string, error: unknown) {
    console.error(message, error);
    setWriteError(WRITE_FAILED);
  }

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
    const activeId = String(event.active.id);
    const finalIndex = orderedIds.indexOf(activeId);
    const originalIndex = tasks.findIndex((task) => task.id === activeId);
    if (finalIndex === -1 || originalIndex === -1 || finalIndex === originalIndex) return;
    try {
      await reorderTask(activeId, finalIndex);
      setWriteError(null);
    } catch (error) {
      reportFailure("Failed to persist the new order", error);
      setOrderedIds(tasks.map((task) => task.id));
    }
  }

  function handleDragCancel() {
    isDraggingRef.current = false;
    setOrderedIds(tasks.map((task) => task.id));
  }

  async function handleToggleDone(id: string, done: boolean): Promise<boolean> {
    try {
      await setTaskDone(id, done);
      setWriteError(null);
      return true;
    } catch (error) {
      reportFailure("Failed to update the task", error);
      return false;
    }
  }

  // A validation failure belongs to the form field, which shows it itself. Any
  // other failure is reported only here, so the panel's alert line is the single
  // place a failed write is announced.
  async function runFormWrite(write: () => Promise<unknown>, message: string): Promise<void> {
    try {
      await write();
      setWriteError(null);
    } catch (error) {
      if (!(error instanceof TaskValidationError)) reportFailure(message, error);
      throw error;
    }
  }

  function handleAdd(values: TaskFormValues): Promise<void> {
    return runFormWrite(() => createTask(values), "Failed to add the task");
  }

  function handleEdit(id: string, values: TaskFormValues): Promise<void> {
    return runFormWrite(() => updateTask(id, values), "Failed to edit the task");
  }

  function handleIncrement(id: string) {
    incrementCompleted(id)
      .then(() => setWriteError(null))
      .catch((error: unknown) => reportFailure("Failed to add a completed pomodoro", error));
  }

  function handleDecrement(id: string) {
    decrementCompleted(id)
      .then(() => setWriteError(null))
      .catch((error: unknown) => reportFailure("Failed to remove a completed pomodoro", error));
  }

  async function handleDeleteConfirmed(id: string) {
    const index = tasks.findIndex((task) => task.id === id);
    pendingFocusRef.current = { type: "row", index };
    try {
      await deleteTask(id);
      setWriteError(null);
    } catch (error) {
      pendingFocusRef.current = null;
      reportFailure("Failed to delete the task", error);
      throw error;
    }
  }

  function handleMoveUp(id: string) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index <= 0) return;
    reorderTask(id, index - 1)
      .then(() => setWriteError(null))
      .catch((error: unknown) => reportFailure("Failed to move the task up", error));
  }

  function handleMoveDown(id: string) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1 || index >= tasks.length - 1) return;
    reorderTask(id, index + 1)
      .then(() => setWriteError(null))
      .catch((error: unknown) => reportFailure("Failed to move the task down", error));
  }

  const orderedTasks = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task] as const));
    return orderedIds.map((id) => byId.get(id)).filter((task): task is Task => task !== undefined);
  }, [orderedIds, tasks]);

  if (tasksQuery.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading your tasks…</p>;
  }

  if (tasksQuery.status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {tasksQuery.blocked
          ? "Couldn't load your tasks. Another Pomotato tab is still using an older version. Close other Pomotato tabs, then reload."
          : "Couldn't load your tasks. Pomotato keeps them in this browser's storage, so check that private browsing or a storage setting isn't blocking it, then reload."}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {writeError ? (
        <p role="alert" className="shrink-0 px-1 text-sm text-destructive">
          {writeError}
        </p>
      ) : null}
      {tasks.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          Nothing here yet. Add your first task above.
        </p>
      ) : (
        <div className="flex min-h-0 flex-col xl:-mx-1.5 xl:overflow-y-auto xl:overscroll-contain xl:px-1.5 xl:py-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{ announcements }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={orderedIds}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {orderedTasks.map((task, index) => (
                  <TaskChecklistRow
                    key={task.id}
                    task={task}
                    isCurrent={task.id === currentId}
                    canMoveUp={index > 0}
                    canMoveDown={index < orderedTasks.length - 1}
                    onToggleDone={handleToggleDone}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    onEdit={handleEdit}
                    onDeleteConfirmed={handleDeleteConfirmed}
                    dragHandleId={dragHandleId(task.id)}
                    editButtonId={editButtonId(task.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
      <div className="shrink-0 px-1">
        <TaskForm
          idPrefix="add-task"
          submitLabel="Add task"
          onSubmit={handleAdd}
          titleInputRef={addTitleInputRef}
        />
      </div>
    </div>
  )
}
