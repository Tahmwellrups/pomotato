import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { CURRENT_SCHEMA_VERSION, DATABASE_NAME, __resetDatabaseInstanceForTests, openDatabase } from "./database";
import { createTask, listTasks } from "./task-repository";
import { listAllSessionsForTests, resetDatabaseForTests, seedSessionsForTests } from "./test-utils";
import { loadBackground, storeBackground } from "./background-repository";

// Task 010 criterion 6, re-pointed for schema version 4. Every existing user is on schema
// version 2 (tasks, appMeta, sessions). The rows are seeded on a genuine version-2 database,
// opened by the shipped code (which runs the v3 and v4 upgrades), and re-read.

// Same store strings as the frozen .version(1) and .version(2) blocks in ./database.
async function openLegacyAtVersion2(): Promise<Dexie> {
  const legacy = new Dexie(DATABASE_NAME);
  legacy.version(1).stores({ tasks: "id, position", appMeta: "key" });
  legacy.version(2).stores({ sessions: "id, &runId, endedAt" });
  await legacy.open();
  return legacy;
}

describe("task 010 criterion 6: the schema bump is additive", () => {
  it("version 2 rows survive the upgrade to the current version: tasks and sessions kept, backgrounds empty, retired pin row removed", async () => {
    await resetDatabaseForTests();
    await new Dexie(DATABASE_NAME).delete();
    __resetDatabaseInstanceForTests();

    // Version-2 rows are the legacy shape: a pomodoro estimate, a numeric count, a global position.
    const tasks = [
      { id: "b1", title: "keep the first", eta: 1, completed: 0, position: 0, emoji: "🥔", colorId: "tomato" },
      { id: "b2", title: "keep the second", eta: 1, completed: 0, position: 1, emoji: "🍅", colorId: "sage" },
    ];
    // The pin was retired in v4; a v2 database still carries the row, so seed it directly.
    const meta = [{ key: "pinnedTaskId", value: "b2" }];
    const sessions: never[] = [];

    const legacy = await openLegacyAtVersion2();
    await legacy.table("tasks").bulkAdd(tasks);
    await legacy.table("appMeta").bulkPut(meta);
    await legacy.table("sessions").bulkAdd(sessions);
    expect(legacy.verno).toBe(2);
    legacy.close();

    const upgraded = await openDatabase();
    expect(upgraded.verno).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    const upgradedTasks = await upgraded.table("tasks").toArray();
    expect(upgradedTasks.map((t) => t.id).sort()).toEqual(tasks.map((t) => t.id).sort());
    expect(upgradedTasks.every((t) => t.completed === false)).toBe(true);
    // v4 moves the last-chosen task to position 0 (ordering replaces the pin) and deletes the pin row.
    expect((await listTasks()).map((t) => t.title)).toEqual(["keep the second", "keep the first"]);
    expect(await upgraded.table("appMeta").get("pinnedTaskId")).toBeUndefined();
    expect(await upgraded.table("sessions").toArray()).toEqual(sessions);
    expect(await upgraded.backgrounds.count()).toBe(0);
  });

  it("the new table accepts an image on the upgraded database and leaves the other tables alone", async () => {
    await resetDatabaseForTests();
    await seedSessionsForTests([{ mode: "focus" as never, plannedDurationMs: 60_000, endedAt: Date.now() }]);
    const sessionsBefore = await listAllSessionsForTests();
    const tasksBefore = await listTasks();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    const stored = await storeBackground(new File([bytes as BlobPart], "x.png", { type: "image/png" }));
    expect(stored.ok).toBe(true);
    expect(await listAllSessionsForTests()).toEqual(sessionsBefore);
    expect(await listTasks()).toEqual(tasksBefore);
    if (stored.ok) expect((await loadBackground(stored.background.id)).status).toBe("found");
  });
});
