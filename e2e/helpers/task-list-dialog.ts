import { expect, type Page } from "@playwright/test";
import { PREFERENCES_STORAGE_KEY } from "../../lib/preferences/schema";

/**
 * Task 015 re-point (criterion 43). The "Your tasks" dialog is deleted. Every task action now lives in
 * the always-visible panel, a `<section>` named by its "Tasks" heading. The bottom-right toggle is the
 * only way to hide or show it. The file keeps its name so the fifteen specs that import it need no
 * import-path change; the exports are the panel's, not the dialog's.
 */

export const TASK_PANEL_NAME = "Tasks";

/** The panel region on `/`. Resolves nothing while the panel is hidden. */
export function taskPanel(page: Page) {
  return page.getByRole("region", { name: TASK_PANEL_NAME, exact: true });
}

/** The single hide/show toggle in the bottom-right cluster. Its accessible name is constant; `aria-expanded` carries the state. */
export function taskPanelToggle(page: Page) {
  return page.getByRole("button", { name: TASK_PANEL_NAME, exact: true });
}

/**
 * Makes sure the panel is shown and its list has finished loading, then returns the panel region.
 * Call after any navigation or reload. A reload keeps the stored visibility, so a stored-hidden panel
 * is shown here by clicking the toggle. The stored value is read first and the toggle is only clicked
 * once `aria-expanded` has settled to `false`: before hydration the toggle reports `true` even when the
 * stored state is hidden, and clicking it then would toggle the default (shown) into hidden.
 */
export async function openTaskList(page: Page) {
  const storedVisible = await page.evaluate((key) => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as { state?: { taskPanelVisible?: unknown } } | null;
      return parsed?.state?.taskPanelVisible !== false;
    } catch {
      return true;
    }
  }, PREFERENCES_STORAGE_KEY);
  const toggle = taskPanelToggle(page);
  if (!storedVisible) {
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
  }
  const panel = taskPanel(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Loading your tasks…")).toHaveCount(0);
  // Let any running transition finish, so axe and colour sampling do not read mid-fade colours.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((x) => x.playState === "running" && x.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))),
  );
  return panel;
}
