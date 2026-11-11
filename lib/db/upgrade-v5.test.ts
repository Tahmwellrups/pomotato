import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, __resetDatabaseInstanceForTests, openDatabase, upgradeToVersion6 } from "./database";
import { listTasks } from "./task-repository";
import type { SessionRecord } from "./types";
import {
  type LegacyTask,
  resetDatabaseForTests,
  seedVersion1DatabaseForTests,
  seedVersion3DatabaseForTests,
  seedVersion4DatabaseForTests,
  seedVersion5DatabaseForTests,
} from "./test-utils";

// Task 016 criteria 4, 6, 7, 8 and 9: the version 5 -> 6 upgrade, proven on a
// database SEEDED AT VERSION 5. A fresh database never runs the callback, so
// every case seeds an older version and reads the result back RAW through the
// table, never through the repository (the repository normalises and would hide
// a field the upgrade failed to rename).
//
// Task 015 criteria 6-9 (the v4 -> 5 strip, and v1/-3 upgrading through to 5)
// are re-pointed here at the FINAL state: no test can observe a mid-chain
// version any more. The strip is still asserted (no `emoji` or `colorId` on any
// row at 6), and so is the straight-through upgrade from v1 and v3.

type RawRow = Record<string, unknown> & { id: string };

async function rawTasks(): Promise<RawRow[]> {
  const db = await openDatabase();
  return (await db.table("tasks").toArray()) as RawRow[];
}

async function rawTable(name: string): Promise<Record<string, unknown>[]> {
  const db = await openDatabase();
  return (await db.table(name).toArray()) as Record<string, unknown>[];
}

const SESSION: SessionRecord = {
  id: "s-1",
  runId: "run-1",
  mode: "focus",
  startedAt: 1_000,
  endedAt: 1_500,
  plannedDurationMs: 500,
  taskId: "t-1",
  taskTitle: "Seeded",
};

// Five version-5 rows. Storage order is deliberately NOT position order, so the
// test proves the upgrade ranks by `position`, not by insertion.
const V5_FIVE: RawRow[] = [
  { id: "t-c", title: "Third", eta: 3, completed: 0, position: 2, done: false },
  { id: "t-a", title: "First", eta: 1, completed: 0, position: 0, done: false },
  { id: "t-e", title: "Fifth", eta: 20, completed: 1, position: 4, done: true },
  { id: "t-b", title: "Second", eta: 2, completed: 3, position: 1, done: true },
  { id: "t-d", title: "Fourth", eta: 4, completed: 999, position: 3, done: false },
];

function byId(rows: RawRow[]): Map<string, RawRow> {
  return new Map(rows.map((row): [string, RawRow] => [row.id, row]));
}

beforeEach(async () => {
  await resetDatabaseForTests();
});

describe("task 016 criterion 4: the schema is at 6 and the new order index is live", () => {
  it("opens at verno 6, the position index is gone and a query by order returns rows", async () => {
    await seedVersion5DatabaseForTests({ tasks: V5_FIVE.map((row) => ({ ...row })) });
    const db = await openDatabase();
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    expect(db.verno).toBe(6);
    expect(db.table("tasks").schema.idxByName["position"]).toBeUndefined();
    expect(db.table("tasks").schema.idxByName["order"]).toBeDefined();
    const viaOrder = await db.table("tasks").orderBy("order").toArray();
    expect(viaOrder).toHaveLength(5);
    expect(viaOrder.map((row: RawRow) => row.order)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("task 016 criterion 6: the upgrade renames in place, asserted on raw stored rows", () => {
  it("every raw row loses done, position and eta, and carries completed, completedPomodoros and order from the seed", async () => {
    await seedVersion5DatabaseForTests({ tasks: V5_FIVE.map((row) => ({ ...row })), sessions: [SESSION] });
    const before = byId(V5_FIVE);
    const after = await rawTasks();
    expect(after).toHaveLength(5);
    for (const row of after) {
      expect("done" in row).toBe(false);
      expect("position" in row).toBe(false);
      expect("eta" in row).toBe(false);
    }
    // Re-read after the upgrade: the seed is not mutated by the test itself.
    const seededByPosition = [...V5_FIVE].sort((a, b) => (a.position as number) - (b.position as number));
    const rows = byId(after);
    for (const seed of seededByPosition) {
      const row = rows.get(seed.id);
      expect(row).toBeDefined();
      expect(row?.id).toBe(seed.id);
      expect(row?.title).toBe(seed.title);
      expect(row?.completed).toBe(seed.done);
      expect(row?.completedPomodoros).toBe(before.get(seed.id)?.completed);
      expect(row?.order).toBe(seed.position);
    }
  });

  it("sessions are untouched and appMeta resolves pinnedTaskId to undefined", async () => {
    await seedVersion5DatabaseForTests({ tasks: V5_FIVE.map((row) => ({ ...row })), sessions: [SESSION] });
    const db = await openDatabase();
    const sessions = await rawTable("sessions");
    expect(sessions).toEqual([SESSION]);
    expect(await db.table("appMeta").get("pinnedTaskId")).toBeUndefined();
  });

  it("the callback runs exactly once: a field written after the upgrade survives a later reopen", async () => {
    await seedVersion5DatabaseForTests({ tasks: V5_FIVE.map((row) => ({ ...row })) });
    const db = await openDatabase();
    await db.table("tasks").put({ id: "t-stray", title: "Stray", completed: true, order: 9, completedPomodoros: 2, createdAt: 1, updatedAt: 1 });
    db.close();
    __resetDatabaseInstanceForTests();
    const reopened = await openDatabase();
    expect(reopened.verno).toBe(6);
    const stray = (await reopened.table("tasks").get("t-stray")) as RawRow | undefined;
    expect(stray?.order).toBe(9);
    expect(stray?.completed).toBe(true);
  });
});

describe("task 016 criterion 7: the new fields arrive as stated and the estimate is gone", () => {
  it("createdAt and updatedAt are one finite timestamp across all rows; parentId, emoji, color and etaMinutes are absent", async () => {
    await seedVersion5DatabaseForTests({ tasks: V5_FIVE.map((row) => ({ ...row })) });
    const after = await rawTasks();
    const stamps = new Set<number>();
    for (const row of after) {
      expect(Number.isInteger(row.createdAt)).toBe(true);
      expect(Number.isInteger(row.updatedAt)).toBe(true);
      expect(row.createdAt).toBe(row.updatedAt);
      stamps.add(row.createdAt as number);
      expect("parentId" in row).toBe(false);
      expect("emoji" in row).toBe(false);
      expect("color" in row).toBe(false);
      expect("etaMinutes" in row).toBe(false);
    }
    expect(stamps.size).toBe(1);
  });
});

describe("task 016 criterion 8: bad rows and a second run are both no-ops", () => {
  it("hand-written bad rows upgrade without throwing and land on the stated defaults", async () => {
    await seedVersion5DatabaseForTests({
      tasks: [
        { id: "j-absent", title: "No done", eta: 1, completed: 2, position: 0 },
        { id: "j-yes", title: "Yes string", eta: 1, completed: 0, position: 1, done: "yes" },
        { id: "j-null", title: "Null count", eta: 1, completed: null, position: 2, done: true },
        { id: "j-frac", title: "Fractional", eta: 1, completed: 7.5, position: 3, done: false },
        { id: "j-nopos", title: "No position", eta: 1, completed: 0, done: false },
        { id: "j-dup-a", title: "Dup A", eta: 1, completed: 0, position: 4, done: false },
        { id: "j-dup-b", title: "Dup B", eta: 1, completed: 0, position: 4, done: false },
      ],
    });
    const after = byId(await rawTasks());
    expect(after.size).toBe(7);
    expect(after.get("j-absent")?.completed).toBe(false);
    expect(after.get("j-absent")?.completedPomodoros).toBe(2);
    expect(after.get("j-yes")?.completed).toBe(false);
    expect(after.get("j-null")?.completed).toBe(true);
    expect(after.get("j-null")?.completedPomodoros).toBe(0);
    expect(after.get("j-frac")?.completedPomodoros).toBe(0);
    expect(after.get("j-nopos")?.completed).toBe(false);
    // Every order is dense and unique across the top level, even with a duplicate position.
    const orders = [...after.values()].map((row) => row.order as number).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const row of after.values()) {
      expect("done" in row).toBe(false);
      expect("position" in row).toBe(false);
      expect("eta" in row).toBe(false);
    }
  });

  it("an empty tasks table upgrades without throwing and stays empty", async () => {
    await seedVersion5DatabaseForTests({ tasks: [] });
    const db = await openDatabase();
    expect(db.verno).toBe(6);
    expect(await rawTasks()).toEqual([]);
    expect(await listTasks()).toEqual([]);
  });

  it("running the callback a second time on its own output changes nothing", async () => {
    await seedVersion5DatabaseForTests({ tasks: V5_FIVE.map((row) => ({ ...row })) });
    const db = await openDatabase();
    const firstRun = await rawTasks();
    await db.transaction("rw", db.table("tasks"), async (tx) => {
      await upgradeToVersion6(tx);
    });
    const secondRun = await rawTasks();
    expect(secondRun).toEqual(firstRun);
    // A non-boolean done or a count of 999 must survive: a second pass must not re-read a count as `done`.
    expect(byId(secondRun).get("t-d")?.completedPomodoros).toBe(999);
    expect(byId(secondRun).get("t-b")?.completed).toBe(true);
  });
});

describe("task 016 criterion 9: version 1, 3 and 4 databases upgrade straight through to 6", () => {
  it("a version-3 database with a pin on position 3 opens at 6 with the pin at order 0 and the rest dense in prior order", async () => {
    await seedVersion3DatabaseForTests({
      tasks: [
        { id: "v3-a", title: "A", eta: 1, completed: 0, position: 0, emoji: "🥔", colorId: "tomato" },
        { id: "v3-b", title: "B", eta: 1, completed: 0, position: 1, emoji: "🍅", colorId: "sage" },
        { id: "v3-c", title: "C", eta: 1, completed: 0, position: 2, emoji: "🌿", colorId: "sky" },
        { id: "v3-d", title: "D", eta: 1, completed: 0, position: 3, emoji: "🎯", colorId: "plum" },
        { id: "v3-e", title: "E", eta: 1, completed: 0, position: 4, emoji: "❌", colorId: "ink" },
      ],
      pinnedTaskId: "v3-d",
    });
    const db = await openDatabase();
    expect(db.verno).toBe(6);
    const rows = byId(await rawTasks());
    expect(rows.get("v3-d")?.order).toBe(0);
    expect(rows.get("v3-a")?.order).toBe(1);
    expect(rows.get("v3-b")?.order).toBe(2);
    expect(rows.get("v3-c")?.order).toBe(3);
    expect(rows.get("v3-e")?.order).toBe(4);
    for (const row of rows.values()) {
      expect(row.completed).toBe(false);
      expect("emoji" in row).toBe(false);
      expect("colorId" in row).toBe(false);
      expect("done" in row).toBe(false);
      expect("position" in row).toBe(false);
      expect("eta" in row).toBe(false);
      expect("parentId" in row).toBe(false);
      expect("etaMinutes" in row).toBe(false);
    }
    expect(await db.table("appMeta").get("pinnedTaskId")).toBeUndefined();
  });

  it("a version-1 database opens at 6 with completed false, dense order and the v6 shape", async () => {
    const legacy: LegacyTask[] = [
      { id: "v1-a", title: "A", eta: 1, completed: 0, position: 0, emoji: "🥔", colorId: "tomato" },
      { id: "v1-b", title: "B", eta: 1, completed: 0, position: 1, emoji: "🍅", colorId: "sage" },
      { id: "v1-c", title: "C", eta: 1, completed: 0, position: 2, emoji: "🌿", colorId: "sky" },
    ];
    await seedVersion1DatabaseForTests({ tasks: legacy, pinnedTaskId: null });
    const db = await openDatabase();
    expect(db.verno).toBe(6);
    const rows = await rawTasks();
    expect(rows.map((row) => row.order).sort()).toEqual([0, 1, 2]);
    for (const row of rows) {
      expect(row.completed).toBe(false);
      expect("emoji" in row).toBe(false);
      expect("colorId" in row).toBe(false);
      expect("done" in row).toBe(false);
      expect("position" in row).toBe(false);
      expect("eta" in row).toBe(false);
      expect(Number.isInteger(row.createdAt)).toBe(true);
      expect(row.createdAt).toBe(row.updatedAt);
    }
  });

  it("a version-4 database (rows carrying done) opens at 6 with done carried into completed and the count preserved", async () => {
    await seedVersion4DatabaseForTests({
      tasks: [
        { id: "v4-a", title: "A", eta: 1, completed: 0, position: 0, done: false, emoji: "🥔", colorId: "tomato" },
        { id: "v4-b", title: "B", eta: 2, completed: 4, position: 1, done: true, emoji: "🍅", colorId: "sage" },
      ],
    });
    const db = await openDatabase();
    expect(db.verno).toBe(6);
    const rows = byId(await rawTasks());
    expect(rows.get("v4-b")?.completed).toBe(true);
    expect(rows.get("v4-b")?.completedPomodoros).toBe(4);
    expect(rows.get("v4-a")?.completed).toBe(false);
    expect(rows.get("v4-a")?.order).toBe(0);
    expect(rows.get("v4-b")?.order).toBe(1);
    expect("emoji" in (rows.get("v4-b") ?? {})).toBe(false);
  });
});
