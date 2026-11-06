import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, __resetDatabaseInstanceForTests, openDatabase } from "./database";
import { listTasks } from "./task-repository";
import type { SessionRecord } from "./types";
import {
  resetDatabaseForTests,
  seedVersion1DatabaseForTests,
  seedVersion3DatabaseForTests,
  seedVersion4DatabaseForTests,
} from "./test-utils";

// Task 015 criteria 4, 6, 7, 8 and 9: the version 4 -> 5 upgrade strips `emoji`
// and `colorId` and nothing else. Every case seeds a genuine version-4 (or -3,
// -1) database and reads the result back RAW through the table, never through the
// repository, because the repository would hide a field it failed to strip.

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

// Five tasks carrying the two retired fields, a done row, and dense positions 0-4.
const V4_FIVE: Array<RawRow & { title: string; eta: number; completed: number; position: number; done: boolean }> = [
  { id: "t-a", title: "First", eta: 1, completed: 0, position: 0, done: false, emoji: "🥔", colorId: "tomato" },
  { id: "t-b", title: "Second", eta: 2, completed: 3, position: 1, done: true, emoji: "🍅", colorId: "sage" },
  { id: "t-c", title: "Third", eta: 3, completed: 0, position: 2, done: false, emoji: "🌿", colorId: "sky" },
  { id: "t-d", title: "Fourth", eta: 4, completed: 999, position: 3, done: false, emoji: "🎯", colorId: "plum" },
  { id: "t-e", title: "Fifth", eta: 20, completed: 1, position: 4, done: true, emoji: "❌", colorId: "ink" },
];

beforeEach(async () => {
  await resetDatabaseForTests();
});

describe("task 015 criterion 6: a version-4 database with emoji and colorId is stripped, and nothing else moves", () => {
  it("every raw row loses both keys and keeps id, title, eta, completed, done and position value for value", async () => {
    await seedVersion4DatabaseForTests({ tasks: V4_FIVE.map((row) => ({ ...row })), sessions: [SESSION] });
    const db = await openDatabase();
    expect(db.verno).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(5);

    const after = await rawTasks();
    expect(after).toHaveLength(5);
    for (const row of after) {
      expect("emoji" in row).toBe(false);
      expect("colorId" in row).toBe(false);
    }
    const byId = new Map<string, RawRow>(after.map((row): [string, RawRow] => [row.id, row]));
    for (const before of V4_FIVE) {
      const row = byId.get(before.id);
      expect(row).toBeDefined();
      expect({
        id: row?.id,
        title: row?.title,
        eta: row?.eta,
        completed: row?.completed,
        done: row?.done,
        position: row?.position,
      }).toEqual({
        id: before.id,
        title: before.title,
        eta: before.eta,
        completed: before.completed,
        done: before.done,
        position: before.position,
      });
    }
  });

  it("sessions are untouched and appMeta resolves pinnedTaskId to undefined", async () => {
    await seedVersion4DatabaseForTests({ tasks: V4_FIVE.map((row) => ({ ...row })), sessions: [SESSION] });
    await openDatabase();
    expect(await rawTable("sessions")).toEqual([SESSION]);
    const db = await openDatabase();
    expect(await db.table("appMeta").get("pinnedTaskId")).toBeUndefined();
  });

  it("the callback runs once: a field written after the upgrade survives a later reopen", async () => {
    await seedVersion4DatabaseForTests({ tasks: V4_FIVE.map((row) => ({ ...row })) });
    const db = await openDatabase();
    await db.table("tasks").put({ ...V4_FIVE[0], id: "t-stray", position: 9, emoji: "🥔" });
    db.close();
    __resetDatabaseInstanceForTests();

    const reopened = await openDatabase();
    expect(reopened.verno).toBe(CURRENT_SCHEMA_VERSION);
    const stray = (await reopened.table("tasks").get("t-stray")) as RawRow | undefined;
    // If the callback re-ran on reopen it would have stripped this key.
    expect(stray && "emoji" in stray).toBe(true);
  });
});

describe("task 015 criterion 7: no position is renumbered and no done is flipped", () => {
  it("positions and done flags come back exactly as seeded, including done rows and a non-zero start", async () => {
    const seeded = V4_FIVE.map((row) => ({ ...row, position: row.position + 3 }));
    await seedVersion4DatabaseForTests({ tasks: seeded.map((row) => ({ ...row })) });
    const after = await rawTasks();
    const byId = new Map<string, RawRow>(after.map((row): [string, RawRow] => [row.id, row]));
    for (const before of seeded) {
      expect(byId.get(before.id)?.position).toBe(before.position);
      expect(byId.get(before.id)?.done).toBe(before.done);
    }
  });
});

describe("task 015 criterion 8: version 3 and version 1 databases still upgrade straight through to 5", () => {
  it("a version-3 database with a pin on position 3 opens at 5 with the pin first, dense positions, done false and no retired fields", async () => {
    const rows = [
      { id: "v3-a", title: "A", eta: 1, completed: 0, position: 0, emoji: "🥔", colorId: "tomato" },
      { id: "v3-b", title: "B", eta: 1, completed: 0, position: 1, emoji: "🍅", colorId: "sage" },
      { id: "v3-c", title: "C", eta: 1, completed: 0, position: 2, emoji: "🌿", colorId: "sky" },
      { id: "v3-d", title: "D", eta: 1, completed: 0, position: 3, emoji: "🎯", colorId: "plum" },
      { id: "v3-e", title: "E", eta: 1, completed: 0, position: 4, emoji: "❌", colorId: "ink" },
    ];
    await seedVersion3DatabaseForTests({ tasks: rows, pinnedTaskId: "v3-d" });
    const db = await openDatabase();
    expect(db.verno).toBe(5);

    const tasks = await listTasks();
    expect(tasks.map((t) => t.id)).toEqual(["v3-d", "v3-a", "v3-b", "v3-c", "v3-e"]);
    expect(tasks.map((t) => t.position)).toEqual([0, 1, 2, 3, 4]);
    expect(tasks.every((t) => t.done === false)).toBe(true);
    expect(await db.table("appMeta").get("pinnedTaskId")).toBeUndefined();
    for (const row of await rawTasks()) {
      expect("emoji" in row).toBe(false);
      expect("colorId" in row).toBe(false);
    }
  });

  it("a version-1 database opens at 5 with done false and no retired fields", async () => {
    const legacy = [
      { id: "v1-a", title: "A", eta: 1, completed: 0, position: 0, emoji: "🥔", colorId: "tomato" },
      { id: "v1-b", title: "B", eta: 1, completed: 0, position: 1, emoji: "🍅", colorId: "sage" },
    ];
    await seedVersion1DatabaseForTests({ tasks: legacy, pinnedTaskId: "v1-b" });
    const db = await openDatabase();
    expect(db.verno).toBe(5);
    const tasks = await listTasks();
    expect(tasks.map((t) => t.id)).toEqual(["v1-b", "v1-a"]);
    expect(tasks.every((t) => t.done === false)).toBe(true);
    for (const row of await rawTasks()) {
      expect("emoji" in row).toBe(false);
      expect("colorId" in row).toBe(false);
    }
  });
});

describe("task 015 criterion 9: bad and already-clean rows are no-ops, and the upgrade does not throw", () => {
  it("rows with the fields absent, emoji null, colorId 0, and mixed junk upgrade without throwing", async () => {
    const junk: RawRow[] = [
      { id: "j-absent", title: "Clean", eta: 1, completed: 0, position: 0, done: false },
      { id: "j-null", title: "Null emoji", eta: 1, completed: 0, position: 1, done: false, emoji: null },
      { id: "j-zero", title: "Zero colour", eta: 1, completed: 0, position: 2, done: true, colorId: 0 },
      { id: "j-str", title: "Junk", eta: 1, completed: 0, position: 3, done: false, emoji: 42, colorId: { x: 1 } },
    ];
    await expect(seedVersion4DatabaseForTests({ tasks: junk.map((row) => ({ ...row })) })).resolves.toBeUndefined();
    const after = await rawTasks();
    expect(after).toHaveLength(4);
    for (const row of after) {
      expect("emoji" in row).toBe(false);
      expect("colorId" in row).toBe(false);
    }
    expect(after.find((row) => row.id === "j-zero")?.done).toBe(true);
    expect(after.map((row) => row.position).sort()).toEqual([0, 1, 2, 3]);
  });

  it("an empty tasks table upgrades without throwing", async () => {
    await seedVersion4DatabaseForTests({ tasks: [] });
    const db = await openDatabase();
    expect(db.verno).toBe(5);
    expect(await rawTasks()).toEqual([]);
  });

  it("running the upgrade on its own output changes nothing: a reopen returns the same rows", async () => {
    await seedVersion4DatabaseForTests({ tasks: V4_FIVE.map((row) => ({ ...row })) });
    const first = await rawTasks();
    const db = await openDatabase();
    db.close();
    __resetDatabaseInstanceForTests();
    const second = await rawTasks();
    expect(second).toEqual(first);
  });
});
