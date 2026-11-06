import Dexie, { type EntityTable, type Transaction } from "dexie";
import { DatabaseBlockedError, DatabaseUnavailableError } from "./errors";
import type { AppMetaRecord, BackgroundRecord, SessionRecord, TaskRecord } from "./types";

export const DATABASE_NAME = "pomotato";

/** The `appMeta` key that held the pin until version 4 retired it; the upgrade names it to delete the row. */
const PINNED_TASK_KEY = "pinnedTaskId";

/**
 * The version number of the original (version-1) schema block below. It is
 * deliberately NOT bumped: the `.version(SCHEMA_VERSION)` block is frozen, and
 * every later schema change is a new `.version(n)` block beside it so that
 * existing data upgrades in place. See `CURRENT_SCHEMA_VERSION` for the
 * version the app actually opens.
 */
export const SCHEMA_VERSION = 1;

/**
 * The schema version the app opens. Version 2 adds `sessions`, version 3 adds
 * `backgrounds`, version 4 adds `Task.done` and retires the pin, version 5 strips
 * `emoji` and `colorId` from stored tasks. Every
 * `.version(n)` block below uses a literal; the constructor checks the highest
 * one equals this constant, so a bump that forgets a block fails loudly.
 */
export const CURRENT_SCHEMA_VERSION = 5;

/**
 * How long an upgrade may stay blocked by another open connection (usually
 * another tab still on the old schema) before `openDatabase()` gives up and
 * rejects with `DatabaseBlockedError`. The blocked event fires immediately on
 * the open attempt, so the user sees the message about this long after load.
 */
export const BLOCKED_UPGRADE_TIMEOUT_MS = 5000;

/**
 * Version 3 -> 4, one transaction (Dexie's upgrade transaction), idempotent and
 * tolerant of whatever an older build wrote:
 * 1. every task row gets `done: false` (the field did not exist before this version);
 * 2. the task the old pin pointed at moves to position 0 and positions are
 *    renumbered densely; no pin, a null pin, a dangling pin, or a pin already
 *    first leaves the order alone;
 * 3. the `pinnedTaskId` row is deleted. The `appMeta` table itself stays.
 * Rows with a missing or duplicate `position` sort after valid ones, ties by id,
 * so the order is deterministic and the renumber lands on a dense assignment.
 * Never touches `sessions`.
 */
async function upgradeToVersion4(tx: Transaction): Promise<void> {
  const tasksTable = tx.table<Record<string, unknown> & { id: string }, string>("tasks");
  const metaTable = tx.table<{ key: string; value: unknown }, string>("appMeta");

  const rows = await tasksTable.toArray();
  const positionOf = (row: Record<string, unknown>): number =>
    typeof row.position === "number" && Number.isFinite(row.position) ? row.position : Number.POSITIVE_INFINITY;
  const ordered = [...rows].sort((a, b) => {
    const delta = positionOf(a) - positionOf(b);
    if (delta !== 0 && !Number.isNaN(delta)) return delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const pin = await metaTable.get(PINNED_TASK_KEY);
  const pinnedId = typeof pin?.value === "string" ? pin.value : null;
  const pinnedIndex = pinnedId === null ? -1 : ordered.findIndex((row) => row.id === pinnedId);
  if (pinnedIndex > 0) {
    const [pinned] = ordered.splice(pinnedIndex, 1);
    ordered.unshift(pinned);
  }

  // Renumbering is a no-op on clean data, so a pin already at 0 changes no position.
  await tasksTable.bulkPut(ordered.map((row, index) => ({ ...row, done: false, position: index })));
  await metaTable.delete(PINNED_TASK_KEY);
}

/** The two properties version 5 removes from every stored task row. */
const RETIRED_TASK_FIELDS = ["emoji", "colorId"] as const;

/**
 * Version 4 -> 5, one transaction (Dexie's upgrade transaction), idempotent and
 * tolerant of whatever an older build wrote:
 * 1. read every task row;
 * 2. for each row that has an own `emoji` or `colorId` property (whatever its
 *    value: a string, `null`, a number), write back a copy without them;
 * 3. rows that already lack both are not written at all, so a second run, an
 *    empty table, or clean data does no writes.
 * It never renumbers `position`, never touches `done`, and never reads or
 * writes `sessions`, `backgrounds` or `appMeta`. No validation of any other
 * field: the upgrade removes data, it does not judge what stays.
 */
async function upgradeToVersion5(tx: Transaction): Promise<void> {
  const tasksTable = tx.table<Record<string, unknown> & { id: string }, string>("tasks");
  const rows = await tasksTable.toArray();
  const stripped = rows
    .filter((row) => RETIRED_TASK_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(row, field)))
    .map((row) => {
      const clean: Record<string, unknown> & { id: string } = { ...row };
      for (const field of RETIRED_TASK_FIELDS) delete clean[field];
      return clean;
    });
  if (stripped.length > 0) await tasksTable.bulkPut(stripped);
}

export class PomotatoDatabase extends Dexie {
  tasks!: EntityTable<TaskRecord, "id">;
  appMeta!: EntityTable<AppMetaRecord, "key">;
  sessions!: EntityTable<SessionRecord, "id">;
  backgrounds!: EntityTable<BackgroundRecord, "id">;
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
    this.version(2).stores({
      sessions: "id, &runId, endedAt",
    });
    // Added beside the version-2 block, same rule. Purely additive: one new
    // table, nothing restated, no `.upgrade()` callback, so no existing row is
    // read or rewritten. At most one row is ever stored (task 010).
    // A literal, never `CURRENT_SCHEMA_VERSION`: a historical block tied to the
    // constant renumbers itself on the next bump, which drops this version and
    // makes the new block a duplicate.
    this.version(3).stores({
      backgrounds: "id",
    });
    // No `.stores()` change: `done` is a non-indexed field and the pin row lives
    // in a table that stays declared. The version exists to run the upgrade
    // (task 014), which is the first one in this repo that reads and rewrites rows.
    this.version(4)
      .stores({})
      .upgrade(upgradeToVersion4);
    // Same shape as version 4: no `.stores()` change (neither removed field was
    // indexed, `tasks: "id, position"` stands), the version exists to run the upgrade.
    this.version(5)
      .stores({})
      .upgrade(upgradeToVersion5);
    if (this.verno !== CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Highest declared schema version is ${this.verno} but CURRENT_SCHEMA_VERSION is ${CURRENT_SCHEMA_VERSION}.`,
      );
    }
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
  const shared = openShared();
  // Hand every caller its own promise, constructed here in the caller's zone.
  // `shared` may have been created by an earlier caller outside any Dexie zone,
  // where `Promise` is the native one; a native `await` does not carry a
  // liveQuery's zone across, so the reads after it were attributed to no
  // subscription and the query never re-fired. Inside a zone `Promise` is
  // Dexie's zone-aware one, so this wrapper resumes the awaiter in its own zone.
  // Each wrapper subscribes to `shared` in call order, so continuations still
  // resume in the order callers called.
  return new Promise<PomotatoDatabase>((resolve, reject) => {
    shared.then(resolve, reject);
  });
}

function openShared(): Promise<PomotatoDatabase> {
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
