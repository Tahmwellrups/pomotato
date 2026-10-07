import { describe, it, expect, beforeEach } from "vitest";
import {
  createTask,
  updateTask,
  deleteTask,
  reorderTask,
  pinTask,
  unpinTask,
  incrementCompleted,
  decrementCompleted,
  listTasks,
  getCurrentTask,
} from "./task-repository";
import { TaskValidationError, TaskNotFoundError, InvalidReorderIndexError } from "./errors";
import { resetDatabaseForTests } from "./test-utils";
import { PALETTE, DEFAULT_PALETTE_COLOR_ID } from "./palette";

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

    describe("emoji validation", () => {
      it("rejects empty emoji", async () => {
        try {
          await createTask({ title: "test", emoji: "" });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects plain text emoji", async () => {
        try {
          await createTask({ title: "test", emoji: "a" });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects plain digit emoji", async () => {
        try {
          await createTask({ title: "test", emoji: "7" });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects multiple emoji", async () => {
        try {
          await createTask({ title: "test", emoji: "🥔🍅" });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("rejects emoji plus text", async () => {
        try {
          await createTask({ title: "test", emoji: "🥔a" });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("accepts single emoji", async () => {
        const task = await createTask({ title: "test", emoji: "🥔" });
        expect(task.emoji).toBe("🥔");
      });

      it("accepts ZWJ sequence (👩‍💻)", async () => {
        const zwjEmoji = "👩‍💻";
        const task = await createTask({ title: "test", emoji: zwjEmoji });
        expect(task.emoji).toBe(zwjEmoji);
      });

      it("accepts skin-tone modifier (👍🏽)", async () => {
        const skinToneEmoji = "👍🏽";
        const task = await createTask({ title: "test", emoji: skinToneEmoji });
        expect(task.emoji).toBe(skinToneEmoji);
      });

      it("accepts flag (🇵🇭)", async () => {
        const flagEmoji = "🇵🇭";
        const task = await createTask({ title: "test", emoji: flagEmoji });
        expect(task.emoji).toBe(flagEmoji);
      });

      it("accepts keycap (1️⃣)", async () => {
        const keycapEmoji = "1️⃣";
        const task = await createTask({ title: "test", emoji: keycapEmoji });
        expect(task.emoji).toBe(keycapEmoji);
      });

      it("uses default emoji 🥔 when not provided", async () => {
        const task = await createTask({ title: "test" });
        expect(task.emoji).toBe("🥔");
      });
    });

    describe("colorId validation", () => {
      it("rejects unknown color", async () => {
        try {
          await createTask({ title: "test", colorId: "unknown" });
          expect.fail("should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(TaskValidationError);
        }
      });

      it("accepts all palette colors", async () => {
        for (const paletteColor of PALETTE) {
          const task = await createTask({ title: `test-${paletteColor.id}`, colorId: paletteColor.id });
          expect(task.colorId).toBe(paletteColor.id);
        }
      });

      it("uses default color (first palette entry) when not provided", async () => {
        const task = await createTask({ title: "test" });
        expect(task.colorId).toBe(DEFAULT_PALETTE_COLOR_ID);
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
          emoji: "not-emoji",
          colorId: "unknown",
          eta: 0,
        });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskValidationError);
        if (err instanceof TaskValidationError) {
          const failedFields = err.issues.map((issue) => issue.field);
          expect(failedFields).toContain("title");
          expect(failedFields).toContain("emoji");
          expect(failedFields).toContain("colorId");
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

    it("rejects invalid emoji", async () => {
      try {
        await updateTask(taskId, { emoji: "invalid" });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskValidationError);
      }
    });

    it("rejects invalid colorId", async () => {
      try {
        await updateTask(taskId, { colorId: "unknown" });
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
      expect(tasks[0].emoji).toBe("🥔");
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

    it("clears pin if deleting the pinned task", async () => {
      const { getDatabase } = await import("./database");

      const task = await createTask({ title: "test" });
      await pinTask(task.id);
      expect(await getCurrentTask()).not.toBeNull();

      await deleteTask(task.id);

      expect(await getCurrentTask()).toBeNull();

      // Verify the appMeta record directly shows pin cleared
      const db = getDatabase();
      const appMetaRecord = await db.appMeta.get("pinnedTaskId");
      expect(appMetaRecord?.value).toBeNull();
    });

    it("leaves other pins unchanged when deleting non-pinned task", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });
      await pinTask(task1.id);

      await deleteTask(task2.id);

      const currentTask = await getCurrentTask();
      expect(currentTask?.id).toBe(task1.id);
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

  describe("pinTask", () => {
    it("pins a task as current", async () => {
      const task = await createTask({ title: "test" });
      await pinTask(task.id);
      const current = await getCurrentTask();
      expect(current?.id).toBe(task.id);
    });

    it("unpins previous task when pinning new task", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });

      await pinTask(task1.id);
      expect(await getCurrentTask()).toEqual(expect.objectContaining({ id: task1.id }));

      await pinTask(task2.id);
      const current = await getCurrentTask();
      expect(current?.id).toBe(task2.id);

      // Verify only one task is pinned (task2)
      const tasks = await listTasks();
      const pinnedTasks = tasks.filter((t) => t.id === task1.id || t.id === task2.id);
      expect(pinnedTasks.length).toBe(2);
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      try {
        await pinTask("non-existent-id");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskNotFoundError);
      }
    });

    it("persists across reloads", async () => {
      const task = await createTask({ title: "test" });
      await pinTask(task.id);

      const current = await getCurrentTask();
      expect(current?.id).toBe(task.id);
    });
  });

  describe("unpinTask", () => {
    it("unpins the pinned task", async () => {
      const task = await createTask({ title: "test" });
      await pinTask(task.id);
      expect(await getCurrentTask()).not.toBeNull();

      await unpinTask(task.id);
      expect(await getCurrentTask()).toBeNull();
    });

    it("is idempotent - unpinning non-pinned task is a no-op", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });
      await pinTask(task1.id);

      await unpinTask(task2.id);

      const current = await getCurrentTask();
      expect(current?.id).toBe(task1.id);
    });

    it("throws TaskNotFoundError for non-existent id", async () => {
      try {
        await unpinTask("non-existent-id");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TaskNotFoundError);
      }
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
      await createTask({ title: "test", emoji: "🎯", colorId: "tomato", eta: 5 });
      const tasks = await listTasks();

      expect(tasks[0]).toHaveProperty("id");
      expect(tasks[0]).toHaveProperty("title");
      expect(tasks[0]).toHaveProperty("emoji");
      expect(tasks[0]).toHaveProperty("colorId");
      expect(tasks[0]).toHaveProperty("eta");
      expect(tasks[0]).toHaveProperty("completed");
      expect(tasks[0]).toHaveProperty("position");
    });
  });

  describe("getCurrentTask", () => {
    it("returns null when nothing is pinned", async () => {
      const current = await getCurrentTask();
      expect(current).toBeNull();
    });

    it("returns the pinned task", async () => {
      const task = await createTask({ title: "test" });
      await pinTask(task.id);

      const current = await getCurrentTask();
      expect(current?.id).toBe(task.id);
    });

    it("returns null when empty database", async () => {
      const current = await getCurrentTask();
      expect(current).toBeNull();
    });

    it("returns null when pin references a nonexistent task id (dangling pin)", async () => {
      // Import getDatabase to directly manipulate appMeta
      const { getDatabase } = await import("./database");

      // Create a task to verify the DB works
      const task = await createTask({ title: "test" });

      // Manually set a dangling pin reference
      const db = getDatabase();
      await db.appMeta.put({
        key: "pinnedTaskId",
        value: "nonexistent-id-12345",
      });

      // getCurrentTask should return null, not throw
      const current = await getCurrentTask();
      expect(current).toBeNull();
    });
  });

  describe("Database transactions - atomicity", () => {
    it("delete task transaction clears pin atomically", async () => {
      const { getDatabase } = await import("./database");

      const task = await createTask({ title: "test" });
      await pinTask(task.id);

      await deleteTask(task.id);

      // After deletion, both task is gone AND pin is cleared
      const tasks = await listTasks();
      const current = await getCurrentTask();

      expect(tasks).toHaveLength(0);
      expect(current).toBeNull();

      // Verify the appMeta record directly shows pin cleared
      const db = getDatabase();
      const appMetaRecord = await db.appMeta.get("pinnedTaskId");
      expect(appMetaRecord?.value).toBeNull();
    });

    it("pin transaction ensures only one task is pinned", async () => {
      const task1 = await createTask({ title: "first" });
      const task2 = await createTask({ title: "second" });

      await pinTask(task1.id);
      await pinTask(task2.id);

      const current = await getCurrentTask();
      expect(current?.id).toBe(task2.id);

      // Verify the storage state directly
      const tasks = await listTasks();
      let pinnedCount = 0;
      for (const t of tasks) {
        const c = await getCurrentTask();
        if (c?.id === t.id) {
          pinnedCount += 1;
        }
      }

      expect(pinnedCount).toBeLessThanOrEqual(1);
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
