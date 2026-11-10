"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  getFirstCollision,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { RiAddLine } from "react-icons/ri";
import {
  TaskNotFoundError,
  createTask,
  deleteTask,
  duplicateTask,
  reorderTask,
  restoreTask,
  setTaskCompleted,
  updateTask,
  type TaskTree,
} from "@/lib/db";
import { useTasks } from "@/hooks/use-tasks";
import { TaskChecklistRow, type NavigateDirection, type RowModel } from "./TaskChecklistRow";
import { UndoToast } from "./UndoToast";
import { buildBlocks, flattenBlocks, insertDraft, ordinalNames, type Draft, type OrderOverride } from "./task-rows";

export const TASK_PANEL_HEADING_ID = "task-panel-heading";

const WRITE_FAILED = "Couldn't save that change. Your list is showing what is stored. Try again.";

// How long Undo stays on screen. Flat: it does not pause on focus or hover.
const UNDO_WINDOW_MS = 5000;

// An empty stored list opens with three blank rows, chained so they sit in order.
const INITIAL_PLACEHOLDERS: Draft[] = [
  { key: "draft-start-1", parentTaskId: null, afterKey: null },
  { key: "draft-start-2", parentTaskId: null, afterKey: "draft-start-1" },
  { key: "draft-start-3", parentTaskId: null, afterKey: "draft-start-2" },
];

interface PendingFocus {
  key: string;
  expires: number;
}

interface UndoState {
  tree: TaskTree;
  message: string;
}

function parentKeyOf(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "parentKey" in data) {
    const { parentKey } = data as { parentKey: unknown };
    return typeof parentKey === "string" ? parentKey : null;
  }
  return null;
}

// A drag only ever competes with rows of its own group, so a subtask cannot be
// dropped among top-level tasks and a parent is never dropped between a task
// and its children.
const sameGroupCollisions: CollisionDetection = (args) => {
  const parentKey = parentKeyOf(args.active.data.current);
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => parentKeyOf(container.data.current) === parentKey),
  });
};

// dnd-kit's stock sortableKeyboardCoordinates looks at every droppable on the
// page, which would let a subtask's arrow key jump to a top-level row. This is
// the same lookup restricted to the dragged row's own group.
const sameGroupKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (event.code !== "ArrowDown" && event.code !== "ArrowUp") return undefined;
  event.preventDefault();
  const { active, collisionRect, droppableRects, droppableContainers, over } = context;
  if (!active || !collisionRect) return undefined;

  const movingDown = event.code === "ArrowDown";
  const parentKey = parentKeyOf(active.data.current);
  const candidates = droppableContainers.getEnabled().filter((container) => {
    if (parentKeyOf(container.data.current) !== parentKey) return false;
    const rect = droppableRects.get(container.id);
    if (!rect) return false;
    return movingDown ? collisionRect.top < rect.top : collisionRect.top > rect.top;
  });

  const collisions = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null,
  });
  let closestId = getFirstCollision(collisions, "id");
  if (closestId === over?.id && collisions.length > 1) closestId = collisions[1].id;
  if (closestId == null) return undefined;

  const target = droppableRects.get(closestId);
  if (!target) return undefined;
  return movingDown
    ? { x: target.left + collisionRect.width - target.width, y: target.top + collisionRect.height - target.height }
    : { x: target.left, y: target.top };
};

// The panel's whole task surface: the list, the rows' writes, the undo toast
// and the one failure line. It owns the app's one DndContext, so there is never
// a second drag surface to cross wires with.
//
// Rows are typed into where they stand. A row with no text is a draft that
// exists only here; the first non-empty title writes it, in place, and it keeps
// its key so the caret never moves. Every write goes through one queue, so a
// row's create always lands before the write that depends on it.
export function TaskChecklist() {
  const tasksQuery = useTasks();
  const tasks = useMemo(() => (tasksQuery.status === "ready" ? tasksQuery.tasks : []), [tasksQuery]);

  // The current task is the first one not completed, in display order. This
  // names the one field that means "finished"; `completedPomodoros` is a count
  // and would silently mean "no pomodoros yet".
  const currentTaskId = useMemo(() => tasks.find((task) => !task.completed)?.id ?? null, [tasks]);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftTaskIds, setDraftTaskIds] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);
  const [override, setOverride] = useState<OrderOverride | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const taskIdByKeyRef = useRef(new Map<string, string>());
  const deletedIdsRef = useRef(new Set<string>());
  const draftCounterRef = useRef(0);
  const flatRef = useRef<RowModel[]>([]);

  if (tasksQuery.status === "ready" && !seeded) {
    setSeeded(true);
    if (tasksQuery.tasks.length === 0) setDrafts(INITIAL_PLACEHOLDERS);
  }

  const blocks = useMemo(
    () => buildBlocks({ tasks, drafts, draftTaskIds, override, base: tasksQuery }),
    [tasks, drafts, draftTaskIds, override, tasksQuery],
  );
  const flat = useMemo(() => flattenBlocks(blocks), [blocks]);
  const names = useMemo(() => ordinalNames(blocks), [blocks]);

  const currentKey = useMemo(
    () => flat.find((row) => row.taskId !== null && row.taskId === currentTaskId)?.key ?? null,
    [flat, currentTaskId],
  );

  const focusInput = useCallback((key: string): boolean => {
    const input = inputRefs.current.get(key);
    if (!input) return false;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    return true;
  }, []);

  const requestFocus = useCallback((key: string) => {
    pendingFocusRef.current = { key, expires: Date.now() + 2000 };
  }, []);

  // Keeps the refs the write queue reads in step with what is on screen, and
  // lands a focus request once its row exists.
  useLayoutEffect(() => {
    flatRef.current = flat;
    for (const row of flat) {
      if (row.taskId !== null) taskIdByKeyRef.current.set(row.key, row.taskId);
    }
    const pending = pendingFocusRef.current;
    if (!pending) return;
    if (Date.now() > pending.expires || focusInput(pending.key)) pendingFocusRef.current = null;
  });

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sameGroupKeyboardCoordinates }),
  );

  const reportFailure = useCallback((message: string, error: unknown) => {
    console.error(message, error);
    setWriteError(WRITE_FAILED);
  }, []);

  const enqueue = useCallback(<T,>(write: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(write);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  function nextDraftKey(): string {
    draftCounterRef.current += 1;
    return `draft-${draftCounterRef.current}`;
  }

  const isStoredKey = useCallback((key: string): boolean => taskIdByKeyRef.current.has(key), []);

  // Where a row typed at `key` belongs among its stored siblings: the count of
  // stored rows of the same group above it. Blank siblings above it do not count.
  const insertionIndex = useCallback(
    (key: string): number => {
      const rows = flatRef.current;
      const at = rows.findIndex((row) => row.key === key);
      if (at === -1) return rows.length;
      const group = rows[at].parentKey;
      return rows.slice(0, at).filter((row) => row.parentKey === group && (row.taskId !== null || isStoredKey(row.key)))
        .length;
    },
    [isStoredKey],
  );

  const saveTitle = useCallback(
    (row: RowModel, title: string): Promise<boolean> =>
      enqueue(async () => {
        const taskId = taskIdByKeyRef.current.get(row.key) ?? row.taskId;
        if (taskId !== null && deletedIdsRef.current.has(taskId)) return true;
        try {
          if (taskId !== null) {
            await updateTask(taskId, { title });
          } else {
            const created = await createTask({
              title,
              order: insertionIndex(row.key),
              ...(row.parentTaskId !== null ? { parentId: row.parentTaskId } : {}),
            });
            taskIdByKeyRef.current.set(row.key, created.id);
            setDraftTaskIds((current) => ({ ...current, [row.key]: created.id }));
          }
          setWriteError(null);
          return true;
        } catch (error) {
          reportFailure("Failed to save the task title", error);
          return false;
        }
      }),
    [enqueue, insertionIndex, reportFailure],
  );

  const toggleRow = useCallback(
    (row: RowModel, completed: boolean): Promise<boolean> =>
      enqueue(async () => {
        const taskId = taskIdByKeyRef.current.get(row.key) ?? row.taskId;
        if (taskId === null) return false;
        try {
          await setTaskCompleted(taskId, completed);
          setWriteError(null);
          return true;
        } catch (error) {
          reportFailure("Failed to update the task", error);
          return false;
        }
      }),
    [enqueue, reportFailure],
  );

  function addDraft(draft: Draft) {
    setDrafts((current) => insertDraft(current, draft));
    requestFocus(draft.key);
  }

  function handleAddTask() {
    const last = flat[flat.length - 1];
    addDraft({ key: nextDraftKey(), parentTaskId: null, afterKey: last ? last.key : null });
  }

  function handleEnter(row: RowModel) {
    addDraft({ key: nextDraftKey(), parentTaskId: row.parentTaskId, afterKey: row.key });
  }

  function handleAddSubtask(row: RowModel) {
    const taskId = taskIdByKeyRef.current.get(row.key) ?? row.taskId;
    if (taskId === null) return;
    const block = blocks.find((candidate) => candidate.row.key === row.key);
    const lastChild = block?.children[block.children.length - 1];
    addDraft({ key: nextDraftKey(), parentTaskId: taskId, afterKey: lastChild ? lastChild.key : row.key });
  }

  function handleDuplicate(row: RowModel) {
    const taskId = taskIdByKeyRef.current.get(row.key) ?? row.taskId;
    if (taskId === null) return;
    void enqueue(async () => {
      try {
        await duplicateTask(taskId);
        setWriteError(null);
      } catch (error) {
        reportFailure("Failed to duplicate the task", error);
      }
    });
  }

  function handleNavigate(row: RowModel, direction: NavigateDirection) {
    const at = flat.findIndex((candidate) => candidate.key === row.key);
    const target = flat[direction === "up" ? at - 1 : at + 1];
    if (target) focusInput(target.key);
  }

  function removeDraft(key: string) {
    setDrafts((current) => {
      const removed = current.find((draft) => draft.key === key);
      if (!removed) return current;
      return current
        .filter((draft) => draft.key !== key)
        .map((draft) => (draft.afterKey === key ? { ...draft, afterKey: removed.afterKey } : draft));
    });
  }

  // The row after `row` and its subtasks, for when there is no row above to land on.
  function rowAfterBlock(row: RowModel): RowModel | undefined {
    const at = flat.findIndex((candidate) => candidate.key === row.key);
    return flat.slice(at + 1).find((candidate) => candidate.parentKey !== row.key);
  }

  async function deleteStored(taskId: string) {
    const treeKeys = new Set<string>();
    try {
      const tree = await enqueue(() => deleteTask(taskId));
      for (const task of [tree.task, ...tree.children]) {
        deletedIdsRef.current.add(task.id);
        treeKeys.add(task.id);
      }
      // A task that began as a draft is addressed by its draft key until it is
      // deleted; drop that link so an undo restores it under its own id.
      setDrafts((current) => current.filter((draft) => !treeKeys.has(draftTaskIds[draft.key] ?? "")));
      setDraftTaskIds((current) =>
        Object.fromEntries(Object.entries(current).filter(([, id]) => !treeKeys.has(id))),
      );
      const subtasks = tree.children.length;
      setUndo({
        tree,
        message: `Deleted “${tree.task.title}”${
          subtasks > 0 ? ` and ${subtasks} ${subtasks === 1 ? "subtask" : "subtasks"}` : ""
        }`,
      });
      setWriteError(null);
    } catch (error) {
      reportFailure("Failed to delete the task", error);
    }
  }

  // `from` says where focus goes: after Backspace on an empty row it goes to the
  // row above; after the menu's Delete it goes to Add task, so Undo is the next
  // stop of the tab order.
  function handleDelete(row: RowModel, from: "backspace" | "menu") {
    const taskId = taskIdByKeyRef.current.get(row.key) ?? row.taskId;
    const at = flat.findIndex((candidate) => candidate.key === row.key);

    if (from === "backspace") {
      if (flat.length <= 1) return;
      const landing = flat[at - 1] ?? rowAfterBlock(row);
      if (landing) focusInput(landing.key);
    } else if (taskId === null) {
      const landing = flat[at - 1] ?? rowAfterBlock(row);
      if (landing) focusInput(landing.key);
      else addButtonRef.current?.focus();
    } else {
      addButtonRef.current?.focus();
    }

    if (taskId === null) {
      removeDraft(row.key);
      return;
    }
    void deleteStored(taskId);
  }

  async function handleUndo() {
    const current = undo;
    if (!current) return;
    try {
      await enqueue(() => restoreTask(current.tree));
      for (const task of [current.tree.task, ...current.tree.children]) deletedIdsRef.current.delete(task.id);
      requestFocus(current.tree.task.id);
      setUndo(null);
      setWriteError(null);
    } catch (error) {
      if (error instanceof TaskNotFoundError) setUndo(null);
      reportFailure("Failed to restore the task", error);
    }
  }

  function groupKeys(key: string): string[] {
    for (const block of blocks) {
      if (block.row.key === key) return blocks.map((candidate) => candidate.row.key);
      if (block.children.some((child) => child.key === key)) return block.children.map((child) => child.key);
    }
    return [];
  }

  function nameFor(id: UniqueIdentifier): string {
    const row = flat.find((candidate) => candidate.key === id);
    if (!row) return "the task";
    return row.title !== "" ? row.title : (names.get(row.key) ?? "the task");
  }

  function positionFor(id: UniqueIdentifier): { position: number; total: number } {
    const keys = groupKeys(String(id)).filter(isStoredKey);
    const index = keys.indexOf(String(id));
    return { position: index === -1 ? 0 : index + 1, total: keys.length };
  }

  // dnd-kit's defaults read out the raw sortable id. These use the task's title
  // and its 1-based position within its own group instead.
  const announcements: Announcements = {
    onDragStart({ active }) {
      const { position, total } = positionFor(active.id);
      return `Picked up ${nameFor(active.id)}. Position ${position} of ${total}.`;
    },
    onDragOver({ active, over }) {
      // dnd-kit fires this once right after pickup with `over` equal to
      // `active`: say nothing so "Picked up ..." is not overwritten.
      if (!over || active.id === over.id) return undefined;
      const { position, total } = positionFor(over.id);
      return `${nameFor(active.id)} moved to position ${position} of ${total}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `Dropped ${nameFor(active.id)}.`;
      const { position, total } = positionFor(over.id);
      return `Dropped ${nameFor(active.id)}. Position ${position} of ${total}.`;
    },
    onDragCancel({ active }) {
      return `Cancelled. ${nameFor(active.id)} returned to its original position.`;
    },
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeKey = String(active.id);
    const parentKey = parentKeyOf(active.data.current);
    const keys = groupKeys(activeKey);
    const from = keys.indexOf(activeKey);
    const to = keys.indexOf(String(over.id));
    const taskId = taskIdByKeyRef.current.get(activeKey);
    if (from === -1 || to === -1 || taskId === undefined) return;

    // Blank rows that hung below the moved row stay where they were, hanging
    // below the row that was above it, rather than riding along with the drop.
    const blockKeys = new Set([activeKey, ...(blocks.find((b) => b.row.key === activeKey)?.children.map((c) => c.key) ?? [])]);
    const previousKey = parentKey === null ? (flat[flat.findIndex((row) => row.key === activeKey) - 1]?.key ?? null) : (keys[from - 1] ?? parentKey);
    setDrafts((current) =>
      current.map((draft) =>
        draft.afterKey !== null && blockKeys.has(draft.afterKey) && (parentKey === null ? draft.parentTaskId === null : draft.parentTaskId !== null)
          ? { ...draft, afterKey: previousKey }
          : draft,
      ),
    );

    const reordered = arrayMove(keys, from, to);
    // Blank rows are not stored, so the stored index counts stored rows only.
    const storedIndex = reordered.slice(0, to).filter(isStoredKey).length;
    setOverride({ base: tasksQuery, parentKey, keys: reordered });
    void enqueue(async () => {
      try {
        await reorderTask(taskId, storedIndex);
        setWriteError(null);
      } catch (error) {
        setOverride(null);
        reportFailure("Failed to persist the new order", error);
      }
    });
  }

  const registerInput = useCallback((key: string, element: HTMLInputElement | null) => {
    if (element) inputRefs.current.set(key, element);
    else inputRefs.current.delete(key);
  }, []);

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

  function renderRow(row: RowModel, children?: React.ReactNode) {
    return (
      <TaskChecklistRow
        key={row.key}
        row={row}
        ordinalName={names.get(row.key) ?? "Task"}
        isCurrent={row.key === currentKey}
        registerInput={registerInput}
        onSaveTitle={saveTitle}
        onToggle={toggleRow}
        onEnter={handleEnter}
        onBackspaceEmpty={(target) => handleDelete(target, "backspace")}
        onNavigate={handleNavigate}
        onAddSubtask={handleAddSubtask}
        onDuplicate={handleDuplicate}
        onDelete={(target) => handleDelete(target, "menu")}
      >
        {children}
      </TaskChecklistRow>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {writeError ? (
        <p role="alert" className="shrink-0 px-1 text-sm text-destructive">
          {writeError}
        </p>
      ) : null}
      {flat.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No tasks yet. Add one below.</p>
      ) : (
        <div className="-mx-0.5 min-h-0 max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain px-0.5 py-0.5 xl:max-h-none">
          <DndContext
            sensors={sensors}
            collisionDetection={sameGroupCollisions}
            accessibility={{ announcements }}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={blocks.map((block) => block.row.key)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-1">
                {blocks.map((block) =>
                  renderRow(
                    block.row,
                    block.children.length > 0 ? (
                      <SortableContext
                        items={block.children.map((child) => child.key)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="ml-4 flex flex-col gap-1 sm:ml-6">
                          {block.children.map((child) => renderRow(child))}
                        </ul>
                      </SortableContext>
                    ) : undefined,
                  ),
                )}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
      <div className="flex shrink-0 flex-col gap-2">
        <button
          ref={addButtonRef}
          type="button"
          onClick={handleAddTask}
          className="flex min-h-11 w-full cursor-pointer justify-center items-center gap-2 rounded-lg px-3 text-sm font-medium text-secondary-foreground outline-none hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring forced-colors:border"
        >
          <RiAddLine aria-hidden="true" className="size-4 shrink-0 font-bold" />
          Add task
        </button>
        <UndoToast message={undo?.message ?? null} onUndo={handleUndo} />
      </div>
    </div>
  );
}
