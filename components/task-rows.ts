import type { Task } from "@/lib/db";
import type { RowModel } from "./TaskChecklistRow";

/**
 * A row the user has added but that has no stored task yet. It lives only in
 * the panel's state until it has text. `afterKey` is the row it sits directly
 * below (null means the end of its group), `parentTaskId` the stored parent of
 * a subtask draft.
 */
export interface Draft {
  key: string;
  parentTaskId: string | null;
  afterKey: string | null;
}

export interface RowBlock {
  row: RowModel;
  children: RowModel[];
}

/** An in-flight reorder: the group's new key order, valid only for the query it was made against. */
export interface OrderOverride {
  base: unknown;
  parentKey: string | null;
  keys: string[];
}

interface BuildInput {
  tasks: Task[];
  drafts: Draft[];
  /** Draft key to the id of the task it became. */
  draftTaskIds: Record<string, string>;
  override: OrderOverride | null;
  base: unknown;
}

/**
 * Adds `draft` directly below its anchor. Any draft already waiting below that
 * same anchor is now below the new row instead, so blank rows stay at the end of
 * what was typed above them rather than ending up between typed rows. The list
 * stays in anchor-before-dependent order, which `buildBlocks` relies on.
 */
export function insertDraft(drafts: Draft[], draft: Draft): Draft[] {
  if (draft.afterKey === null) return [...drafts, draft];
  const waiting = (other: Draft) => other.afterKey === draft.afterKey && other.parentTaskId === draft.parentTaskId;
  const firstWaiting = drafts.findIndex(waiting);
  const at = firstWaiting === -1 ? drafts.length : firstWaiting;
  const moved = drafts.map((other) => (waiting(other) ? { ...other, afterKey: draft.key } : other));
  return [...moved.slice(0, at), draft, ...moved.slice(at)];
}

function applyOrder<T>(items: T[], keys: string[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item] as const));
  const ordered = keys.map((key) => byKey.get(key)).filter((item): item is T => item !== undefined);
  const placed = new Set(ordered.map(keyOf));
  return [...ordered, ...items.filter((item) => !placed.has(keyOf(item)))];
}

/**
 * Stored tasks (already in display order) plus drafts, as top-level blocks that
 * each own their subtasks. A task that began as a draft keeps the draft's key,
 * so the input a person is typing in is the same element before and after its
 * first write.
 */
export function buildBlocks({ tasks, drafts, draftTaskIds, override, base }: BuildInput): RowBlock[] {
  const draftKeyByTaskId = new Map(Object.entries(draftTaskIds).map(([key, id]) => [id, key] as const));
  const keyOfTask = (id: string) => draftKeyByTaskId.get(id) ?? id;

  const blocks: RowBlock[] = [];
  const blockByTaskId = new Map<string, RowBlock>();
  for (const task of tasks) {
    const key = keyOfTask(task.id);
    const row: RowModel = {
      key,
      taskId: task.id,
      parentKey: task.parentId ? keyOfTask(task.parentId) : null,
      parentTaskId: task.parentId ?? null,
      title: task.title,
      completed: task.completed,
    };
    if (task.parentId) {
      blockByTaskId.get(task.parentId)?.children.push(row);
    } else {
      const block: RowBlock = { row, children: [] };
      blocks.push(block);
      blockByTaskId.set(task.id, block);
    }
  }

  let ordered = blocks;
  if (override && override.base === base) {
    if (override.parentKey === null) {
      ordered = applyOrder(blocks, override.keys, (block) => block.row.key);
    } else {
      const block = blocks.find((candidate) => candidate.row.key === override.parentKey);
      if (block) block.children = applyOrder(block.children, override.keys, (child) => child.key);
    }
  }

  const storedIds = new Set(tasks.map((task) => task.id));
  const hasKey = (key: string) =>
    ordered.some((block) => block.row.key === key || block.children.some((child) => child.key === key));

  const place = (draft: Draft) => {
    const createdId = draftTaskIds[draft.key];
    const row: RowModel = {
      key: draft.key,
      taskId: createdId ?? null,
      parentKey: null,
      parentTaskId: draft.parentTaskId,
      title: "",
      completed: false,
    };

    if (draft.parentTaskId === null) {
      const anchorIndex = ordered.findIndex(
        (block) => block.row.key === draft.afterKey || block.children.some((child) => child.key === draft.afterKey),
      );
      const at = anchorIndex === -1 ? ordered.length : anchorIndex + 1;
      ordered = [...ordered.slice(0, at), { row, children: [] }, ...ordered.slice(at)];
    } else {
      const parent = ordered.find((block) => block.row.taskId === draft.parentTaskId);
      if (!parent) return;
      row.parentKey = parent.row.key;
      const anchorIndex = parent.children.findIndex((child) => child.key === draft.afterKey);
      const at = anchorIndex === -1 ? (draft.afterKey === parent.row.key ? 0 : parent.children.length) : anchorIndex + 1;
      parent.children = [...parent.children.slice(0, at), row, ...parent.children.slice(at)];
    }
  };

  // A draft is placed once the row it hangs below is on the list. A draft whose
  // anchor never appears (the row was deleted) goes to the end of its group.
  let waiting = drafts.filter((draft) => {
    const createdId = draftTaskIds[draft.key];
    return createdId === undefined || !storedIds.has(createdId);
  });
  while (waiting.length > 0) {
    const ready = waiting.filter((draft) => draft.afterKey === null || hasKey(draft.afterKey));
    const batch = ready.length > 0 ? ready : waiting;
    for (const draft of batch) place(draft);
    waiting = waiting.filter((draft) => !batch.includes(draft));
  }

  return ordered;
}

export function flattenBlocks(blocks: RowBlock[]): RowModel[] {
  return blocks.flatMap((block) => [block.row, ...block.children]);
}

/** "Task 2" or "Subtask 1 of task 2": what a row is called until it has a title. */
export function ordinalNames(blocks: RowBlock[]): Map<string, string> {
  const names = new Map<string, string>();
  blocks.forEach((block, blockIndex) => {
    names.set(block.row.key, `Task ${blockIndex + 1}`);
    block.children.forEach((child, childIndex) => {
      names.set(child.key, `Subtask ${childIndex + 1} of task ${blockIndex + 1}`);
    });
  });
  return names;
}
