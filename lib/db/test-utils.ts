import Dexie from "dexie";
import { DATABASE_NAME, SCHEMA_VERSION, __resetDatabaseInstanceForTests, getDatabase, openDatabase } from "./database";
import type { SessionMode, SessionRecord, Task } from "./types";

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
export async function seedVersion1DatabaseForTests(data: { tasks: Task[]; pinnedTaskId: string | null }): Promise<void> {
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
