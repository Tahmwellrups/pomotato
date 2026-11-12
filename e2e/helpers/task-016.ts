import { expect, type Locator, type Page } from "@playwright/test";
import { TASK_PANEL_NAME } from "./task-list-dialog";

/** The panel region, named by its visible "Tasks" heading (task 016 criterion 17). */
export function taskRegion(page: Page) {
  return page.getByRole("region", { name: TASK_PANEL_NAME, exact: true });
}

/** Title inputs in display order (top-level rows and subtasks alike). */
export function titleInputs(page: Page) {
  return taskRegion(page).getByRole("textbox");
}

/**
 * Reads the raw `tasks` object store in the browser, bypassing the app. This is
 * the only evidence a criterion about storage may cite: the DOM is not stored.
 */
export async function storedTasks(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const open = indexedDB.open("pomotato");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("tasks")) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction("tasks", "readonly").objectStore("tasks").getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result as Array<Record<string, unknown>>);
          };
        };
      }),
  );
}

/** Opens `/`, waits for the panel to render its list (not the loading line). */
export async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(taskRegion(page)).toBeVisible();
  await expect(page.getByText("Loading your tasks…")).toHaveCount(0, { timeout: 10_000 });
}

/** Lets the 300 ms title debounce settle (task 016 criterion 32 names a 600 ms store window). */
export async function settleDebounce(page: Page): Promise<void> {
  await page.waitForTimeout(700);
}

/**
 * Places the caret (or a selection) in a title input and waits until the DOM
 * reports it. Used instead of Home/End: in this harness Home does not move the
 * caret in a single-line input, so a test that presses Home is not testing the
 * offset it names.
 */
export async function setCaret(input: Locator, start: number, end = start): Promise<void> {
  await input.evaluate(
    (el, range: [number, number]) => {
      const field = el as HTMLInputElement;
      field.focus();
      field.setSelectionRange(range[0], range[1]);
    },
    [start, end] as [number, number],
  );
  await expect.poll(() => caretOf(input)).toEqual([start, end]);
}

/** The input's current selectionStart and selectionEnd. */
export async function caretOf(input: Locator): Promise<[number, number]> {
  return input.evaluate((el) => {
    const field = el as HTMLInputElement;
    return [field.selectionStart ?? -1, field.selectionEnd ?? -1] as [number, number];
  });
}
