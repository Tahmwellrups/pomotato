import { expect, test, type Locator, type Page } from "@playwright/test";
import { openTaskList, taskPanel } from "./helpers/task-list-dialog";

// Task 015 round 2, re-homing the behaviour the deleted e2e/task-list-dialog.spec.ts covered, now against
// the panel row. Covered here:
//   criterion 13 - add clears and keeps focus, valid edit returns focus to Edit, delete confirmation focus
//                  (Cancel on open, Escape to Delete, confirm to the row that took the position), +1 / -1
//                  bounds and that neither touches `done`.
//   criterion 15 - seven writes (add, edit, delete, +1, -1, tick, move up) rejected by an injected IDB write
//                  failure: the panel's role="alert" line shows, and the row shows the stored value.
//   criterion 16 - keyboard drag by Space and by Enter, and pointer drag, each completing and persisting.
//   criterion 17 - Escape in a drag, an edit and a delete confirmation cancels that layer only; Escape with
//                  nothing in progress changes nothing.
// Assertions read the DOM and the raw `tasks` object store, never the repository's return value.

declare global {
  interface Window {
    __qaFailWrites?: boolean;
  }
}

type StoredTask = { id: string; title: string; position: number; completed: number; done: boolean };

/** Makes every IDB add/put/delete/clear throw while `window.__qaFailWrites` is true. Reads are untouched. */
async function installWriteFailureSwitch(page: Page) {
  await page.addInitScript(() => {
    window.__qaFailWrites = false;
    const proto = IDBObjectStore.prototype as unknown as Record<string, (...a: unknown[]) => IDBRequest>;
    for (const method of ["add", "put", "delete", "clear"]) {
      const original = proto[method];
      // Injected failure: the store refuses the write synchronously, as a full or blocked store would.
      proto[method] = function (this: IDBObjectStore, ...args: unknown[]) {
        if (window.__qaFailWrites) throw new DOMException("QA injected write failure", "UnknownError");
        return original.apply(this, args);
      };
    }
  });
}

async function setWriteFailure(page: Page, on: boolean) {
  await page.evaluate((value) => {
    window.__qaFailWrites = value;
  }, on);
}

async function storedTasks(page: Page): Promise<StoredTask[]> {
  return page.evaluate(
    () =>
      new Promise<StoredTask[]>((resolve, reject) => {
        const request = indexedDB.open("pomotato");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("tasks")) {
            db.close();
            resolve([]);
            return;
          }
          const query = db.transaction(["tasks"], "readonly").objectStore("tasks").getAll();
          query.onerror = () => reject(query.error);
          query.onsuccess = () => {
            db.close();
            const rows = query.result as StoredTask[];
            resolve([...rows].sort((a, b) => a.position - b.position));
          };
        };
      }),
  );
}

/** Writes a field on the stored row whose title matches. Test seeding only; the app itself is not bypassed for reads. */
async function patchStoredTask(page: Page, title: string, patch: Partial<Pick<StoredTask, "completed" | "done">>) {
  await page.evaluate(
    ({ title, patch }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("pomotato");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["tasks"], "readwrite");
          const store = tx.objectStore("tasks");
          const all = store.getAll();
          all.onsuccess = () => {
            const row = (all.result as { title: string }[]).find((r) => r.title === title);
            if (!row) {
              reject(new Error(`no stored row titled ${title}`));
              return;
            }
            store.put({ ...row, ...patch });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { title, patch },
  );
}

async function addTask(page: Page, title: string) {
  const panel = taskPanel(page);
  await panel.getByLabel("Title", { exact: true }).fill(title);
  await panel.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(panel.getByRole("listitem").filter({ hasText: title }).first()).toBeVisible();
}

function rowFor(page: Page, title: string): Locator {
  return taskPanel(page).getByRole("listitem").filter({ hasText: title }).first();
}

function control(page: Page, name: string): Locator {
  return taskPanel(page).getByRole("button", { name, exact: true });
}

async function orderedTitles(page: Page): Promise<string[]> {
  return taskPanel(page)
    .getByRole("button", { name: /^Reorder / })
    .evaluateAll((els) => els.map((el) => (el.getAttribute("aria-label") ?? "").replace(/^Reorder /, "")));
}

/** The panel's own write-failure line. The form's field message carries an id and is excluded here. */
const GENERIC_FAILURE = "Couldn't save that change. Your list is showing what is stored. Try again.";
function panelLine(page: Page): Locator {
  return taskPanel(page).locator('p[role="alert"]:not([id])');
}

async function openSeeded(page: Page, titles: string[]) {
  await page.goto("/");
  await openTaskList(page);
  for (const title of titles) await addTask(page, title);
}

test.describe("criterion 13: focus after add, edit and delete, and the +1 / -1 bounds, from the panel", () => {
  test("add clears the title field and keeps focus in it", async ({ page }) => {
    await openSeeded(page, []);
    const title = taskPanel(page).getByLabel("Title", { exact: true });
    await title.fill("Alpha");
    await taskPanel(page).getByRole("button", { name: "Add task", exact: true }).click();
    await expect(title).toHaveValue("");
    await expect(title).toBeFocused();
  });

  test("a valid edit returns focus to that row's Edit control", async ({ page }) => {
    await openSeeded(page, ["Bravo"]);
    await control(page, "Edit Bravo").click();
    const field = taskPanel(page).locator("li form input").first();
    await field.fill("Charlie");
    await page.keyboard.press("Enter");
    await expect(control(page, "Edit Charlie")).toBeFocused();
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Charlie"]);
  });

  test("delete confirmation focuses Cancel; Escape cancels and returns focus to Delete", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    await control(page, "Delete Bravo").click();
    const confirmation = rowFor(page, "Bravo").locator('[role="group"]');
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(control(page, "Delete Bravo")).toBeFocused();
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  test("confirming a middle delete focuses Edit on the task that took the position", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    await control(page, "Delete Bravo").click();
    await rowFor(page, "Bravo").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(control(page, "Delete Bravo")).toHaveCount(0);
    await expect(control(page, "Edit Charlie")).toBeFocused();
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha", "Charlie"]);
  });

  test("confirming the last row's delete focuses Edit on the new last task", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    await control(page, "Delete Charlie").click();
    await rowFor(page, "Charlie").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(control(page, "Delete Charlie")).toHaveCount(0);
    await expect(control(page, "Edit Bravo")).toBeFocused();
  });

  test("confirming the only task's delete focuses the add form's title field", async ({ page }) => {
    await openSeeded(page, ["Alpha"]);
    await control(page, "Delete Alpha").click();
    await rowFor(page, "Alpha").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(taskPanel(page).getByLabel("Title", { exact: true })).toBeFocused();
  });

  test("+1 is disabled at 999 and -1 at 0; the bounds never touch done", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo"]);
    await patchStoredTask(page, "Alpha", { completed: 999, done: false });
    await page.reload();
    await openTaskList(page);
    await expect(control(page, "+1, add a completed pomodoro to Alpha")).toBeDisabled();
    await expect(control(page, "-1, remove a completed pomodoro from Bravo")).toBeDisabled();

    await control(page, "+1, add a completed pomodoro to Bravo").click();
    await expect(control(page, "-1, remove a completed pomodoro from Bravo")).toBeEnabled();
    await control(page, "-1, remove a completed pomodoro from Bravo").click();
    await expect(control(page, "-1, remove a completed pomodoro from Bravo")).toBeDisabled();

    const rows = await storedTasks(page);
    expect(rows.find((t) => t.title === "Alpha")).toMatchObject({ completed: 999, done: false });
    expect(rows.find((t) => t.title === "Bravo")).toMatchObject({ completed: 0, done: false });
  });
});

test.describe("criterion 15: a rejected write reports on the panel's alert line and the row shows the stored value", () => {
  test.beforeEach(async ({ page }) => {
    await installWriteFailureSwitch(page);
  });

  test("add: the panel line says so, and the list is unchanged", async ({ page }) => {
    await openSeeded(page, ["Alpha"]);
    await setWriteFailure(page, true);
    await taskPanel(page).getByLabel("Title", { exact: true }).fill("Bravo");
    await taskPanel(page).getByRole("button", { name: "Add task", exact: true }).click();
    await expect(panelLine(page)).toHaveText(GENERIC_FAILURE);
    await expect(taskPanel(page).getByRole("listitem").filter({ hasText: "Bravo" })).toHaveCount(0);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha"]);
  });

  // Criterion 15 says every write the panel owns "reports its failures in one place". A rejected add or edit
  // goes through runFormWrite, which sets the panel line AND rethrows into TaskForm, which sets its field
  // message. This test counts the messages the panel shows for one rejected add and expects one.
  test("one place: a rejected add shows its failure once, not on the panel line and again on the form field", async ({ page }) => {
    await openSeeded(page, ["Alpha"]);
    await setWriteFailure(page, true);
    await taskPanel(page).getByLabel("Title", { exact: true }).fill("Bravo");
    await taskPanel(page).getByRole("button", { name: "Add task", exact: true }).click();
    await expect(panelLine(page)).toHaveText(GENERIC_FAILURE);
    await expect(taskPanel(page).getByRole("alert")).toHaveCount(1);
    await setWriteFailure(page, false);
  });

  test("edit: the panel line says so, and the stored title is kept", async ({ page }) => {
    await openSeeded(page, ["Bravo"]);
    await setWriteFailure(page, true);
    await control(page, "Edit Bravo").click();
    await taskPanel(page).locator("li form input").first().fill("Charlie");
    await page.keyboard.press("Enter");
    await expect(panelLine(page)).toHaveText(GENERIC_FAILURE);
    await setWriteFailure(page, false);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Bravo"]);
  });

  test("delete: the panel line says so, and the task stays in the list", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo"]);
    await control(page, "Delete Bravo").click();
    await setWriteFailure(page, true);
    await rowFor(page, "Bravo").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(panelLine(page)).toHaveText(GENERIC_FAILURE);
    await expect(control(page, "Delete Bravo")).toBeVisible();
    await setWriteFailure(page, false);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha", "Bravo"]);
  });

  test("+1 and -1: the panel line says so, and the count shows the stored value", async ({ page }) => {
    await openSeeded(page, ["Alpha"]);
    await setWriteFailure(page, true);
    await control(page, "+1, add a completed pomodoro to Alpha").click();
    await expect(panelLine(page)).toHaveText(GENERIC_FAILURE);
    await expect(rowFor(page, "Alpha")).toContainText("0 / ");
    await setWriteFailure(page, false);
    expect((await storedTasks(page))[0]).toMatchObject({ completed: 0 });
  });

  test("tick: the panel line says so, and the checkbox reverts to the stored value", async ({ page }) => {
    await openSeeded(page, ["Alpha"]);
    await setWriteFailure(page, true);
    const box = rowFor(page, "Alpha").getByRole("checkbox");
    // A plain click, not .check(): .check() asserts the state sticks, and under an injected write failure the
    // checkbox is correctly reverted to the stored value. The revert is what this test asserts, so it is asserted here.
    await box.click({ force: true });
    await expect(panelLine(page)).toHaveText(GENERIC_FAILURE);
    await expect(box).not.toBeChecked();
    await setWriteFailure(page, false);
    expect((await storedTasks(page))[0]).toMatchObject({ done: false });
  });

  test("move up: the panel line says so, and the order is unchanged", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo"]);
    await setWriteFailure(page, true);
    await control(page, "Move Bravo up").click();
    await expect(panelLine(page)).toHaveText(GENERIC_FAILURE);
    expect(await orderedTitles(page)).toEqual(["Alpha", "Bravo"]);
    await setWriteFailure(page, false);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha", "Bravo"]);
  });
});

test.describe("criterion 16: keyboard and pointer drag inside the panel row", () => {
  test("Space picks up, ArrowDown moves, Space drops: the new order is shown and stored", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    const handle = control(page, "Reorder Alpha");
    await handle.focus();
    await page.keyboard.press("Space");
    // Same settle the existing keyboard specs use: dnd-kit starts listening for arrows just after pickup.
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    await handle.press("Space");
    await expect.poll(() => orderedTitles(page)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Bravo", "Alpha", "Charlie"]);
    await expect(handle).toBeFocused();
  });

  test("Enter picks up as well as Space", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    const handle = control(page, "Reorder Charlie");
    await handle.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(150);
    await handle.press("Enter");
    await expect.poll(() => orderedTitles(page)).toEqual(["Alpha", "Charlie", "Bravo"]);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha", "Charlie", "Bravo"]);
  });

  test("pointer drag of the first row onto the third completes and persists", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    const handle = control(page, "Reorder Alpha");
    const start = await handle.boundingBox();
    const target = await rowFor(page, "Charlie").boundingBox();
    if (!start || !target) throw new Error("handle or row has no box");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 10, { steps: 4 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect.poll(() => orderedTitles(page)).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Bravo", "Charlie", "Alpha"]);
  });
});

test.describe("criterion 17: Escape has one owner per layer and no dialog to defer to", () => {
  test("Escape during a keyboard drag cancels the drag only: order restored, focus on the handle, panel stays shown", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    const handle = control(page, "Reorder Alpha");
    await handle.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => orderedTitles(page)).not.toEqual(["Alpha", "Bravo", "Charlie"]);
    await page.keyboard.press("Escape");
    await expect.poll(() => orderedTitles(page)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
    await expect(handle).toBeFocused();
    await expect(taskPanel(page)).toBeVisible();
  });

  test("Escape during an inline edit cancels the edit only: original value, focus on Edit, panel stays shown", async ({ page }) => {
    await openSeeded(page, ["Bravo"]);
    await control(page, "Edit Bravo").click();
    await taskPanel(page).locator("li form input").first().fill("Changed");
    await page.keyboard.press("Escape");
    await expect(taskPanel(page).locator("li form")).toHaveCount(0);
    await expect(rowFor(page, "Bravo").getByText("Bravo", { exact: true })).toBeVisible();
    await expect(taskPanel(page).getByText("Changed", { exact: true })).toHaveCount(0);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Bravo"]);
    await expect(control(page, "Edit Bravo")).toBeFocused();
    await expect(taskPanel(page)).toBeVisible();
  });

  test("Escape on the delete confirmation cancels it only: task stays, focus on Delete, panel stays shown", async ({ page }) => {
    await openSeeded(page, ["Alpha", "Bravo", "Charlie"]);
    await control(page, "Delete Bravo").click();
    const confirmation = rowFor(page, "Bravo").locator('[role="group"]');
    await expect(confirmation).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
    await expect(control(page, "Delete Bravo")).toBeFocused();
    await expect(taskPanel(page)).toBeVisible();
  });

  test("Escape with nothing in progress does nothing: no navigation, the typed draft and the panel survive", async ({ page }) => {
    await openSeeded(page, ["Alpha"]);
    const url = page.url();
    const title = taskPanel(page).getByLabel("Title", { exact: true });
    await title.fill("Draft");
    await page.keyboard.press("Escape");
    await expect(taskPanel(page)).toBeVisible();
    await expect(title).toHaveValue("Draft");
    expect(page.url()).toBe(url);
    expect((await storedTasks(page)).map((t) => t.title)).toEqual(["Alpha"]);
    await control(page, "Edit Alpha").focus();
    await page.keyboard.press("Escape");
    await expect(taskPanel(page)).toBeVisible();
    await expect(control(page, "Edit Alpha")).toBeFocused();
  });
});
