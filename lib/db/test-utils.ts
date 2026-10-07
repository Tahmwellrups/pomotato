import { __resetDatabaseInstanceForTests, getDatabase } from "./database";

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
