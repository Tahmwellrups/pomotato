import "fake-indexeddb/auto";
import { liveQuery } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDatabase } from "./database";
import { createTask, listTasks } from "./task-repository";
import { loadBackground, storeBackground } from "./background-repository";
import { resetDatabaseForTests } from "./test-utils";

// Regression for docs/DECISIONS.md 2026-11-06: "A `liveQuery` that races any repository call
// silently subscribes to nothing". A liveQuery whose first run overlaps another repository call
// stopped re-firing after later writes. The bug is NOT background-specific: a concurrent
// listTasks() (the same table the query reads) breaks it identically. The two BUG cases below
// are the proof of that; do not read them as "something about background images".

const NEW_TITLE = "added after subscribe";

/**
 * Subscribes to listTasks() through liveQuery, optionally fires a competing repository call in
 * the same tick as the first run, waits, then writes. Reports how many emissions followed the
 * write and whether the latest emission contains the new task.
 */
async function observeAfterWrite(concurrent?: () => void): Promise<{ refiresAfterWrite: number; sawNewTask: boolean }> {
  let emissions = 0;
  let latest: string[] = [];
  const sub = liveQuery(() => listTasks()).subscribe({
    next: (rows) => {
      emissions += 1;
      latest = rows.map((row) => row.title);
    },
    error: () => {},
  });
  concurrent?.();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const before = emissions;
  await createTask({ title: NEW_TITLE });
  await new Promise((resolve) => setTimeout(resolve, 120));
  sub.unsubscribe();
  return { refiresAfterWrite: emissions - before, sawNewTask: latest.includes(NEW_TITLE) };
}

beforeEach(async () => {
  await resetDatabaseForTests();
  // Trap (DECISIONS 2026-11-06): liveQuery silently does nothing until a PomotatoDatabase has
  // been constructed, because Dexie checks its dependencies at query time. Construct it
  // explicitly so every case below exercises the real path, not a silent no-op.
  getDatabase();
});

afterEach(async () => {
  // Let any deliberately un-awaited concurrent call settle before the database is deleted.
  await new Promise((resolve) => setTimeout(resolve, 30));
  await resetDatabaseForTests();
});

describe("liveQuery keeps its subscription when a repository call races its first run", () => {
  it("control: nothing concurrent -> re-fires and shows the new task", async () => {
    const result = await observeAfterWrite();
    expect(result.refiresAfterWrite).toBeGreaterThan(0);
    expect(result.sawNewTask).toBe(true);
  });

  it("a background row alone does not break it", async () => {
    await storeBackground(new Blob([new Uint8Array(2048)], { type: "image/png" }));
    const result = await observeAfterWrite();
    expect(result.refiresAfterWrite).toBeGreaterThan(0);
    expect(result.sawNewTask).toBe(true);
  });

  it("a concurrent loadBackground at the first run does not stop it re-firing", async () => {
    const result = await observeAfterWrite(() => {
      void loadBackground("background");
    });
    expect(result.refiresAfterWrite).toBeGreaterThan(0);
    expect(result.sawNewTask).toBe(true);
  });

  it("a concurrent listTasks() of the SAME table at the first run does not stop it re-firing (not background-specific)", async () => {
    const result = await observeAfterWrite(() => {
      void listTasks();
    });
    expect(result.refiresAfterWrite).toBeGreaterThan(0);
    expect(result.sawNewTask).toBe(true);
  });
});
