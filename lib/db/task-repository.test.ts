import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database";
import { InvalidReorderIndexError, TaskNotFoundError, TaskValidationError } from "./errors";
import {
  createTask,
  decrementCompleted,
  deleteTask,
  duplicateTask,
  getCurrentTask,
  incrementCompleted,
  listTasks,
  reorderTask,
  restoreTask,
  setTaskCompleted,
  updateTask,
} from "./task-repository";
import { displayOrder, firstNotCompleted, normalizeTask } from "./task-repository";
import type { CreateTaskInput, Task, UpdateTaskInput } from "./types";
import { resetDatabaseForTests } from "./test-utils";

// Task 016 criteria 5 (runtime half), 10-16, and the `completed` hazard.
// Every assertion that matters about storage reads the RAW row through the table.
// The repository's own return value is never the evidence that a field is absent.

beforeEach(async () => {
  await resetDatabaseForTests();
});

async function raw(): Promise<Task[]> {
  const db = await openDatabase();
  return (await db.table("tasks").toArray()) as Task[];
}

async function rawById(id: string): Promise<Record<string, unknown> | undefined> {
  const db = await openDatabase();
  return (await db.table("tasks").get(id)) as Record<string, unknown> | undefined;
}

/** Every sibling group's `order` is exactly 0..n-1, with no gaps and no repeats. */
function expectDenseGroups(rows: Task[]): void {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = row.parentId ?? "";
    groups.set(key, [...(groups.get(key) ?? []), row.order]);
  }
  for (const orders of groups.values()) {
    expect([...orders].sort((a, b) => a - b)).toEqual(orders.map((_, index) => index));
  }
}

/** An independent re-derivation of display order: top level by `order`, each parent's children right after it. */
function structuralOrder(rows: Task[]): string[] {
  const byOrder = (a: Task, b: Task) => a.order - b.order;
  const top = rows.filter((row) => row.parentId === undefined).sort(byOrder);
  const out: string[] = [];
  for (const parent of top) {
    out.push(parent.id, ...rows.filter((row) => row.parentId === parent.id).sort(byOrder).map((row) => row.id));
  }
  return out;
}

async function expectInvariant(): Promise<void> {
  const rows = await raw();
  expectDenseGroups(rows);
  expect((await listTasks()).map((row) => row.id)).toEqual(structuralOrder(rows));
  for (const row of rows) expect(row.createdAt).toBeLessThanOrEqual(row.updatedAt);
}

const LEGACY_KEYS = ["done", "eta", "position"] as const;

describe("task 016 criterion 10: the write path never reintroduces an old name", () => {
  it("createTask({ title }) stores a row with no done, eta or position key", async () => {
    const created = await createTask({ title: "Plan the week" });
    const row = await rawById(created.id);
    expect(row).toBeDefined();
    for (const key of LEGACY_KEYS) expect(key in (row ?? {})).toBe(false);
    expect(row?.completed).toBe(false);
    expect(row?.completedPomodoros).toBe(0);
    for (const key of ["parentId", "emoji", "color", "etaMinutes"]) expect(key in (row ?? {})).toBe(false);
  });

  it("a create that passes done, eta and position at runtime stores none of them and does not throw", async () => {
    const smuggled = { title: "Smuggled", done: true, eta: 3, position: 5, colorId: "tomato" } as unknown as CreateTaskInput;
    const created = await createTask(smuggled);
    const row = await rawById(created.id);
    for (const key of [...LEGACY_KEYS, "colorId"]) expect(key in (row ?? {})).toBe(false);
    expect(row?.completed).toBe(false);
  });

  it("an update that passes done, eta and position at runtime stores none of them and does not throw", async () => {
    const created = await createTask({ title: "Original" });
    const smuggled = { title: "Renamed", done: true, eta: 3, position: 5 } as unknown as UpdateTaskInput;
    await updateTask(created.id, smuggled);
    const row = await rawById(created.id);
    for (const key of LEGACY_KEYS) expect(key in (row ?? {})).toBe(false);
    expect(row?.title).toBe("Renamed");
    expect(row?.completed).toBe(false);
  });
});

describe("task 016 criterion 11: order is dense, unique and zero-based within a sibling group", () => {
  it("holds after every operation across top-level tasks and subtasks under two parents", async () => {
    const a = await createTask({ title: "A" });
    await expectInvariant();
    const b = await createTask({ title: "B" });
    await expectInvariant();
    const c = await createTask({ title: "C" });
    await expectInvariant();
    await createTask({ title: "A1", parentId: a.id });
    await expectInvariant();
    await createTask({ title: "A2", parentId: a.id });
    await expectInvariant();
    await createTask({ title: "B1", parentId: b.id });
    await expectInvariant();
    await duplicateTask(a.id);
    await expectInvariant();
    await deleteTask(b.id);
    await expectInvariant();
    await reorderTask(c.id, 0);
    await expectInvariant();
    const a1 = (await raw()).find((row) => row.title === "A1");
    await deleteTask(a1!.id);
    await expectInvariant();
  });

  it("two rows may share order 0 under different parents", async () => {
    const a = await createTask({ title: "A" });
    const b = await createTask({ title: "B" });
    await createTask({ title: "A1", parentId: a.id });
    await createTask({ title: "B1", parentId: b.id });
    // A (top, order 0), A1 (under A, order 0), B1 (under B, order 0): three rows at 0 in three groups.
    const zeros = (await raw()).filter((row) => row.order === 0);
    expect(zeros.map((row) => row.parentId ?? "top").sort()).toEqual(["top", a.id, b.id].sort());
  });
});

describe("task 016 criterion 12: subtasks are one level deep and never dangle", () => {
  it("rejects a parentId that names a subtask, writes nothing", async () => {
    const parent = await createTask({ title: "P" });
    const child = await createTask({ title: "C", parentId: parent.id });
    const before = await raw();
    await expect(createTask({ title: "Grandchild", parentId: child.id })).rejects.toBeInstanceOf(TaskValidationError);
    expect(await raw()).toEqual(before);
  });

  it("rejects a parentId that names no stored task, writes nothing", async () => {
    const before = await raw();
    await expect(createTask({ title: "Orphan", parentId: "no-such-id" })).rejects.toBeInstanceOf(TaskValidationError);
    expect(await raw()).toEqual(before);
  });

  it("a task that has children cannot be given a parentId", async () => {
    const parent = await createTask({ title: "P" });
    const other = await createTask({ title: "Q" });
    await createTask({ title: "P1", parentId: parent.id });
    await expect(updateTask(parent.id, { parentId: other.id })).rejects.toBeInstanceOf(TaskValidationError);
    await expectInvariant();
  });

  it("deleting a parent deletes its children and renumbers the top level densely", async () => {
    const a = await createTask({ title: "A" });
    const b = await createTask({ title: "B" });
    const c = await createTask({ title: "C" });
    await createTask({ title: "B1", parentId: b.id });
    await createTask({ title: "B2", parentId: b.id });
    await deleteTask(b.id);
    const rows = await raw();
    expect(rows.map((row) => row.title).sort()).toEqual(["A", "C"]);
    expect((await rawById(a.id))?.order).toBe(0);
    expect((await rawById(c.id))?.order).toBe(1);
    await expectInvariant();
  });

  it("deleting a child renumbers only its parent's group and leaves the top level alone", async () => {
    const a = await createTask({ title: "A" });
    const b = await createTask({ title: "B" });
    const a1 = await createTask({ title: "A1", parentId: a.id });
    await createTask({ title: "A2", parentId: a.id });
    const topBefore = (await raw()).filter((row) => !row.parentId).map((row) => [row.id, row.order]);
    await deleteTask(a1.id);
    const topAfter = (await raw()).filter((row) => !row.parentId).map((row) => [row.id, row.order]);
    expect(topAfter).toEqual(topBefore);
    expect((await listTasks()).filter((row) => row.parentId === a.id).map((row) => row.order)).toEqual([0]);
    expect((await rawById(b.id))?.order).toBe(1);
  });
});

describe("task 016 criterion 13: duplicate copies the task and its children, directly below the original", () => {
  it("duplicating a parent with three children yields the copy below, shifts later siblings, and copies children in order", async () => {
    const a = await createTask({ title: "Alpha", etaMinutes: 45, emoji: "🥔", color: "sage" });
    await setTaskCompleted(a.id, true);
    await incrementCompleted(a.id);
    const c1 = await createTask({ title: "Kid 1", parentId: a.id });
    await createTask({ title: "Kid 2", parentId: a.id });
    await createTask({ title: "Kid 3", parentId: a.id });
    const later = await createTask({ title: "Later" });
    const originalsBefore = new Map((await raw()).map((row) => [row.id, row]));

    const tree = await duplicateTask(a.id);
    const copy = tree.task;
    expect(copy.id).not.toBe(a.id);
    expect(copy.title).toBe("Alpha");
    expect(copy.completedPomodoros).toBe(1);
    expect(copy.completed).toBe(true);
    expect(copy.emoji).toBe("🥔");
    expect(copy.color).toBe("sage");
    expect(copy.etaMinutes).toBe(45);
    expect(copy.parentId).toBeUndefined();
    expect(copy.order).toBe(a.order + 1);
    expect(copy.createdAt).not.toBe(a.createdAt);

    const laterAfter = await rawById(later.id);
    expect(laterAfter?.order).toBe(2);

    expect(tree.children.map((row) => row.title)).toEqual(["Kid 1", "Kid 2", "Kid 3"]);
    expect(tree.children.map((row) => row.order)).toEqual([0, 1, 2]);
    expect(tree.children.map((row) => row.parentId)).toEqual([copy.id, copy.id, copy.id]);
    for (const child of tree.children) expect(child.id).not.toBe(c1.id);

    // Originals are unchanged except where the shift moved their order (updatedAt excluded
    // for the shifted row, per backend's note on criteria 13 and 15).
    const originalA = await rawById(a.id);
    expect(originalA).toEqual({ ...originalsBefore.get(a.id) });
    await expectInvariant();
  });

  it("duplicating a child produces a child of the same parent directly below it and touches no other group", async () => {
    const a = await createTask({ title: "A" });
    const b = await createTask({ title: "B" });
    const a1 = await createTask({ title: "A1", parentId: a.id });
    await createTask({ title: "A2", parentId: a.id });
    await createTask({ title: "B1", parentId: b.id });
    const bBefore = await rawById(b.id);
    const bChildBefore = (await raw()).filter((row) => row.parentId === b.id);
    const copy = (await duplicateTask(a1.id)).task;
    expect(copy.parentId).toBe(a.id);
    expect(copy.order).toBe(1);
    expect((await rawById(b.id))).toEqual(bBefore);
    expect((await raw()).filter((row) => row.parentId === b.id)).toEqual(bChildBefore);
    await expectInvariant();
  });
});

describe("task 016 criterion 14: a deleted task and its children can be restored exactly", () => {
  it("restores a middle parent with its two children at the same ids, order and fields", async () => {
    const ids: string[] = [];
    for (const title of ["One", "Two", "Three", "Four", "Five"]) {
      ids.push((await createTask({ title })).id);
    }
    const middle = ids[2];
    const kidA = await createTask({ title: "Three-a", parentId: middle });
    const kidB = await createTask({ title: "Three-b", parentId: middle });
    await setTaskCompleted(middle, true);
    await incrementCompleted(middle);
    const before = await rawById(middle);

    const tree = await deleteTask(middle);
    expect(tree.task.id).toBe(middle);
    expect(tree.children.map((row) => row.id)).toEqual([kidA.id, kidB.id]);
    expect(await rawById(middle)).toBeUndefined();

    await restoreTask(tree);
    const after = await rawById(middle);
    for (const key of ["id", "title", "completed", "completedPomodoros", "createdAt", "order"] as const) {
      expect(after?.[key]).toBe(before?.[key]);
    }
    expect((await rawById(kidA.id))?.parentId).toBe(middle);
    expect((await rawById(kidB.id))?.parentId).toBe(middle);
    expect((await rawById(kidA.id))?.order).toBe(0);
    expect((await rawById(kidB.id))?.order).toBe(1);
    expect((await listTasks()).map((row) => row.title)).toEqual(["One", "Two", "Three", "Three-a", "Three-b", "Four", "Five"]);
    await expectInvariant();
  });

  it("a recorded order beyond the group length restores the row last rather than failing", async () => {
    const one = await createTask({ title: "One" });
    const two = await createTask({ title: "Two" });
    const three = await createTask({ title: "Three" });
    const tree = await deleteTask(three.id);
    expect(tree.task.order).toBe(2);
    await deleteTask(two.id);
    // Group is now [One] (length 1); the recorded order 2 exceeds it.
    await restoreTask(tree);
    expect((await rawById(three.id))?.order).toBe(1);
    expect((await rawById(one.id))?.order).toBe(0);
    await expectInvariant();
  });

  it("restoring twice is a no-op: no duplicate row, the stored task is returned", async () => {
    const one = await createTask({ title: "One" });
    const tree = await deleteTask(one.id);
    await restoreTask(tree);
    const again = await restoreTask(tree);
    expect(again.id).toBe(one.id);
    expect((await raw()).filter((row) => row.id === one.id)).toHaveLength(1);
    await expectInvariant();
  });

  it("restoring a subtask whose parent is gone throws TaskNotFoundError and writes nothing", async () => {
    const parent = await createTask({ title: "P" });
    const kid = await createTask({ title: "K", parentId: parent.id });
    const tree = await deleteTask(kid.id);
    await deleteTask(parent.id);
    const before = await raw();
    await expect(restoreTask(tree)).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(await raw()).toEqual(before);
  });
});

describe("task 016 criterion 15: updatedAt moves on a real write and only on a real write", () => {
  it("rename, toggle, reorder, duplicate source shift and restore each move updatedAt and never createdAt", async () => {
    const a = await createTask({ title: "A" });
    const b = await createTask({ title: "B" });
    const createdBefore = (await rawById(a.id))?.createdAt;
    const stamp = async (id: string) => (await rawById(id))?.updatedAt as number;

    let prev = await stamp(a.id);
    await updateTask(a.id, { title: "A renamed" });
    expect(await stamp(a.id)).toBeGreaterThan(prev);

    prev = await stamp(a.id);
    await setTaskCompleted(a.id, true);
    expect(await stamp(a.id)).toBeGreaterThan(prev);

    prev = await stamp(b.id);
    await reorderTask(b.id, 0);
    expect(await stamp(b.id)).toBeGreaterThan(prev);

    prev = await stamp(a.id);
    await duplicateTask(b.id);
    expect(await stamp(a.id)).toBeGreaterThan(prev);

    const tree = await deleteTask(b.id);
    prev = await stamp(a.id);
    await restoreTask(tree);
    expect(await stamp(a.id)).toBeGreaterThan(prev);

    expect((await rawById(a.id))?.createdAt).toBe(createdBefore);
    await expectInvariant();
  });

  it("a write that changes nothing writes nothing and moves nothing", async () => {
    const a = await createTask({ title: "A" });
    const before = await rawById(a.id);
    await updateTask(a.id, { title: "A" });
    await setTaskCompleted(a.id, false);
    await reorderTask(a.id, 0);
    await decrementCompleted(a.id);
    expect(await rawById(a.id)).toEqual(before);
  });
});

describe("task 016 criterion 16: an empty or whitespace title is never stored", () => {
  it.each([
    ["the empty string", ""],
    ["whitespace only", "   "],
    ["101 code points", "a".repeat(101)],
  ])("createTask rejects %s with a TaskValidationError naming title, and writes nothing", async (_label, title) => {
    const before = await raw();
    const error = await createTask({ title }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TaskValidationError);
    expect((error as TaskValidationError).issues.map((issue) => issue.field)).toContain("title");
    expect(await raw()).toEqual(before);
  });

  it.each([
    ["the empty string", ""],
    ["whitespace only", "   "],
    ["101 code points", "a".repeat(101)],
  ])("updateTask rejects %s with a TaskValidationError naming title, and leaves the row as it was", async (_label, title) => {
    const created = await createTask({ title: "Kept" });
    const before = await rawById(created.id);
    const error = await updateTask(created.id, { title }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TaskValidationError);
    expect((error as TaskValidationError).issues.map((issue) => issue.field)).toContain("title");
    expect(await rawById(created.id)).toEqual(before);
  });

  it("a 100-code-point title is accepted, and a surrounding-space title is trimmed", async () => {
    const full = await createTask({ title: "b".repeat(100) });
    expect(full.title).toHaveLength(100);
    const trimmed = await createTask({ title: "  spaced  " });
    expect(trimmed.title).toBe("spaced");
  });

  it("an out-of-range reorder index is rejected with InvalidReorderIndexError", async () => {
    const a = await createTask({ title: "A" });
    await expect(createTask({ title: "B", order: 1.5 })).rejects.toBeInstanceOf(InvalidReorderIndexError);
    expect(a.id).toBeDefined();
  });
});

describe("task 016 hazard: completed is a boolean and decides the current task", () => {
  const seed = (overrides: Partial<Task>): Task => ({
    id: "x",
    title: "x",
    completed: false,
    order: 0,
    completedPomodoros: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  it("firstNotCompleted picks the first NOT completed task in display order, skipping a completed one", () => {
    const rows = [
      seed({ id: "done", title: "done", order: 0, completed: true, completedPomodoros: 2 }),
      seed({ id: "next", title: "next", order: 1 }),
    ];
    expect(firstNotCompleted(rows)?.id).toBe("next");
  });

  it("a task with completedPomodoros 5 and completed false is still eligible", () => {
    const rows = [seed({ id: "busy", order: 0, completed: false, completedPomodoros: 5 })];
    expect(firstNotCompleted(rows)?.id).toBe("busy");
  });

  it("a subtask can be the current task when it is the first not completed in display order", () => {
    const rows = [
      seed({ id: "parent", order: 0, completed: true }),
      seed({ id: "child", order: 0, parentId: "parent", completed: false }),
      seed({ id: "later", order: 1 }),
    ];
    expect(firstNotCompleted(rows)?.id).toBe("child");
  });

  it("normalizeTask coerces a non-boolean completed to false and a bad count to 0", () => {
    const bad = [
      { ...seed({ id: "n" }), completed: 2 as unknown as boolean, completedPomodoros: 3 },
      { ...seed({ id: "s" }), completed: "yes" as unknown as boolean, completedPomodoros: 1.5 },
      { ...seed({ id: "z" }), completed: undefined as unknown as boolean, completedPomodoros: -1 },
    ];
    expect(bad.map((row) => normalizeTask(row).completed)).toEqual([false, false, false]);
    // A valid count survives a bad `completed`; only an invalid count is clamped to 0.
    expect(bad.map((row) => normalizeTask(row).completedPomodoros)).toEqual([3, 0, 0]);
    expect(displayOrder(bad).every((row) => row.completed === false)).toBe(true);
  });

  it("getCurrentTask returns the first not completed task, and null once all are completed", async () => {
    const a = await createTask({ title: "A" });
    const b = await createTask({ title: "B" });
    expect((await getCurrentTask())?.id).toBe(a.id);
    await setTaskCompleted(a.id, true);
    expect((await getCurrentTask())?.id).toBe(b.id);
    await setTaskCompleted(b.id, true);
    expect(await getCurrentTask()).toBeNull();
  });

  it("incrementCompleted counts into completedPomodoros and never flips completed", async () => {
    const a = await createTask({ title: "A" });
    const bumped = await incrementCompleted(a.id);
    expect(bumped.completedPomodoros).toBe(1);
    expect(bumped.completed).toBe(false);
  });
});
