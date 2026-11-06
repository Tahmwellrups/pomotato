import { describe, it, expect, beforeEach } from "vitest";
import {
  createTask,
  updateTask,
  deleteTask,
  reorderTask,
  setTaskDone,
  incrementCompleted,
  decrementCompleted,
  listTasks,
  getCurrentTask,
} from "./task-repository";
import { TaskValidationError, TaskNotFoundError, InvalidReorderIndexError, InvalidDoneValueError } from "./errors";
import { resetDatabaseForTests } from "./test-utils";
import { openDatabase } from "./database";

describe("Task Repository", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  describe("createTask - field validation", () => {
    describe("title validation", () => {
      it("rejects empty title", async () => {
        try {
          await createTask({ title: "" });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
          if (err instanceof TaskValidationError) {
            expect(err.issues.some((issue) => issue.field === "title")).toBe(true);
          }
        }
      });

      it("rejects whitespace-only title", async () => {
        try {
          await createTask({ title: "   " });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects title over 100 characters", async () => {
        const longTitle = "a".repeat(101);
        try {
          await createTask({ title: longTitle });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("accepts 1-character title", async () => {
        const task = await createTask({ title: "a" });
        expect(task.title).toBe("a");
      });

      it("accepts 100-character title", async () => {
        const title100 = "a".repeat(100);
        const task = await createTask({ title: title100 });
        expect(task.title).toBe(title100);
      });

      it("trims leading and trailing whitespace before validating", async () => {
        const task = await createTask({ title: "  hello world  " });
        expect(task.title).toBe("hello world");
      });

      it("counts Unicode code points, not UTF-16 code units", async () => {
        const emojiTitle = "Task " + "🥔".repeat(5); // 5 emoji = 5 code points
        const task = await createTask({ title: emojiTitle });
        expect(task.title).toBe(emojiTitle);
      });
    });

    describe("v5: the write path never stores emoji or colorId (task 015 criterion 10)", () => {
      const rawRows = async () => (await openDatabase()).table("tasks").toArray() as Promise<Array<Record<string, unknown>>>;

      it("createTask({ title, eta }) stores a row with neither key", async () => {
        await createTask({ title: "clean", eta: 3 });
        const rows = await rawRows();
        expect(rows).toHaveLength(1);
        expect("emoji" in rows[0]).toBe(false);
        expect("colorId" in rows[0]).toBe(false);
      });

      it("a createTask call that passes emoji and colorId at runtime stores neither and does not throw", async () => {
        const runtime = { title: "smuggled", eta: 2, emoji: "🥔", colorId: "tomato" } as unknown as Parameters<typeof createTask>[0];
        await expect(createTask(runtime)).resolves.toBeDefined();
        const rows = await rawRows();
        expect("emoji" in rows[0]).toBe(false);
        expect("colorId" in rows[0]).toBe(false);
      });

      it("updateTask with emoji or colorId at runtime stores neither on the raw row", async () => {
        const task = await createTask({ title: "to update", eta: 1 });
        const runtime = { emoji: "🥔", colorId: "tomato", title: "renamed" } as unknown as Parameters<typeof updateTask>[1];
        await updateTask(task.id, runtime);
        const rows = await rawRows();
        expect(rows[0].title).toBe("renamed");
        expect("emoji" in rows[0]).toBe(false);
        expect("colorId" in rows[0]).toBe(false);
      });
    });

    describe("eta validation", () => {
      it("rejects eta 0", async () => {
        try {
          await createTask({ title: "test", eta: 0 });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects negative eta", async () => {
        try {
          await createTask({ title: "test", eta: -5 });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects eta over 20", async () => {
        try {
          await createTask({ title: "test", eta: 21 });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects decimal eta", async () => {
        try {
          await createTask({ title: "test", eta: 2.5 });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("accepts eta 1", async () => {
        const task = await createTask({ title: "test", eta: 1 });
        expect(task.eta).toBe(1);
      });

      it("accepts eta 20", async () => {
        const task = await createTask({ title: "test", eta: 20 });
        expect(task.eta).toBe(20);
      });

      it("uses default eta 1 when not provided", async () => {
        const task = await createTask({ title: "test" });
        expect(task.eta).toBe(1);
      });
    });

    it("collects all validation failures at once", async () => {
      try {
        await createTask({
          title: "",
          eta: 0,
        });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskValidationError);
        if (err instanceof TaskValidationError) {
          const failedFields = err.issues.map((issue) => issue.field);
          expect(failedFields).toContain("title");
          expect(failedFields).not.toContain("emoji");
          expect(failedFields).not.toContain("colorId");
          expect(failedFields).toContain("eta");
        }
      }
    });
  });

  describe("createTask - defaults and behavior", () => {
    it("returns task with generated id", async () => {
      const task = await createTask({ title: "test" });
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe("string");
      expect(task.id.length).toBeGreaterThan(0);
    });

    it("returns task with completed: 0", async () => {
      const task = await createTask({ title: "test" });
      expect(task.completed).toBe(0);
    });

    it("appends task to end of list", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });
      const task3 = await createTask({ title: "third" });

      expect(task1.position).toBe(0);
      expect(task2.position).toBe(1);
      expect(task3.position).toBe(2);
    });

    it("persists and returns stored record", async () => {
      const input = { title: "test task", emoji: "🎯", colorId: "tomato" as const, eta: 5 };
      const created = await createTask(input);
      const tasks = await listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual(created);
    });
  });

  describe("updateTask - field validation", () => {
    let taskId: string;

    beforeEach(async () => {
      const task = await createTask({ title: "original" });
      taskId = task.id;
    });

    it("rejects invalid title", async () => {
      try {
        await updateTask(taskId, { title: "" });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskValidationError);
      }
    });

    it("rejects invalid eta", async () => {
      try {
        await updateTask(taskId, { eta: 0 });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskValidationError);
      }
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      try {
        await updateTask("non-existent-id", { title: "new title" });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskNotFoundError);
      }
    });

    it("updates only provided fields", async () => {
      await updateTask(taskId, { title: "updated title" });
      const tasks = await listTasks();
      expect(tasks[0].title).toBe("updated title");
      expect("emoji" in tasks[0]).toBe(false);
      expect(tasks[0].eta).toBe(1);
    });

    it("does not touch completed count", async () => {
      await incrementCompleted(taskId);
      await updateTask(taskId, { title: "updated" });
      const tasks = await listTasks();
      expect(tasks[0].completed).toBe(1);
    });

    it("does not touch position", async () => {
      await createTask({ title: "second" });
      await updateTask(taskId, { title: "first renamed" });
      const tasks = await listTasks();
      expect(tasks[0].position).toBe(0);
      expect(tasks[1].position).toBe(1);
    });
  });

  describe("deleteTask", () => {
    it("removes task from list", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });

      await deleteTask(task1.id);

      const tasks = await listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task2.id);
    });

    it("renumbers remaining positions to be dense", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });
      const task3 = await createTask({ title: "third" });

      await deleteTask(task2.id);

      const tasks = await listTasks();
      expect(tasks.map((t) => t.position)).toEqual([0, 1]);
    });

    it("preserves relative order of remaining tasks", async () => {
      const task1 = await createTask({ title: "a" });
      const task2 = await createTask({ title: "b" });
      const task3 = await createTask({ title: "c" });
      const task4 = await createTask({ title: "d" });

      await deleteTask(task2.id);

      const tasks = await listTasks();
      expect(tasks.map((t) => t.title)).toEqual(["a", "c", "d"]);
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      try {
        await deleteTask("non-existent-id");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskNotFoundError);
      }
    });

    it("deleting the current task makes the next not-done task current", async () => {
      const first = await createTask({ title: "first" });
      const second = await createTask({ title: "second" });
      expect((await getCurrentTask())?.id).toBe(first.id);

      await deleteTask(first.id);

      expect((await getCurrentTask())?.id).toBe(second.id);
    });

    it("deleting a task after the current one leaves the current task unchanged", async () => {
      const first = await createTask({ title: "first" });
      const second = await createTask({ title: "second" });

      await deleteTask(second.id);

      expect((await getCurrentTask())?.id).toBe(first.id);
    });
  });

  describe("reorderTask", () => {
    let taskIds: string[] = [];

    beforeEach(async () => {
      const tasks = await Promise.all([
        createTask({ title: "a" }),
        createTask({ title: "b" }),
        createTask({ title: "c" }),
        createTask({ title: "d" }),
        createTask({ title: "e" }),
      ]);
      taskIds = tasks.map((t) => t.id);
    });

    it("moves task from position A to position B", async () => {
      // Move 'a' (index 0) to index 2 (after 'c')
      const result = await reorderTask(taskIds[0], 2);
      expect(result.map((t) => t.title)).toEqual(["b", "c", "a", "d", "e"]);
    });

    it("moves task from middle to beginning", async () => {
      // Move 'c' (index 2) to index 0
      const result = await reorderTask(taskIds[2], 0);
      expect(result.map((t) => t.title)).toEqual(["c", "a", "b", "d", "e"]);
    });

    it("moves task from middle to end", async () => {
      // Move 'b' (index 1) to index 4 (end)
      const result = await reorderTask(taskIds[1], 4);
      expect(result.map((t) => t.title)).toEqual(["a", "c", "d", "e", "b"]);
    });

    it("moving to same position writes nothing", async () => {
      // Get initial order
      const initialTasks = await listTasks();
      // Move 'b' (index 1) to index 1 (same position)
      const result = await reorderTask(taskIds[1], 1);

      const afterTasks = await listTasks();
      expect(afterTasks.map((t) => t.title)).toEqual(initialTasks.map((t) => t.title));
    });

    it("clamps target to list bounds", async () => {
      // Try to move to position 100 (beyond end)
      const result = await reorderTask(taskIds[0], 100);
      expect(result.map((t) => t.title)).toEqual(["b", "c", "d", "e", "a"]);
    });

    it("clamps negative target to 0", async () => {
      // Try to move to position -10
      const result = await reorderTask(taskIds[4], -10);
      expect(result.map((t) => t.title)).toEqual(["e", "a", "b", "c", "d"]);
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      try {
        await reorderTask("non-existent-id", 0);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskNotFoundError);
      }
    });

    it("rejects a NaN target index and writes nothing", async () => {
      const before = await listTasks();
      try {
        await reorderTask(taskIds[0], NaN);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidReorderIndexError);
      }
      const after = await listTasks();
      expect(after.map((t) => t.id)).toEqual(before.map((t) => t.id));
    });

    it("rejects a fractional target index and writes nothing", async () => {
      const before = await listTasks();
      try {
        await reorderTask(taskIds[0], 2.5);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidReorderIndexError);
      }
      const after = await listTasks();
      expect(after.map((t) => t.id)).toEqual(before.map((t) => t.id));
    });

    it("maintains position uniqueness after 50 random reorders", async () => {
      // Helper: arrayMove simulation (same logic as dnd-kit)
      function arrayMove<T>(array: T[], from: number, to: number): T[] {
        const newArray = [...array];
        const item = newArray.splice(from, 1)[0];
        newArray.splice(to, 0, item);
        return newArray;
      }

      // Create exactly 50 tasks
      let allTasks = await listTasks();
      while (allTasks.length < 50) {
        await createTask({ title: `task-${allTasks.length}` });
        allTasks = await listTasks();
      }

      // Track the reference order using arrayMove
      let referenceOrder = allTasks.map((t) => t.id);
      const moves: Array<{ from: number; to: number }> = [];

      // Perform 50 random reorders, tracking both reference and actual
      for (let i = 0; i < 50; i++) {
        allTasks = await listTasks();
        const currentOrder = allTasks.map((t) => t.id);

        // Find the current index of a random task
        const randomTaskId = referenceOrder[Math.floor(Math.random() * referenceOrder.length)];
        const fromIndex = currentOrder.indexOf(randomTaskId);
        const toIndex = Math.floor(Math.random() * allTasks.length);

        // Apply the move to reference order
        referenceOrder = arrayMove(referenceOrder, fromIndex, toIndex);
        moves.push({ from: fromIndex, to: toIndex });

        // Apply the move to actual reorderTask
        await reorderTask(randomTaskId, toIndex);
      }

      // Verify final order matches reference order
      const finalTasks = await listTasks();
      const finalOrder = finalTasks.map((t) => t.id);
      expect(finalOrder).toEqual(referenceOrder);

      // Verify positions are still unique and dense
      const positions = finalTasks.map((t) => t.position);
      expect(positions).toEqual(Array.from({ length: 50 }, (_, i) => i));
      expect(new Set(positions).size).toBe(50);
    });
  });

  describe("current task by ordering", () => {
    it("the first task in display order is current", async () => {
      const first = await createTask({ title: "first" });
      await createTask({ title: "second" });
      expect((await getCurrentTask())?.id).toBe(first.id);
    });

    it("reordering a task to the top makes it current (the job the retired pin did)", async () => {
      const first = await createTask({ title: "first" });
      const second = await createTask({ title: "second" });

      await reorderTask(second.id, 0);

      expect((await getCurrentTask())?.id).toBe(second.id);
      expect((await listTasks()).map((t) => t.id)).toEqual([second.id, first.id]);
    });
  });

  describe("setTaskDone", () => {
    it("marking the current task done moves current to the next not-done task", async () => {
      const first = await createTask({ title: "first" });
      const second = await createTask({ title: "second" });

      const updated = await setTaskDone(first.id, true);

      expect(updated.done).toBe(true);
      expect((await getCurrentTask())?.id).toBe(second.id);
    });

    it("unmarking a done task makes it current again when it is first", async () => {
      const first = await createTask({ title: "first" });
      await setTaskDone(first.id, true);
      await setTaskDone(first.id, false);
      expect((await getCurrentTask())?.id).toBe(first.id);
    });

    it("never changes the pomodoro count", async () => {
      const task = await createTask({ title: "test" });
      await incrementCompleted(task.id);
      await setTaskDone(task.id, true);
      expect((await listTasks())[0].completed).toBe(1);
    });

    it("throws InvalidDoneValueError for a non-boolean and writes nothing", async () => {
      const task = await createTask({ title: "test" });
      await expect(setTaskDone(task.id, "yes" as unknown as boolean)).rejects.toBeInstanceOf(InvalidDoneValueError);
      expect((await listTasks())[0].done).toBe(false);
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      await expect(setTaskDone("non-existent-id", true)).rejects.toBeInstanceOf(TaskNotFoundError);
    });
  });

  describe("incrementCompleted", () => {
    it("adds 1 to completed count", async () => {
      const task = await createTask({ title: "test" });
      const updated = await incrementCompleted(task.id);
      expect(updated.completed).toBe(1);
    });

    it("clamps at 999", async () => {
      const task = await createTask({ title: "test", eta: 10 });
      let current = task;
      for (let i = 0; i < 999; i++) {
        current = await incrementCompleted(current.id);
      }

      const beforeIncrement = await listTasks();
      expect(beforeIncrement[0].completed).toBe(999);

      const afterIncrement = await incrementCompleted(current.id);
      expect(afterIncrement.completed).toBe(999);
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      try {
        await incrementCompleted("non-existent-id");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskNotFoundError);
      }
    });

    it("persists across reloads", async () => {
      const task = await createTask({ title: "test" });
      await incrementCompleted(task.id);

      const tasks = await listTasks();
      expect(tasks[0].completed).toBe(1);
    });
  });

  describe("decrementCompleted", () => {
    it("subtracts 1 from completed count", async () => {
      const task = await createTask({ title: "test" });
      await incrementCompleted(task.id);
      const decremented = await decrementCompleted(task.id);
      expect(decremented.completed).toBe(0);
    });

    it("clamps at 0", async () => {
      const task = await createTask({ title: "test" });
      const decremented = await decrementCompleted(task.id);
      expect(decremented.completed).toBe(0);
    });

    it("does nothing when at 0", async () => {
      const task = await createTask({ title: "test" });
      const result = await decrementCompleted(task.id);
      expect(result.completed).toBe(0);
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      try {
        await decrementCompleted("non-existent-id");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskNotFoundError);
      }
    });
  });

  describe("listTasks", () => {
    it("returns empty array when no tasks", async () => {
      const tasks = await listTasks();
      expect(tasks).toEqual([]);
    });

    it("returns tasks in display order (sorted by position)", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });
      const task3 = await createTask({ title: "third" });

      const tasks = await listTasks();
      expect(tasks.map((t) => t.title)).toEqual(["first", "second", "third"]);
    });

    it("is deterministic - same data always produces same order", async () => {
      await createTask({ title: "a" });
      await createTask({ title: "b" });
      await createTask({ title: "c" });

      const first = await listTasks();
      const second = await listTasks();

      expect(first).toEqual(second);
    });

    it("returns tasks with all fields populated", async () => {
      await createTask({ title: "test", eta: 5 });
      const tasks = await listTasks();

      expect(tasks[0]).toHaveProperty("id");
      expect(tasks[0]).toHaveProperty("title");
      expect(tasks[0]).not.toHaveProperty("emoji");
      expect(tasks[0]).not.toHaveProperty("colorId");
      expect(tasks[0]).toHaveProperty("eta");
      expect(tasks[0]).toHaveProperty("completed");
      expect(tasks[0]).toHaveProperty("position");
    });
  });

  describe("getCurrentTask", () => {
    it("returns null when empty database", async () => {
      expect(await getCurrentTask()).toBeNull();
    });

    it("returns null when every task is done", async () => {
      const a = await createTask({ title: "a" });
      const b = await createTask({ title: "b" });
      await setTaskDone(a.id, true);
      await setTaskDone(b.id, true);
      expect(await getCurrentTask()).toBeNull();
    });

    it("skips done tasks and returns the first not-done task by position", async () => {
      const a = await createTask({ title: "a" });
      const b = await createTask({ title: "b" });
      const c = await createTask({ title: "c" });
      await setTaskDone(a.id, true);
      expect((await getCurrentTask())?.id).toBe(b.id);
      await reorderTask(c.id, 0);
      expect((await getCurrentTask())?.id).toBe(c.id);
    });

    it("ignores a stored appMeta pin row, which version 4 retired", async () => {
      const { getDatabase } = await import("./database");
      const first = await createTask({ title: "first" });
      const second = await createTask({ title: "second" });

      await getDatabase().appMeta.put({ key: "pinnedTaskId", value: second.id });

      expect((await getCurrentTask())?.id).toBe(first.id);
    });
  });

  describe("Database transactions - atomicity", () => {
    it("deleting the only task leaves an empty list and no current task", async () => {
      const task = await createTask({ title: "test" });

      await deleteTask(task.id);

      expect(await listTasks()).toHaveLength(0);
      expect(await getCurrentTask()).toBeNull();
    });

    it("exactly one task is current at a time, following the top of the order", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });

      await reorderTask(task2.id, 0);

      const current = await getCurrentTask();
      expect(current?.id).toBe(task2.id);
      expect(current?.id).not.toBe(task1.id);
    });

    it("reorder transaction maintains position uniqueness", async () => {
      const task1 = await createTask({ title: "a" });
      const task2 = await createTask({ title: "b" });
      const task3 = await createTask({ title: "c" });

      await reorderTask(task1.id, 2);

      const tasks = await listTasks();
      const positions = tasks.map((t) => t.position);

      // Positions should be dense and unique
      expect(new Set(positions).size).toBe(positions.length);
      expect(positions).toEqual(Array.from({ length: 3 }, (_, i) => i));
    });
  });
});
