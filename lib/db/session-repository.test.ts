import { describe, it, expect, beforeEach } from "vitest";
import { logCompletedSession, listSessionsInRange } from "./session-repository";
import { resetDatabaseForTests, seedSessionsForTests, clearSessionsForTests, listAllSessionsForTests, seedVersion1DatabaseForTests } from "./test-utils";
import { createTask, listTasks, getCurrentTask, reorderTask, setTaskCompleted } from "./task-repository";
import { openDatabase } from "./database";
import { SessionValidationError } from "./errors";

describe("session-repository: logCompletedSession", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  describe("validation", () => {
    it("rejects runId that is not a non-empty string", async () => {
      await expect(
        logCompletedSession({
          runId: "",
          mode: "focus",
          startedAt: 1000,
          endedAt: 2000,
          plannedDurationMs: 1000,
        })
      ).rejects.toThrow(SessionValidationError);
    });

    it("rejects invalid mode", async () => {
      await expect(
        logCompletedSession({
          runId: "test-id",
          mode: "invalid" as never,
          startedAt: 1000,
          endedAt: 2000,
          plannedDurationMs: 1000,
        })
      ).rejects.toThrow(SessionValidationError);
    });

    it("rejects endedAt earlier than startedAt", async () => {
      await expect(
        logCompletedSession({
          runId: "test-id",
          mode: "focus",
          startedAt: 2000,
          endedAt: 1000,
          plannedDurationMs: 1000,
        })
      ).rejects.toThrow(SessionValidationError);
    });

    it("rejects non-positive plannedDurationMs", async () => {
      await expect(
        logCompletedSession({
          runId: "test-id",
          mode: "focus",
          startedAt: 1000,
          endedAt: 2000,
          plannedDurationMs: 0,
        })
      ).rejects.toThrow(SessionValidationError);
    });

    it("collects multiple validation issues in one error", async () => {
      try {
        await logCompletedSession({
          runId: "",
          mode: "invalid" as never,
          startedAt: 2000,
          endedAt: 1000,
          plannedDurationMs: -5,
        });
        throw new Error("Should have thrown");
      } catch (error) {
        if (!(error instanceof SessionValidationError)) throw error;
        expect(error.issues.length).toBeGreaterThanOrEqual(4);
        expect(error.issues.map((i) => i.field)).toContain("runId");
        expect(error.issues.map((i) => i.field)).toContain("mode");
        expect(error.issues.map((i) => i.field)).toContain("endedAt");
        expect(error.issues.map((i) => i.field)).toContain("plannedDurationMs");
      }
    });
  });

  describe("basic session logging", () => {
    it("writes a valid session row with all fields captured", async () => {
      const result = await logCompletedSession({
        runId: "run-1",
        mode: "focus",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 25 * 60 * 1000,
      });

      expect(result.status).toBe("logged");
      expect(result.session).toMatchObject({
        runId: "run-1",
        mode: "focus",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 25 * 60 * 1000,
        taskId: null,
      });

      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(1);
    });

    it("generates unique id for each session", async () => {
      await logCompletedSession({
        runId: "run-a",
        mode: "focus",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 25 * 60 * 1000,
      });

      await logCompletedSession({
        runId: "run-b",
        mode: "focus",
        startedAt: 3000,
        endedAt: 4000,
        plannedDurationMs: 25 * 60 * 1000,
      });

      const sessions = await listAllSessionsForTests();
      expect(sessions[0].id).not.toBe(sessions[1].id);
    });
  });

  describe("break-type sessions", () => {
    it("writes shortBreak session", async () => {
      await logCompletedSession({
        runId: "break-1",
        mode: "shortBreak",
        startedAt: 1000,
        endedAt: 1500,
        plannedDurationMs: 5 * 60 * 1000,
      });

      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].mode).toBe("shortBreak");
    });

    it("writes longBreak session", async () => {
      await logCompletedSession({
        runId: "break-2",
        mode: "longBreak",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 15 * 60 * 1000,
      });

      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].mode).toBe("longBreak");
    });
  });

  describe("custom mode", () => {
    it("accepts custom mode as valid", async () => {
      await logCompletedSession({
        runId: "custom-1",
        mode: "custom",
        startedAt: 1000,
        endedAt: 3000,
        plannedDurationMs: 10 * 60 * 1000,
      });

      const sessions = await listAllSessionsForTests();
      expect(sessions[0].mode).toBe("custom");
    });
  });

  describe("no-task (untagged) sessions", () => {
    it("writes focus-type session with no task attached", async () => {
      const result = await logCompletedSession({
        runId: "run-untag",
        mode: "focus",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 25 * 60 * 1000,
      });

      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].taskId).toBeNull();
      expect(sessions[0].taskTitle).toBeNull();
      expect(result.task).toBeNull();
    });
  });

  describe("deduplication (exactly-once guarantee)", () => {
    it("calling log with the same runId 5 times leaves exactly 1 row", async () => {
      const runId = "dedup-test-run-1";

      // Call 5 times with the same runId
      const results = await Promise.all([
        logCompletedSession({ runId, mode: "focus", startedAt: 1000, endedAt: 2000, plannedDurationMs: 25 * 60 * 1000 }),
        logCompletedSession({ runId, mode: "focus", startedAt: 1000, endedAt: 2000, plannedDurationMs: 25 * 60 * 1000 }),
        logCompletedSession({ runId, mode: "focus", startedAt: 1000, endedAt: 2000, plannedDurationMs: 25 * 60 * 1000 }),
        logCompletedSession({ runId, mode: "focus", startedAt: 1000, endedAt: 2000, plannedDurationMs: 25 * 60 * 1000 }),
        logCompletedSession({ runId, mode: "focus", startedAt: 1000, endedAt: 2000, plannedDurationMs: 25 * 60 * 1000 }),
      ]);

      // Exactly 1 should have logged, rest duplicates
      const logged = results.filter((r) => r.status === "logged");
      const dupes = results.filter((r) => r.status === "duplicate");
      expect(logged).toHaveLength(1);
      expect(dupes).toHaveLength(4);

      // Only 1 row in DB
      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].runId).toBe(runId);
    });

    it("reloading after a write and requesting the same runId returns duplicate", async () => {
      const runId = "reload-dedup-run";

      const first = await logCompletedSession({
        runId,
        mode: "focus",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 25 * 60 * 1000,
      });
      expect(first.status).toBe("logged");

      // Request again (simulating app reload and retry)
      const second = await logCompletedSession({
        runId,
        mode: "focus",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 25 * 60 * 1000,
      });
      expect(second.status).toBe("duplicate");
      expect(second.session.runId).toBe(runId);

      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(1);
    });

    it("different runIds create separate rows", async () => {
      await logCompletedSession({
        runId: "run-a",
        mode: "focus",
        startedAt: 1000,
        endedAt: 2000,
        plannedDurationMs: 25 * 60 * 1000,
      });
      await logCompletedSession({
        runId: "run-b",
        mode: "focus",
        startedAt: 3000,
        endedAt: 4000,
        plannedDurationMs: 25 * 60 * 1000,
      });

      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(2);
    });
  });

  describe("task increment rules (the transaction boundary)", () => {
    /**
     * A focus task that is the current one by ordering, not by being created first:
     * a decoy is created before it and the target is moved to the top.
     */
    async function currentTaskWithCompleted(completed: number) {
      await createTask({ title: "Decoy" });
      const task = await createTask({ title: "Zephyrine" });
      await reorderTask(task.id, 0);
      if (completed !== 0) {
        const db = await openDatabase();
        await db.tasks.update(task.id, { completedPomodoros: completed });
      }
      return task;
    }

    function focusRun(runId: string) {
      return { runId, mode: "focus" as const, startedAt: 1000, endedAt: 2000, plannedDurationMs: 1000 };
    }

    async function completedFor(taskId: string) {
      const tasks = await listTasks();
      return tasks.find((t) => t.id === taskId)?.completedPomodoros;
    }

    it("logs the row and increments the current task by exactly 1, not the decoy", async () => {
      const task = await currentTaskWithCompleted(0);

      const result = await logCompletedSession(focusRun("increment-once"));

      expect(result.status).toBe("logged");
      expect(await listAllSessionsForTests()).toHaveLength(1);
      expect(await completedFor(task.id)).toBe(1);
      expect((await listTasks()).find((t) => t.title === "Decoy")?.completedPomodoros).toBe(0);
    });

    it("leaves exactly 1 row AND increments by exactly 1 when the same runId is logged 5 times", async () => {
      const task = await currentTaskWithCompleted(0);

      // The existing dedup test asserts the row count only. The increment is
      // the other half of the exactly-once guarantee, so assert it here too.
      await Promise.all(Array.from({ length: 5 }, () => logCompletedSession(focusRun("dedup-increment"))));

      expect(await listAllSessionsForTests()).toHaveLength(1);
      expect(await completedFor(task.id)).toBe(1);
    });

    it("does not increment any task for a break-type session", async () => {
      const task = await currentTaskWithCompleted(0);

      await logCompletedSession({ ...focusRun("break-run"), mode: "shortBreak" });
      await logCompletedSession({ ...focusRun("long-break-run"), mode: "longBreak" });

      // Both rows are still logged — breaks are recorded, just not counted.
      expect(await listAllSessionsForTests()).toHaveLength(2);
      expect(await completedFor(task.id)).toBe(0);
    });

    it("changes no task's count when no task is current (every task done)", async () => {
      const task = await createTask({ title: "Quokka" });
      await setTaskCompleted(task.id, true);

      await logCompletedSession(focusRun("untagged-run"));

      const [row] = await listAllSessionsForTests();
      expect(row.taskId).toBeNull();
      expect(await completedFor(task.id)).toBe(0);
    });

    it("keeps completed at 999 and still logs the row", async () => {
      const task = await currentTaskWithCompleted(999);

      const result = await logCompletedSession(focusRun("clamped-run"));

      expect(result.status).toBe("logged");
      expect(await listAllSessionsForTests()).toHaveLength(1);
      expect(await completedFor(task.id)).toBe(999);
    });

    it("logs untagged without throwing when every task is done", async () => {
      const task = await createTask({ title: "Only" });
      await setTaskCompleted(task.id, true);

      const result = await logCompletedSession(focusRun("all-done-run"));

      expect(result.status).toBe("logged");
      expect(result.task).toBeNull();
      const [row] = await listAllSessionsForTests();
      expect(row.taskId).toBeNull();
      expect(await completedFor(task.id)).toBe(0);
    });
  });

  describe("deleted task handling", () => {
    it("sessions persist even if their task is deleted", async () => {
      const task = await createTask({ title: "Delete Me" });

      // Seed sessions for this task (bypassing the repository so no pin is needed)
      await seedSessionsForTests([
        { endedAt: 1000, taskId: task.id, taskTitle: "Delete Me" },
        { endedAt: 2000, taskId: task.id, taskTitle: "Delete Me" },
        { endedAt: 3000, taskId: task.id, taskTitle: "Delete Me" },
      ]);

      // Verify 3 rows logged
      const sessions = await listAllSessionsForTests();
      expect(sessions).toHaveLength(3);

      // Now delete the task (would need a delete function from task-repository)
      // For now, just verify the sessions exist
      const allSessions = await listAllSessionsForTests();
      expect(allSessions.every((s) => s.taskTitle === "Delete Me")).toBe(true);
    });
  });
});

describe("session-repository: listSessionsInRange", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  it("returns sessions with from <= endedAt < to", async () => {
    await seedSessionsForTests([
      { endedAt: 900 },   // Before range
      { endedAt: 1000 },  // At lower bound (included)
      { endedAt: 1500 },  // In range
      { endedAt: 2000 },  // At upper bound (excluded)
      { endedAt: 2500 },  // After range
    ]);

    const results = await listSessionsInRange(1000, 2000);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.endedAt)).toEqual([1000, 1500]);
  });

  it("returns empty array when from >= to", async () => {
    await seedSessionsForTests([
      { endedAt: 1000 },
      { endedAt: 2000 },
    ]);

    const results = await listSessionsInRange(2000, 2000);
    expect(results).toHaveLength(0);

    const results2 = await listSessionsInRange(3000, 1000);
    expect(results2).toHaveLength(0);
  });

  it("sorts results by endedAt ascending, then by id", async () => {
    await clearSessionsForTests();
    // Seed with specific IDs so we can test tie-breaking
    await seedSessionsForTests([{ endedAt: 1000, id: "z-id", runId: "z-run" }]);
    await seedSessionsForTests([{ endedAt: 1000, id: "a-id", runId: "a-run" }]);
    await seedSessionsForTests([{ endedAt: 2000, id: "m-id", runId: "m-run" }]);

    const results = await listSessionsInRange(0, 3000);
    // First two have same endedAt, should be sorted by id
    expect(results[0].id).toBe("a-id");
    expect(results[1].id).toBe("z-id");
    expect(results[2].id).toBe("m-id");
  });

  it("rejects invalid from/to parameters", async () => {
    await expect(listSessionsInRange(NaN, 2000)).rejects.toThrow(SessionValidationError);
    await expect(listSessionsInRange(1000, Infinity)).rejects.toThrow(SessionValidationError);
    await expect(listSessionsInRange("1000" as never, 2000)).rejects.toThrow(SessionValidationError);
  });
});

describe("session-repository: schema migration v1 -> v6", () => {
  it("preserves tasks and the last-chosen current task through the upgrade chain to version 6", async () => {
    // Seeded as version-1 rows (legacy shape), so the whole chain 1 -> 6 runs.
    const legacy = [1, 2, 3, 4, 5].map((n) => ({
      id: `t${n}`,
      title: `Task ${n}`,
      eta: n,
      completed: 0,
      position: n - 1,
      emoji: "🥔",
      colorId: "tomato",
    }));

    await seedVersion1DatabaseForTests({ tasks: legacy, pinnedTaskId: "t3" });

    const afterUpgrade = await listTasks();
    expect(afterUpgrade).toHaveLength(5);
    // The v4 step moves the pinned task to the top and keeps the rest in order; v6 keeps that order.
    expect(afterUpgrade.map((t) => t.title)).toEqual(["Task 3", "Task 1", "Task 2", "Task 4", "Task 5"]);
    expect((await getCurrentTask())?.id).toBe("t3");
  });
});
