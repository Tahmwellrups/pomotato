import Dexie, { type EntityTable } from "dexie";
import { DatabaseBlockedError, DatabaseUnavailableError } from "./errors";
import type { AppMetaRecord, SessionRecord, TaskRecord } from "./types";

export const DATABASE_NAME = "pomotato";

/**
 * The version number of the original (version-1) schema block below. It is
 * deliberately NOT bumped: the `.version(SCHEMA_VERSION)` block is frozen, and
 * every later schema change is a new `.version(n)` block beside it so that
 * existing data upgrades in place. See `CURRENT_SCHEMA_VERSION` for the
 * version the app actually opens.
 */
export const SCHEMA_VERSION = 1;

/** The schema version the app opens. Version 2 adds the `sessions` table. */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * How long an upgrade may stay blocked by another open connection (usually
 * another tab still on the old schema) before `openDatabase()` gives up and
 * rejects with `DatabaseBlockedError`. The blocked event fires immediately on
 * the open attempt, so the user sees the message about this long after load.
 */
export const BLOCKED_UPGRADE_TIMEOUT_MS = 5000;

export class PomotatoDatabase extends Dexie {
  tasks!: EntityTable<TaskRecord, "id">;
  appMeta!: EntityTable<AppMetaRecord, "key">;
  sessions!: EntityTable<SessionRecord, "id">;
  /** True from the moment an open attempt reports it is blocked until an open succeeds. */
  blockedByOtherConnection = false;

  constructor() {
    super(DATABASE_NAME);
    this.version(SCHEMA_VERSION).stores({
      // `position` indexed so a later version could query/sort by it directly;
      // the repository currently reads the whole table and sorts in memory,
      // which is simpler to keep uniqueness-correct at this table size.
      tasks: "id, position",
      appMeta: "key",
    });
    // Added alongside (never inside) the version-1 block. `tasks` and
    // `appMeta` are not restated: Dexie carries them forward unchanged, so
    // existing rows are never touched by the upgrade.
    //   id       primary key
    //   &runId   UNIQUE: the durable exactly-once guard, enforced by IndexedDB
    //   endedAt  range index for the stats window query
    this.version(CURRENT_SCHEMA_VERSION).stores({
      sessions: "id, &runId, endedAt",
    });
    this.on("blocked", () => {
      this.blockedByOtherConnection = true;
    });
  }
}

let instance: PomotatoDatabase | null = null;
let pendingOpen: Promise<PomotatoDatabase> | null = null;

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
  pendingOpen = null;
}

/**
 * Opens the database and resolves with it, or rejects with a typed error.
 * Every repository function awaits this, so no caller can hang on a blocked
 * upgrade:
 * - `DatabaseUnavailableError` when IndexedDB does not exist.
 * - `DatabaseBlockedError` when the version upgrade is blocked by another
 *   connection and stays blocked for `BLOCKED_UPGRADE_TIMEOUT_MS`.
 * - Whatever Dexie rejects with for any other open failure.
 * A rejected call can be retried; it succeeds once the other tab closes.
 */
export function openDatabase(): Promise<PomotatoDatabase> {
  // Concurrent callers share ONE attempt, so their continuations resume in the
  // order they called (callers fired together keep their relative write order).
  if (pendingOpen) return pendingOpen;
  let db: PomotatoDatabase;
  try {
    db = getDatabase();
  } catch (error) {
    return Promise.reject(error);
  }
  if (db.isOpen()) return Promise.resolve(db);

  const attempt = new Promise<PomotatoDatabase>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const armTimer = () => {
      if (timer !== undefined || settled) return;
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        db.on("blocked").unsubscribe(armTimer);
        reject(new DatabaseBlockedError());
      }, BLOCKED_UPGRADE_TIMEOUT_MS);
    };

    db.on("blocked", armTimer);
    // A previous attempt may already have seen the blocked event, which only
    // fires once per underlying open request.
    if (db.blockedByOtherConnection) armTimer();

    db.open().then(
      () => {
        db.blockedByOtherConnection = false;
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        db.on("blocked").unsubscribe(armTimer);
        resolve(db);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        db.on("blocked").unsubscribe(armTimer);
        reject(error);
      },
    );
  });
  pendingOpen = attempt;
  const clear = () => {
    if (pendingOpen === attempt) pendingOpen = null;
  };
  attempt.then(clear, clear);
  return attempt;
}
