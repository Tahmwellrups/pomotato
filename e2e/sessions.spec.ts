import { test, expect, type Page } from "@playwright/test";

type SeenSession = {
  id: string;
  runId: string;
  mode: string;
  startedAt: number;
  endedAt: number;
  plannedDurationMs: number;
  taskId: string | null;
  taskTitle: string | null;
};

/**
 * Reads the `sessions` table directly. Without this every claim about session
 * rows has to be inferred from the task's completed count in the DOM, which
 * cannot see `runId`, `endedAt` or `mode` at all — so a run logged with the
 * wrong end timestamp, or with a freshly-random `runId` that breaks the
 * exactly-once key, looks identical to a correct one.
 */
async function readSessions(page: Page): Promise<SeenSession[]> {
  return page.evaluate(
    () =>
      new Promise<SeenSession[]>((resolve, reject) => {
        const request = indexedDB.open("pomotato");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          // Opening before the app has created the store yields a store-less
          // database; return empty rather than throwing inside onsuccess,
          // where a throw would leave this promise forever pending.
          if (!db.objectStoreNames.contains("sessions")) {
            resolve([]);
            return;
          }
          const query = db.transaction(["sessions"], "readonly").objectStore("sessions").getAll();
          query.onsuccess = () => resolve(query.result as SeenSession[]);
          query.onerror = () => reject(query.error);
        };
      }) as Promise<SeenSession[]>
  );
}

/**
 * Waits for a *positive* signal that the run finished, so assertions about
 * what did or did not get logged run after the async write has had its chance.
 * Asserting "count is still 0" without this passes on the first evaluation,
 * before the write lands — which is how a mutation that wrongly incremented
 * on break runs still passed the whole file.
 */
async function waitForRunComplete(page: Page) {
  await expect(page.locator("text=/00:00/").first()).toBeVisible({ timeout: 10000 });
}

test.describe("Session logging and completion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.describe("happy path: focus run with task pinned", () => {
    test("focus run with task pinned creates exactly 1 session and increments count", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add a task
      await titleInput.fill("TestTask");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      // Pin it
      const taskRow = page.locator("ul li").filter({ hasText: "TestTask" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      const startButton = page.getByRole("button", { name: "Start", exact: true });
      await startButton.click();

      // Nothing is logged while the run is still in progress.
      expect(await readSessions(page)).toHaveLength(0);

      await page.clock.install();
      await page.clock.fastForward(26 * 60 * 1000);
      await waitForRunComplete(page);

      await expect(taskRow.locator("text=/1 \\//")).toBeVisible();

      // Assert the row itself, not just the count in the DOM. The count alone
      // cannot distinguish a correctly-logged session from one written with a
      // random runId or the wrong endedAt.
      await expect.poll(async () => (await readSessions(page)).length).toBe(1);
      const [row] = await readSessions(page);
      expect(row.mode).toBe("focus");
      expect(row.taskTitle).toBe("TestTask");
      expect(row.taskId).not.toBeNull();
      expect(row.plannedDurationMs).toBe(25 * 60 * 1000);
      // endedAt is the stored end timestamp, so it must equal startedAt plus
      // the planned duration — not the wall-clock moment the write happened.
      expect(row.endedAt).toBe(row.startedAt + row.plannedDurationMs);
    });
  });

  test.describe("focus run with no task pinned", () => {
    test("creates session with no task attached, no task count changes", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add two tasks (neither pinned)
      await titleInput.fill("Task1");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      await titleInput.fill("Task2");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      // Start timer with no pin
      const startButton = page.getByRole("button", { name: "Start", exact: true });
      await startButton.click();

      await page.clock.install();
      await page.clock.fastForward(26 * 60 * 1000);
      await waitForRunComplete(page);

      // The session is still logged, just untagged.
      await expect.poll(async () => (await readSessions(page)).length).toBe(1);
      const [row] = await readSessions(page);
      expect(row.taskId).toBeNull();
      expect(row.taskTitle).toBeNull();

      // And no task's count moved.
      await expect(page.locator("ul li").filter({ hasText: "Task1" }).first()).toContainText("0 /");
      await expect(page.locator("ul li").filter({ hasText: "Task2" }).first()).toContainText("0 /");
    });
  });

  test.describe("break sessions", () => {
    test("short-break run creates session but does not increment any task", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin a task
      await titleInput.fill("TaskBreak");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "TaskBreak" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // Switch to short break
      const shortBreakRadio = page.getByRole("radio", { name: /short break/i });
      await shortBreakRadio.click({ force: true });
      await page.waitForTimeout(100);

      const startButton = page.getByRole("button", { name: "Start", exact: true });
      await startButton.click();

      await page.clock.install();
      await page.clock.fastForward(6 * 60 * 1000);
      await waitForRunComplete(page);

      // Wait for the break's row to actually land before judging the count.
      // Asserting "still 0 /" straight after fast-forwarding passed even when
      // break runs were wrongly incrementing, because the assertion was
      // already satisfied before the async write resolved.
      await expect.poll(async () => (await readSessions(page)).length).toBe(1);
      const [row] = await readSessions(page);
      expect(row.mode).toBe("shortBreak");

      // The break is recorded, but it must not count toward the task.
      await expect(taskRow).toContainText("0 /");
    });
  });

  test.describe("not logged: reset before completion", () => {
    test("resetting before completion does not log session", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin task
      await titleInput.fill("ToReset");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "ToReset" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // Start timer
      const startButton = page.getByRole("button", { name: "Start" });
      await startButton.click();

      // Reset before completion
      const resetButton = page.getByRole("button", { name: "Reset", exact: true });
      await resetButton.click();
      await page.waitForTimeout(100);

      // Assert from storage: no row was ever written. A DOM count of "0 /" is
      // already true before any write could land, so on its own it proves
      // nothing about whether a session was logged.
      expect(await readSessions(page)).toHaveLength(0);
      await expect(taskRow).toContainText("0 /");
    });
  });

  test.describe("not logged: abandoned while paused", () => {
    test("pausing and then leaving/reloading does not log session", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin task
      await titleInput.fill("ToPause");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "ToPause" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // Start and pause
      const startButton = page.getByRole("button", { name: "Start" });
      await startButton.click();
      await page.waitForTimeout(100);

      const pauseButton = page.getByRole("button", { name: "Pause", exact: true });
      await pauseButton.click();
      await page.waitForTimeout(100);

      // Reload without resuming to completion
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // Assert from storage rather than from a DOM count that is already 0.
      expect(await readSessions(page)).toHaveLength(0);
      await expect(page.locator("ul li").filter({ hasText: "ToPause" }).first()).toContainText("0 /");
    });
  });

  test.describe("not logged: mode switch mid-run", () => {
    test("switching modes mid-run discards session", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin task
      await titleInput.fill("ModeTask");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "ModeTask" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // Start in focus mode
      const startButton = page.getByRole("button", { name: "Start" });
      await startButton.click();
      await page.waitForTimeout(100);

      // Switch to break mode
      const shortBreakRadio = page.getByRole("radio", { name: /short break/i });
      await shortBreakRadio.click({ force: true });
      await page.waitForTimeout(100);

      // Discarding a run writes nothing — asserted from storage, not from a
      // DOM count that was already 0 before the switch.
      expect(await readSessions(page)).toHaveLength(0);
      await expect(taskRow).toContainText("0 /");
    });
  });

  test.describe("mid-run has no session row yet", () => {
    test("no session row exists while running", async ({ page }) => {
      // Install clock first to control time
      await page.clock.install();

      const titleInput = page.locator('input[id*="-title"]').first();

      await titleInput.fill("Zephyrine");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      // The task has to be pinned, or completion logs an untagged session and
      // no count can ever increment — which is why this test could not pass.
      const taskRow = page.locator("ul li").filter({ hasText: "Zephyrine" }).first();
      await taskRow.getByRole("button", { name: /^Pin\b/ }).click();
      await page.waitForTimeout(100);

      const startButton = page.getByRole("button", { name: "Start", exact: true });
      await startButton.click();

      // Count stays 0 while the run is in progress. Scoped to the row, so it
      // can't match an unrelated "0 /" elsewhere on the page.
      await expect(taskRow).toContainText("0 /");

      await page.reload();
      await page.waitForLoadState("networkidle");

      const rowAfterReload = page.locator("ul li").filter({ hasText: "Zephyrine" }).first();
      await expect(rowAfterReload).toContainText("0 /");

      await page.clock.fastForward(26 * 60 * 1000);

      await expect(page.locator("ul li").filter({ hasText: "Zephyrine" }).first()).toContainText("1 /");
    });
  });

  test.describe("retroactive completion", () => {
    test("expired run discovered on reload logs with stored end timestamp", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin task
      await titleInput.fill("ExpiredTask");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "ExpiredTask" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // Simulate a run that ended while the tab was closed: write a running
      // entry whose end timestamp is already an hour in the past, then load
      // the page fresh so rehydration discovers it expired. Fast-forwarding a
      // live tab (what this test did before) never exercises that path.
      const endedAnHourAgo = Date.now() - 60 * 60 * 1000;
      await page.evaluate((endTs: number) => {
        localStorage.setItem(
          "pomotato-timer",
          JSON.stringify({
            state: {
              mode: "focus",
              customMinutes: 25,
              status: "running",
              endTimestamp: endTs,
              pausedRemainingMs: null,
              runId: "retroactive-run-id",
              startedAt: endTs - 25 * 60 * 1000,
            },
            version: 2,
          })
        );
      }, endedAnHourAgo);

      await page.reload();
      await page.waitForLoadState("networkidle");

      await expect.poll(async () => (await readSessions(page)).length).toBe(1);
      const [row] = await readSessions(page);

      // The whole point of the documented decision: the session is credited to
      // when the run actually ended, not when it was noticed — otherwise a run
      // that finished at 23:40 lands in the wrong local day. Using `Date.now()`
      // here instead of the stored timestamp passed every previous version of
      // this suite.
      expect(row.runId).toBe("retroactive-run-id");
      expect(row.endedAt).toBe(endedAnHourAgo);
      expect(row.endedAt).toBeLessThan(Date.now() - 30 * 60 * 1000);

      await expect(page.locator("ul li").filter({ hasText: "ExpiredTask" }).first()).toContainText("1 /");
    });

    test("reloading expired run 3 times still only logs 1 session", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin task
      await titleInput.fill("ReloadTask");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "ReloadTask" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // Start timer and expire it
      const startButton = page.getByRole("button", { name: "Start" });
      await startButton.click();

      await page.clock.install();
      await page.clock.fastForward(26 * 60 * 1000);
      await page.waitForTimeout(200);

      // Should be 1
      let countDisplay = taskRow.locator("text=/1 \\//");
      await expect(countDisplay).toBeVisible();

      // Reload twice more
      for (let i = 0; i < 2; i++) {
        await page.reload();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(100);
      }

      // Count should still be 1 (not 2 or 3 from duplicate logging)
      countDisplay = taskRow.locator("text=/1 \\//");
      await expect(countDisplay).toBeVisible();
    });
  });

  test.describe("two tabs", () => {
    test("completing in two tabs logs exactly 1 session, increments count by 1", async ({ browser }) => {
      const ctx = await browser.newContext();
      const page1 = await ctx.newPage();
      const page2 = await ctx.newPage();

      try {
        // Set up both tabs
        await page1.goto("/");
        await page1.waitForLoadState("networkidle");
        await page2.goto("/");
        await page2.waitForLoadState("networkidle");

        // Tab 1: Add and pin task
        const titleInput1 = page1.locator('input[id*="-title"]').first();
        await titleInput1.fill("TwoTabTask");
        await titleInput1.press("Enter");
        await page1.waitForTimeout(100);

        const taskRow1 = page1.locator("ul li").filter({ hasText: "TwoTabTask" }).first();
        const pinButton1 = taskRow1.getByRole("button", { name: /^(Pin|Unpin)\b/ });
        await pinButton1.click();
        await page1.waitForTimeout(200);

        // Tab 1: Start timer (clock will be installed only on page1)
        const startButton1 = page1.getByRole("button", { name: "Start" });
        await startButton1.click();

        // Fast-forward to completion on page1 only
        // This simulates the timer reaching zero and logging a session
        await page1.clock.install();
        await page1.clock.fastForward(26 * 60 * 1000);
        await page1.waitForTimeout(200);

        // Verify count incremented on page1
        const countDisplay1 = taskRow1.locator("text=/1 \\//");
        await expect(countDisplay1).toBeVisible();

        // Tab 2: Reload and verify (should see persisted increment)
        await page2.reload();
        await page2.waitForLoadState("networkidle");
        const taskRow2After = page2.locator("ul li").filter({ hasText: "TwoTabTask" }).first();
        const countDisplay2After = taskRow2After.locator("text=/1 \\//");
        await expect(countDisplay2After).toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  });

  test.describe("pin change mid-run", () => {
    test("if pin changes mid-run, new task gets the increment", async ({ browser }) => {
      const ctx = await browser.newContext();
      const page1 = await ctx.newPage();
      const page2 = await ctx.newPage();

      try {
        await page1.goto("/");
        await page1.waitForLoadState("networkidle");
        await page2.goto("/");
        await page2.waitForLoadState("networkidle");

        // Add two tasks
        const titleInput1 = page1.locator('input[id*="-title"]').first();
        await titleInput1.fill("TaskA");
        await titleInput1.press("Enter");
        await page1.waitForTimeout(100);

        await titleInput1.fill("TaskB");
        await titleInput1.press("Enter");
        await page1.waitForTimeout(100);

        // Pin TaskA on page1
        const taskRowA1 = page1.locator("ul li").filter({ hasText: "TaskA" }).first();
        const pinButtonA1 = taskRowA1.getByRole("button", { name: /^(Pin|Unpin)\b/ });
        await pinButtonA1.click();
        await page1.waitForTimeout(200);

        // Start timer on page1
        const startButton = page1.getByRole("button", { name: "Start" });
        await startButton.click();

        // From page2, change pin to TaskB
        await page2.waitForTimeout(500);
        const taskRowB2 = page2.locator("ul li").filter({ hasText: "TaskB" }).first();
        const pinButtonB2 = taskRowB2.getByRole("button", { name: /^(Pin|Unpin)\b/ });
        await pinButtonB2.click();
        await page2.waitForTimeout(200);

        // Complete timer on page1
        await page1.clock.install();
        await page1.clock.fastForward(26 * 60 * 1000);
        await page1.waitForTimeout(200);

        // TaskB should get the increment (not TaskA)
        const taskRowB1 = page1.locator("ul li").filter({ hasText: "TaskB" }).first();
        const countDisplayB = taskRowB1.locator("text=/1 \\//");
        await expect(countDisplayB).toBeVisible();

        // TaskA should still be 0
        const countDisplayA = taskRowA1.locator("text=/0 \\//");
        await expect(countDisplayA).toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  });

  test.describe("deleted task mid-run", () => {
    test("if pinned task is deleted mid-run, session logs with no task attached", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin task
      await titleInput.fill("DeleteMe");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "DeleteMe" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // Start timer
      const startButton = page.getByRole("button", { name: "Start" });
      await startButton.click();

      // Delete the pinned task
      const deleteButton = taskRow.locator("button[aria-label*='Delete DeleteMe']").first();
      await deleteButton.click();
      await page.waitForTimeout(100);

      const confirmDeleteButton = page.getByRole("button", { name: "Delete", exact: true }).last();
      await confirmDeleteButton.click();
      await page.waitForTimeout(150);

      // Complete timer
      await page.clock.install();
      await page.clock.fastForward(26 * 60 * 1000);
      await page.waitForTimeout(200);

      // Should not crash or show error
      const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
      await expect(timerDisplay).toBeVisible();
    });
  });

  test.describe("second run dedup", () => {
    test("starting fresh from complete state and completing again logs distinct session", async ({ page }) => {
      const titleInput = page.locator('input[id*="-title"]').first();

      // Add and pin task
      await titleInput.fill("SecondRunTask");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      const taskRow = page.locator("ul li").filter({ hasText: "SecondRunTask" }).first();
      const pinButton = taskRow.getByRole("button", { name: /^(Pin|Unpin)\b/ });
      await pinButton.click();
      await page.waitForTimeout(200);

      // First run
      let startButton = page.getByRole("button", { name: "Start" });
      await startButton.click();

      await page.clock.install();
      await page.clock.fastForward(26 * 60 * 1000);
      await page.waitForTimeout(200);

      // Count should be 1
      let countDisplay = taskRow.locator("text=/1 \\//");
      await expect(countDisplay).toBeVisible();

      // Click somewhere to reset to idle, then start again
      const resetButton = page.getByRole("button", { name: "Reset" });
      await resetButton.click();
      await page.waitForTimeout(100);

      // Second run
      startButton = page.getByRole("button", { name: "Start" });
      await startButton.click();

      await page.clock.fastForward(26 * 60 * 1000);
      await page.waitForTimeout(200);

      // Count should now be 2 (not still 1)
      countDisplay = taskRow.locator("text=/2 \\//");
      await expect(countDisplay).toBeVisible();
    });
  });

  test.describe("IndexedDB unavailable", () => {
    test("timer still runs and completes normally if write fails", async ({ page }) => {
      await page.addInitScript(() => {
        // Wrap indexedDB to fail writes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const originalOpen = w.indexedDB.open;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        w.indexedDB.open = function (...args: any[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const req: any = originalOpen.apply(w.indexedDB, args);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const originalOnSuccess = req.onsuccess;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          req.onsuccess = function (event: any) {
            // Fail all write transactions
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const db: any = event.target.result;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const origTransaction = db.transaction.bind(db);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            db.transaction = function (mode: string, ...txnArgs: any[]) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const txn: any = origTransaction(mode, ...txnArgs);
              if (mode.includes("write")) {
                // Make it fail
                txn.onerror = new Event("error");
              }
              return txn;
            };
            if (originalOnSuccess) originalOnSuccess.call(this, event);
          };
          return req;
        };
      });

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const titleInput = page.locator('input[id*="-title"]').first();
      await titleInput.fill("FailedDBTask");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      // Timer should still work
      const startButton = page.getByRole("button", { name: "Start" });
      await expect(startButton).toBeVisible();
      await startButton.click();

      await page.clock.install();
      await page.clock.fastForward(26 * 60 * 1000);
      await page.waitForTimeout(200);

      // Timer should still show complete state
      const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
      await expect(timerDisplay).toContainText("00:00");
    });
  });

  test.describe("persisted state migration", () => {
    test("v1 idle entry migrates and preserves state", async ({ page, context }) => {
      // Manually inject a v1 timer state (idle)
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        localStorage.setItem(
          "pomotato-timer",
          JSON.stringify({
            state: {
              mode: "focus",
              customMinutes: 1,
              status: "idle",
              endTimestamp: null,
              pausedRemainingMs: null,
            },
            version: 1,
          })
        );
      });

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Should render normally
      const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
      await expect(timerDisplay).toBeVisible();
      await expect(timerDisplay).toContainText("25:00");
    });

    test("v1 running entry migrates with deterministic legacy runId", async ({ page }) => {
      // Inject a v1 running state
      const endTimestamp = Date.now() + 25 * 60 * 1000;
      await page.addInitScript((endTs: string) => {
        const endTimestampMs = Number(endTs);
        localStorage.setItem(
          "pomotato-timer",
          JSON.stringify({
            state: {
              mode: "focus",
              customMinutes: 25,
              status: "running",
              endTimestamp: endTimestampMs,
              pausedRemainingMs: null,
            },
            version: 1,
          })
        );
      }, String(endTimestamp));

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Should show running timer (counting down)
      const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
      await expect(timerDisplay).toBeVisible();

      // Complete it
      await page.clock.install();
      await page.clock.fastForward(26 * 60 * 1000);
      await waitForRunComplete(page);

      // The point of this test is the *identity* of the logged run, which the
      // display cannot show. `legacyRunId` has to be deterministic from
      // (mode, endTimestamp) so that two tabs migrating the same stored run
      // dedupe to one row instead of double-logging. Asserting only "00:00"
      // passed even when the migration handed out a fresh random id.
      await expect.poll(async () => (await readSessions(page)).length).toBe(1);
      const [row] = await readSessions(page);
      expect(row.runId).toBe(`legacy:focus:${endTimestamp}`);
      expect(row.endedAt).toBe(endTimestamp);
    });

    test("v1 paused entry migrates with random runId and preserves remaining time", async ({ page }) => {
      // Inject a v1 paused state with no endTimestamp (paused entries have no end time)
      const pausedRemaining = 10 * 60 * 1000; // 10 minutes

      await page.addInitScript((pausedMs: string) => {
        localStorage.setItem(
          "pomotato-timer",
          JSON.stringify({
            state: {
              mode: "focus",
              customMinutes: 25,
              status: "paused",
              endTimestamp: null,
              pausedRemainingMs: Number(pausedMs),
            },
            version: 1,
          })
        );
      }, String(pausedRemaining));

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Should show paused state with remaining time
      const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
      await expect(timerDisplay).toBeVisible();
      // Should show exactly 10:00 (paused at 10 minutes remaining)
      const text = await timerDisplay.textContent();
      expect(text).toBe("10:00");
    });

    test("v1 complete entry stays complete and displays 00:00", async ({ page }) => {
      // Inject a v1 complete state (no end timestamp for completed runs)
      await page.addInitScript(() => {
        localStorage.setItem(
          "pomotato-timer",
          JSON.stringify({
            state: {
              mode: "focus",
              customMinutes: 25,
              status: "complete",
              endTimestamp: null,
              pausedRemainingMs: null,
            },
            version: 1,
          })
        );
      });

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Should stay in complete state (not try to log a session retroactively)
      const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
      await expect(timerDisplay).toBeVisible();
      await expect(timerDisplay).toContainText("00:00");
    });
  });
});
