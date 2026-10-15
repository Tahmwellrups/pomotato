import { expect, type Page } from "@playwright/test";

/**
 * Opens the "Your tasks" dialog on `/` and waits until its list has finished
 * loading, so the caller starts from the ready state rather than "Loading...".
 * Call this after any navigation or reload: a reload closes the dialog.
 */
export async function openTaskList(page: Page) {
  const trigger = page.getByRole("button", { name: "Your tasks", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Your tasks", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Loading your tasks…")).toHaveCount(0);
  // Let the open fade/zoom finish. Axe and colour sampling taken mid-fade read
  // the faded text colours and report false contrast failures.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
  return dialog;
}

/**
 * Closes the open task dialog via its Close button, then waits for it to be
 * gone. Needed before clicking anything behind the modal (the timer, the
 * current task card) because the overlay intercepts pointer events.
 */
export async function closeTaskList(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Your tasks", exact: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
