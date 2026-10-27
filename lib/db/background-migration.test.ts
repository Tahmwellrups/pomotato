import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { DATABASE_NAME, __resetDatabaseInstanceForTests, openDatabase } from "./database";
import { createTask, listTasks, pinTask } from "./task-repository";
import { listAllSessionsForTests, resetDatabaseForTests, seedSessionsForTests } from "./test-utils";
import { loadBackground, storeBackground } from "./background-repository";

// Task 010 criterion 6. Every existing user is on schema version 2 (tasks, appMeta,
// sessions). The rows are seeded on a genuine version-2 database, opened by the
// shipped code, and re-read unchanged.

// Same store strings as the frozen .version(1) and .version(2) blocks in ./database.
async function openLegacyAtVersion2(): Promise<Dexie> {
  const legacy = new Dexie(DATABASE_NAME);
  legacy.version(1).stores({ tasks: "id, position", appMeta: "key" });
  legacy.version(2).stores({ sessions: "id, &runId, endedAt" });
  await legacy.open();
  return legacy;
}

describe("task 010 criterion 6: the schema bump is additive", () => {
  it("version 2 rows survive the upgrade to version 3 and the new table is empty", async () => {
    await resetDatabaseForTests();
    const first = await createTask({ title: "keep the first" });
    await createTask({ title: "keep the second" });
    await pinTask(first.id);
    const before = await openDatabase();
    const tasks = await before.table("tasks").toArray();
    const meta = await before.table("appMeta").toArray();
    const sessions = await before.table("sessions").toArray();
    await before.close();
    await new Dexie(DATABASE_NAME).delete();
    __resetDatabaseInstanceForTests();

    const legacy = await openLegacyAtVersion2();
    await legacy.table("tasks").bulkAdd(tasks);
    await legacy.table("appMeta").bulkPut(meta);
    await legacy.table("sessions").bulkAdd(sessions);
    expect(legacy.verno).toBe(2);
    legacy.close();

    const upgraded = await openDatabase();
    expect(upgraded.verno).toBe(3);
    expect(await upgraded.table("tasks").toArray()).toEqual(tasks);
    expect(await upgraded.table("appMeta").toArray()).toEqual(meta);
    expect(await upgraded.table("sessions").toArray()).toEqual(sessions);
    expect(await upgraded.backgrounds.count()).toBe(0);
    expect((await listTasks()).map((t) => t.title).sort()).toEqual(["keep the first", "keep the second"]);
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
