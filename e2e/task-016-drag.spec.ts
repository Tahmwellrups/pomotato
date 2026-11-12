import { expect, test, type Locator, type Page } from "@playwright/test";
import { openHome, settleDebounce, storedTasks, taskRegion, titleInputs } from "./helpers/task-016";

// Task 016 criteria 48 and 49: drag by the handle only, by pointer and by keyboard.
// Both halves are behaviour, so both are asserted against STORED order (raw
// IndexedDB rows) and RENDERED order (the inputs' values), and the negative cases
// are asserted as strictly as the positives.

async function storedOrder(page: Page): Promise<string[]> {
  const rows = await storedTasks(page);
  return rows
    .slice()
    .sort((a, b) => (a.order as number) - (b.order as number))
    .map((row) => row.title as string);
}

async function renderedOrder(page: Page): Promise<string[]> {
  return (await titleInputs(page).evaluateAll((els) => (els as HTMLInputElement[]).map((el) => el.value))).filter(
    (value) => value !== "",
  );
}

/** Three stored rows, Alpha then Beta then Gamma, plus the trailing blank row. */
async function threeRows(page: Page): Promise<void> {
  await openHome(page);
  await titleInputs(page).nth(0).fill("Alpha");
  await titleInputs(page).nth(0).press("Enter");
  await page.keyboard.type("Beta");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Gamma");
  await page.keyboard.press("Enter");
  await settleDebounce(page);
  expect(await storedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
}

function handle(page: Page, title: string): Locator {
  return taskRegion(page).getByRole("button", { name: `Reorder ${title}`, exact: true });
}

/**
 * Presses the pick-up key, then yields one macrotask before the caller sends an
 * arrow. `@dnd-kit/core`'s KeyboardSensor attaches its keydown listener inside a
 * zero-delay `setTimeout` (node_modules/@dnd-kit/core/dist/core.esm.js:1158), so
 * an arrow sent in the same tick is swallowed by the vendor, not by Pomotato.
 *
 * This is a harness wait, NOT a workaround for an app defect. The window was
 * measured with 8 fresh contexts per delay: 0 ms fails 8/8, 2 ms passes 8/8, as
 * does every delay up to 100 ms. No human presses two keys inside one macrotask,
 * so a keyboard user never loses a first arrow press. See 016's Implementation
 * Notes, "Criterion 49 strict-path drop, diagnosed 2026-11-11". 50 ms is used
 * over the measured 2 ms for headroom on a loaded machine.
 */
async function pickUp(page: Page, key: "Space" | "Enter"): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(50);
}

async function pointerDrag(page: Page, from: Locator, to: Locator, offsetY: number): Promise<void> {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("no box to drag");
  const startX = a.x + a.width / 2;
  const startY = a.y + a.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + offsetY, { steps: 20 });
  await page.mouse.up();
}

test.describe("task 016 criterion 49: keyboard drag from the focused handle", () => {
  test("Space picks up, ArrowDown twice moves, Space drops: focus stays on the handle, the announcements name the row and its position, and the stored order matches the rendered order", async ({ page }) => {
    await threeRows(page);
    await handle(page, "Alpha").focus();
    await pickUp(page, "Space");
    await expect(page.getByText("Picked up Alpha. Position 1 of 3.", { exact: true })).toHaveCount(1);
    await expect(handle(page, "Alpha")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Alpha moved to position 2 of 3.", { exact: true })).toHaveCount(1);
    await expect(handle(page, "Alpha")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Alpha moved to position 3 of 3.", { exact: true })).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(page.getByText("Dropped Alpha. Position 3 of 3.", { exact: true })).toHaveCount(1);
    await expect(handle(page, "Alpha")).toBeFocused();
    await settleDebounce(page);
    expect(await renderedOrder(page)).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(await storedOrder(page)).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  test("Escape cancels a keyboard drag and returns the row to its original position, with nothing written", async ({ page }) => {
    await threeRows(page);
    await handle(page, "Beta").focus();
    await pickUp(page, "Space");
    await expect(page.getByText("Picked up Beta. Position 2 of 3.", { exact: true })).toHaveCount(1);
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText("Beta moved to position 1 of 3.", { exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByText("Cancelled. Beta returned to its original position.", { exact: true })).toHaveCount(1);
    await expect(handle(page, "Beta")).toBeFocused();
    await settleDebounce(page);
    expect(await renderedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(await storedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("Enter picks up and Enter drops, as Space does", async ({ page }) => {
    await threeRows(page);
    await handle(page, "Alpha").focus();
    await pickUp(page, "Enter");
    await expect(page.getByText("Picked up Alpha. Position 1 of 3.", { exact: true })).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Alpha moved to position 2 of 3.", { exact: true })).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Dropped Alpha. Position 2 of 3.", { exact: true })).toHaveCount(1);
    await settleDebounce(page);
    expect(await storedOrder(page)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(await renderedOrder(page)).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});

test.describe("task 016 criterion 48: pointer drag is by the handle only", () => {
  test("a pointer drag started on the handle reorders and the stored order follows", async ({ page }) => {
    await threeRows(page);
    await pointerDrag(page, handle(page, "Alpha"), titleInputs(page).nth(2), 22);
    await settleDebounce(page);
    expect(await storedOrder(page)).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(await renderedOrder(page)).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  test("a drag started on the title input reorders nothing and selects text instead", async ({ page }) => {
    await threeRows(page);
    await pointerDrag(page, titleInputs(page).nth(0), titleInputs(page).nth(2), 22);
    await settleDebounce(page);
    expect(await storedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(await renderedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("a drag started on the checkbox reorders nothing and leaves completion unchanged", async ({ page }) => {
    await threeRows(page);
    const checkbox = taskRegion(page).getByRole("checkbox", { name: "Mark Alpha as completed" });
    await pointerDrag(page, checkbox, titleInputs(page).nth(2), 22);
    await settleDebounce(page);
    expect(await storedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
    const alpha = (await storedTasks(page)).find((row) => row.title === "Alpha");
    expect(alpha?.completed).toBe(false);
  });

  test("a drag started on the kebab reorders nothing (Radix opens the menu on pointer-down, which is not a reorder)", async ({ page }) => {
    await threeRows(page);
    await pointerDrag(page, taskRegion(page).getByRole("button", { name: "Actions for Alpha" }), titleInputs(page).nth(2), 22);
    await settleDebounce(page);
    expect(await storedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(await renderedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

test.describe("task 016 criterion 49: the settled keyboard path", () => {
  test("with a 300 ms pause after each key, Space picks up, ArrowUp moves, and Escape cancels back to the original position", async ({ page }) => {
    await threeRows(page);
    await handle(page, "Beta").focus();
    await page.keyboard.press("Space");
    await expect(page.getByText("Picked up Beta. Position 2 of 3.", { exact: true })).toHaveCount(1);
    await page.waitForTimeout(300);
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText("Beta moved to position 1 of 3.", { exact: true })).toHaveCount(1);
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await expect(page.getByText("Cancelled. Beta returned to its original position.", { exact: true })).toHaveCount(1);
    await expect(handle(page, "Beta")).toBeFocused();
    await settleDebounce(page);
    expect(await storedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(await renderedOrder(page)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});
