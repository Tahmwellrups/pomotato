import Dexie, { type EntityTable } from "dexie";
import { DatabaseUnavailableError } from "./errors";
import type { AppMetaRecord, TaskRecord } from "./types";

export const DATABASE_NAME = "pomotato";

/**
 * Explicit schema version. Bump this (and add a new `.version(n).stores(...)`
 * block, never edit this one) when milestone 3 adds a `sessions` table, so
 * existing `tasks`/`appMeta` data upgrades in place instead of being lost.
 */
export const SCHEMA_VERSION = 1;

export class PomotatoDatabase extends Dexie {
  tasks!: EntityTable<TaskRecord, "id">;
  appMeta!: EntityTable<AppMetaRecord, "key">;

  constructor() {
    super(DATABASE_NAME);
    this.version(SCHEMA_VERSION).stores({
      // `position` indexed so a later version could query/sort by it directly;
      // the repository currently reads the whole table and sorts in memory,
      // which is simpler to keep uniqueness-correct at this table size.
      tasks: "id, position",
      appMeta: "key",
    });
  }
}

let instance: PomotatoDatabase | null = null;

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * Lazily creates (or returns) the singleton database instance. Never called
 * at module scope, so importing anything under `lib/db/` during a server
 * render or build is side-effect free. Throws `DatabaseUnavailableError`
 * (never a bare/untyped exception) when IndexedDB isn't available, instead
 * of constructing a Dexie instance that would fail later on first use.
 */
export function getDatabase(): PomotatoDatabase {
  if (!isIndexedDBAvailable()) {
    throw new DatabaseUnavailableError();
  }
  if (!instance) {
    instance = new PomotatoDatabase();
  }
  return instance;
}

/**
 * Test-only escape hatch: drops the singleton so the next `getDatabase()`
 * call constructs a fresh `PomotatoDatabase`. Needed because Dexie binds a
 * database instance to one physical IndexedDB connection; without this,
 * tests that call `resetDatabase()` (see `./test-utils`) between cases would
 * keep reusing a connection to a database they just deleted.
 */
export function __resetDatabaseInstanceForTests(): void {
  instance = null;
}
