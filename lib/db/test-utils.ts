import Dexie from "dexie";
import { DATABASE_NAME, SCHEMA_VERSION, __resetDatabaseInstanceForTests, getDatabase, openDatabase } from "./database";
import type { SessionMode, SessionRecord } from "./types";

/**
 * Test-only helper. Deletes the underlying IndexedDB database entirely and
 * drops the module-level singleton, so the next call to any repository
 * function (or `getDatabase()`) opens a fresh, empty database.
 *
 * Not imported by application code — only by tests, which should call this
 * between cases (for example in `beforeEach`) to start from a clean slate.
 * Requires an IndexedDB implementation in the test environment: Vitest's
 * jsdom does not include one, so tests need an IndexedDB fake (for example
 * `fake-indexeddb`, with its `fake-indexeddb/auto` import or an equivalent
 * setup file) — installed and configured by QA, not backend, per
 * `docs/DECISIONS.md`.
 */
export async function resetDatabaseForTests(): Promise<void> {
  const db = getDatabase();
  await db.delete();
  __resetDatabaseInstanceForTests();
}

/** Fields a test may set when seeding a session. Everything but `endedAt` has a default. */
export interface SessionSeed {
  id?: string;
  runId?: string;
  mode?: SessionMode;
  startedAt?: number;
  endedAt: number;
  plannedDurationMs?: number;
  taskId?: string | null;
  taskTitle?: string | null;
}

/**
 * Test-only. Inserts session rows directly, bypassing the repository (no
 * dedup, no task increment, no pin lookup). Defaults: random `id`/`runId`,
 * `mode: "focus"`, `plannedDurationMs: 25 min`, `startedAt = endedAt -
 * plannedDurationMs`, `taskId`/`taskTitle` null. Returns the stored rows.
 */
export async function seedSessionsForTests(seeds: SessionSeed[]): Promise<SessionRecord[]> {
  const db = await openDatabase();
  const records: SessionRecord[] = seeds.map((seed) => {
    const plannedDurationMs = seed.plannedDurationMs ?? 25 * 60 * 1000;
    return {
      id: seed.id ?? crypto.randomUUID(),
      runId: seed.runId ?? crypto.randomUUID(),
      mode: seed.mode ?? "focus",
      startedAt: seed.startedAt ?? seed.endedAt - plannedDurationMs,
      endedAt: seed.endedAt,
      plannedDurationMs,
      taskId: seed.taskId ?? null,
      taskTitle: seed.taskTitle ?? null,
    };
  });
  await db.sessions.bulkAdd(records);
  return records;
}

/** Test-only. Deletes every session row; leaves tasks and the pin alone. */
export async function clearSessionsForTests(): Promise<void> {
  const db = await openDatabase();
  await db.sessions.clear();
}

/** Test-only. Returns every stored session, ordered by `endedAt`. */
export async function listAllSessionsForTests(): Promise<SessionRecord[]> {
  const db = await openDatabase();
  return db.sessions.orderBy("endedAt").toArray();
}

/**
 * Test-only. Replaces the database with one that exists ONLY at schema
 * version 1 (`tasks`, `appMeta`; no `sessions`), holding the given tasks and
 * pin, then closes it and drops the singleton. The next repository call opens
 * it under version 2 and runs the upgrade, which is the migration scenario.
 */
export async function seedVersion1DatabaseForTests(data: { tasks: LegacyTask[]; pinnedTaskId: string | null }): Promise<void> {
  const existing = getDatabase();
  await existing.delete();
  __resetDatabaseInstanceForTests();

  const legacy = new Dexie(DATABASE_NAME);
  // Same strings as the frozen `.version(1)` block in ./database.
  legacy.version(SCHEMA_VERSION).stores({ tasks: "id, position", appMeta: "key" });
  await legacy.open();
  await legacy.table("tasks").bulkAdd(data.tasks);
  await legacy.table("appMeta").put({ key: "pinnedTaskId", value: data.pinnedTaskId });
  legacy.close();
}

/** A task row as versions 1-3 stored it: a pomodoro estimate, a numeric count, a global `position`, and still carrying `emoji` and `colorId`. */
export interface LegacyTask {
  id: string;
  title: string;
  eta: number;
  completed: number;
  position: number;
  emoji: string;
  colorId: string;
}

/**
 * Test-only. Replaces the database with one that exists ONLY at schema version
 * 3 (`tasks`, `appMeta`, `sessions`, `backgrounds`), with the given raw rows
 * and pin, then closes it and drops the singleton. The next repository call
 * opens it at the current version and runs every upgrade from 4 on (so rows come back in the version-6 shape). Rows are written as given (no
 * `done`, any `position`, whatever shape), and `pinnedTaskId: undefined`
 * stores no `appMeta` row at all. Returns nothing; read the result back
 * through `openDatabase()`.
 */
export async function seedVersion3DatabaseForTests(data: {
  tasks: Array<Record<string, unknown> & { id: string }>;
  pinnedTaskId?: string | null;
  sessions?: SessionRecord[];
  backgrounds?: Array<Record<string, unknown> & { id: string }>;
}): Promise<void> {
  const existing = getDatabase();
  await existing.delete();
  __resetDatabaseInstanceForTests();

  const legacy = new Dexie(DATABASE_NAME);
  // Same strings as the frozen version 1-3 blocks in ./database.
  legacy.version(1).stores({ tasks: "id, position", appMeta: "key" });
  legacy.version(2).stores({ sessions: "id, &runId, endedAt" });
  legacy.version(3).stores({ backgrounds: "id" });
  await legacy.open();
  await legacy.table("tasks").bulkAdd(data.tasks);
  if (data.pinnedTaskId !== undefined) {
    await legacy.table("appMeta").put({ key: "pinnedTaskId", value: data.pinnedTaskId });
  }
  if (data.sessions) await legacy.table("sessions").bulkAdd(data.sessions);
  if (data.backgrounds) await legacy.table("backgrounds").bulkAdd(data.backgrounds);
  legacy.close();
}

/**
 * Test-only. Replaces the database with one that exists ONLY at schema version
 * 4 (the same four tables as version 3, rows now carrying `done`), with the
 * given raw rows, then closes it and drops the singleton. The next repository
 * call opens it at the current version and runs every upgrade from 5 on; a fresh
 * database never runs a callback, so only a seeded open exercises them.
 * Rows are written as given, so a test can seed `emoji`/`colorId` (or junk
 * values, or neither). The retired pin row is not seedable here; version 4
 * deleted it. Read the result back with `db.table("tasks").toArray()` for raw rows.
 */
export async function seedVersion4DatabaseForTests(data: {
  tasks: Array<Record<string, unknown> & { id: string }>;
  sessions?: SessionRecord[];
  backgrounds?: Array<Record<string, unknown> & { id: string }>;
}): Promise<void> {
  const existing = getDatabase();
  await existing.delete();
  __resetDatabaseInstanceForTests();

  const legacy = new Dexie(DATABASE_NAME);
  // Same strings as the frozen version 1-4 blocks in ./database. Version 4 has no
  // `.upgrade()` here on purpose: the database is created fresh at 4, so there is
  // nothing to upgrade and the rows land exactly as seeded.
  legacy.version(1).stores({ tasks: "id, position", appMeta: "key" });
  legacy.version(2).stores({ sessions: "id, &runId, endedAt" });
  legacy.version(3).stores({ backgrounds: "id" });
  legacy.version(4).stores({});
  await legacy.open();
  await legacy.table("tasks").bulkAdd(data.tasks);
  if (data.sessions) await legacy.table("sessions").bulkAdd(data.sessions);
  if (data.backgrounds) await legacy.table("backgrounds").bulkAdd(data.backgrounds);
  legacy.close();
}

/**
 * Test-only. Replaces the database with one that exists ONLY at schema version
 * 5 (the same four tables, `tasks` indexed by `position`), with the given raw
 * rows, then closes it and drops the singleton. The next repository call opens
 * it at version 6 and runs `upgradeToVersion6`, which is the only way a test can
 * observe the rename: a fresh database never runs the callback. Rows are written
 * as given, so a test seeds `done`, a numeric `completed`, `eta` and `position`
 * (or bad values, or none). Argument shape matches `seedVersion4DatabaseForTests`.
 * Read the result back with `db.table("tasks").toArray()` for raw rows.
 */
export async function seedVersion5DatabaseForTests(data: {
  tasks: Array<Record<string, unknown> & { id: string }>;
  sessions?: SessionRecord[];
  backgrounds?: Array<Record<string, unknown> & { id: string }>;
}): Promise<void> {
  const existing = getDatabase();
  await existing.delete();
  __resetDatabaseInstanceForTests();

  const legacy = new Dexie(DATABASE_NAME);
  // Same strings as the frozen version 1-5 blocks in ./database. Versions 4 and 5 carry
  // no `.upgrade()` here on purpose: the database is created fresh at 5, so the rows
  // land exactly as seeded.
  legacy.version(1).stores({ tasks: "id, position", appMeta: "key" });
  legacy.version(2).stores({ sessions: "id, &runId, endedAt" });
  legacy.version(3).stores({ backgrounds: "id" });
  legacy.version(4).stores({});
  legacy.version(5).stores({});
  await legacy.open();
  await legacy.table("tasks").bulkAdd(data.tasks);
  if (data.sessions) await legacy.table("sessions").bulkAdd(data.sessions);
  if (data.backgrounds) await legacy.table("backgrounds").bulkAdd(data.backgrounds);
  legacy.close();
}
