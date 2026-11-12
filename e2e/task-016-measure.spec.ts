import { expect, test } from "@playwright/test";
import { formatSample, sampleElement, contrast, type PaintedSample } from "./helpers/task-016-sampler";
import { openHome, settleDebounce, taskRegion, titleInputs } from "./helpers/task-016";

// Task 016 group P (criteria 58 and 59): a measurement spec, kept apart from the
// behaviour specs (qa cost rule 4). One page load per theme, every element sampled
// from that one load. No background image is stored, so the ground of every row is
// --card over --background. Figures are painted pixels, see the sampler's header.

const TEXT_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3;

async function buildScene(page: import("@playwright/test").Page): Promise<void> {
  await openHome(page);
  await titleInputs(page).nth(0).fill("Sample task");
  await titleInputs(page).nth(0).press("Enter");
  await page.keyboard.type("Done task");
  await page.keyboard.press("Enter");
  await settleDebounce(page);
  await taskRegion(page).getByRole("checkbox", { name: "Mark Done task as completed" }).check();
  await settleDebounce(page);
}

async function measureTheme(page: import("@playwright/test").Page, theme: "light" | "dark"): Promise<void> {
  const rows: string[] = [];
  const results: PaintedSample[] = [];
  const record = (sample: PaintedSample, floor: number) => {
    results.push(sample);
    rows.push(formatSample(theme, sample, floor));
  };

  // Row ground, sampled before anything opens over it: the row box of the first stored row.
  const rowLi = taskRegion(page).locator("li").first();
  record(await sampleElement(page, rowLi, "row ground (li, no overlay)"), 0);

  record(await sampleElement(page, titleInputs(page).nth(0), "title input text (stored, not completed)"), TEXT_FLOOR);
  record(await sampleElement(page, titleInputs(page).nth(2), "placeholder text (empty row)"), TEXT_FLOOR);
  record(await sampleElement(page, titleInputs(page).nth(1), "completed row title (struck through)"), TEXT_FLOOR);
  record(await sampleElement(page, taskRegion(page).getByRole("button", { name: "Reorder Sample task" }), "drag handle glyph"), NON_TEXT_FLOOR);
  record(await sampleElement(page, taskRegion(page).getByRole("button", { name: "Actions for Sample task" }), "kebab glyph"), NON_TEXT_FLOOR);
  record(await sampleElement(page, page.getByRole("button", { name: "Add task" }), "+ Add task text"), TEXT_FLOOR);

  // Open menu: surface, two ordinary items, and the destructive item.
  await taskRegion(page).getByRole("button", { name: "Actions for Sample task" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  record(await sampleElement(page, menu, "open menu surface (--popover)"), NON_TEXT_FLOOR);
  record(await sampleElement(page, menu.getByRole("menuitem", { name: "Duplicate" }), "menu item Duplicate"), TEXT_FLOOR);
  record(await sampleElement(page, menu.getByRole("menuitem", { name: "Add subtask" }), "menu item Add subtask"), TEXT_FLOOR);
  record(await sampleElement(page, menu.getByRole("menuitem", { name: "Delete task" }), "menu item Delete task (--destructive)"), TEXT_FLOOR);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Undo toast: message, Undo label, toast surface.
  await taskRegion(page).getByRole("button", { name: "Actions for Sample task" }).click();
  await page.getByRole("menuitem", { name: "Delete task" }).click();
  const status = page.getByRole("status").filter({ hasText: "Undo" });
  await expect(status).toBeVisible();
  record(await sampleElement(page, status.locator("p"), "toast message text"), TEXT_FLOOR);
  record(await sampleElement(page, status.getByRole("button", { name: "Undo", exact: true }), "toast Undo label on its fill"), TEXT_FLOOR);
  record(await sampleElement(page, status.locator("div").first(), "toast surface (--popover) with its edge"), NON_TEXT_FLOOR);

  test.info().annotations.push({ type: "theme", description: theme });
  for (const line of rows) console.log("GROUP-P", line);
  // The row ground and the toast surface figures are context, not floors.
  const failed = results.filter((s, i) => {
    const floor = rows[i].includes("floor 4.5") ? TEXT_FLOOR : rows[i].includes("floor 3") ? NON_TEXT_FLOOR : 0;
    return floor > 0 && s.ratio < floor;
  });
  console.log("GROUP-P summary", theme, "samples", results.length, "failing", failed.map((s) => s.label));
  // Context figure: how far the open menu surface sits from the row ground (not a criterion floor).
  const surface = results.find((s) => s.label.startsWith("open menu surface"));
  const ground = results.find((s) => s.label.startsWith("row ground"));
  if (surface && ground) console.log("GROUP-P context", theme, "menu surface vs row ground", contrast(surface.ink, ground.ground).toFixed(2) + ":1");
  expect(failed.map((s) => s.label)).toEqual([]);
}

test.describe("task 016 group P: painted-pixel measurement, one load per theme", () => {
  test("light theme, 1280 x 800, DPR 1, no background stored", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await buildScene(page);
    await measureTheme(page, "light");
  });

  test("dark theme, 1280 x 800, DPR 1, no background stored", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await buildScene(page);
    await measureTheme(page, "dark");
  });
});
