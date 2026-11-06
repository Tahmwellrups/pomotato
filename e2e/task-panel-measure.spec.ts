import { expect, test, type Locator, type Page } from "@playwright/test";
import { openTaskList, taskPanel, taskPanelToggle } from "./helpers/task-list-dialog";

// Task 015 criterion 34, measured by selector per the 2026-11-06 ruling in DECISIONS.md. The cap is on the
// panel's **Surface**: `<section>` (the region) > `:scope > [data-surface="solid"]`. The section's own
// padding (`xl:p-4 xl:pb-12 xl:pl-12`) is the gap that keeps the panel off the viewport edge, not panel, so
// it is reported but not capped.
// Measurement spec, separate from behaviour specs (qa cost rule 4). Light scheme, no background stored,
// DPR 1, scrollY 0, 1280 x 800. No image in the loop: the Surface is solid and paints `--card`.

const VIEWPORT = { width: 1280, height: 800 } as const;
const SURFACE_SELECTOR = ':scope > [data-surface="solid"]';

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box");
  return box;
}

async function addTask(page: Page, title: string) {
  const panel = taskPanel(page);
  await panel.getByLabel("Title", { exact: true }).fill(title);
  await panel.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(panel.getByRole("listitem").filter({ hasText: title }).first()).toBeVisible();
}

async function measureAt(page: Page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/");
  await openTaskList(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const section = taskPanel(page);
  const surface = section.locator(SURFACE_SELECTOR);
  await expect(surface).toHaveCount(1);
  return { section: await boxOf(section), surface: await boxOf(surface), toggle: await boxOf(taskPanelToggle(page)) };
}

test.describe("criterion 34: the panel is bounded at rest, measured on its Surface by selector", () => {
  test("1280 x 800, light, empty list: the Surface is no taller than 240 px", async ({ page }) => {
    const m = await measureAt(page);
    console.log(`[c34 empty] section ${m.section.width}x${m.section.height} at (${m.section.x},${m.section.y}); surface ${m.surface.width}x${m.surface.height} at (${m.surface.x},${m.surface.y})`);
    expect(m.surface.height).toBeLessThanOrEqual(240);
  });

  test("1280 x 800, light, three tasks: the Surface is at most 25% of the viewport area, and overlaps neither the timer Surface nor the cluster", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/");
    await openTaskList(page);
    for (const title of ["Sketch the cover", "Write the draft", "Proof the final"]) await addTask(page, title);
    await page.evaluate(() => window.scrollTo(0, 0));
    const surface = await boxOf(taskPanel(page).locator(SURFACE_SELECTOR));
    const section = await boxOf(taskPanel(page));
    const timer = await boxOf(page.locator('[data-surface="frosted"]').first());
    const toggle = await boxOf(taskPanelToggle(page));
    const area = (surface.width * surface.height) / (VIEWPORT.width * VIEWPORT.height);
    console.log(`[c34 three] section ${section.width}x${section.height}; surface ${surface.width}x${surface.height} = ${(area * 100).toFixed(1)}% of 1280x800; timer surface ${timer.width}x${timer.height} at (${timer.x},${timer.y})`);
    expect(area).toBeLessThanOrEqual(0.25);
    const overlaps = (a: typeof surface, b: typeof surface) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps(surface, timer)).toBe(false);
    expect(overlaps(surface, toggle)).toBe(false);
  });
});
