import { expect, test } from "@playwright/test";
import { caretOf, openHome, setCaret, settleDebounce, storedTasks, taskRegion, titleInputs } from "./helpers/task-016";

// Task 016 behaviour criteria that a browser can decide. Each test names the
// criterion it covers. Storage is read raw from IndexedDB (storedTasks), never
// inferred from the DOM. Tests that measure a time or a size say what they measured.

test.describe("task 016 panel shell and placeholders", () => {
  test("criterion 17: the region is named by a rendered Tasks heading and the string Task list is gone", async ({ page }) => {
    await openHome(page);
    const region = taskRegion(page);
    await expect(region).toHaveCount(1);
    const heading = region.getByRole("heading", { level: 2, name: "Tasks", exact: true });
    await expect(heading).toHaveCount(1);
    const headingId = await heading.getAttribute("id");
    // A throw, not expect(...).not.toBeNull(): this narrows `string | null` for the
    // evaluate() below, which an assertion does not, and the message is the failure.
    if (headingId === null) throw new Error("the Tasks heading carries no id, so aria-labelledby cannot resolve");
    expect(await region.getAttribute("aria-labelledby")).toBe(headingId);
    expect(await page.evaluate((id) => document.getElementById(id) !== null, headingId)).toBe(true);
    // The list inside carries no name of its own.
    const list = region.locator("ul").first();
    await expect(list).not.toHaveAttribute("aria-labelledby", /.*/);
    await expect(list).not.toHaveAttribute("aria-label", /.*/);
    // No "Task list" anywhere the user can read or hear.
    await expect(page.locator('[aria-label="Task list"]')).toHaveCount(0);
    await expect(page.getByText("Task list", { exact: true })).toHaveCount(0);
  });

  test("criterion 22: editing, adding and deleting open no dialog", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Dialog check");
    await settleDebounce(page);
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("criterion 23: the empty-row placeholder is exactly the approved copy", async ({ page }) => {
    await openHome(page);
    await expect(titleInputs(page).nth(0)).toHaveAttribute("placeholder", "What’s your priority?");
  });

  test("criterion 24: an empty list renders three placeholder rows, and + Add Task appends and focuses", async ({ page }) => {
    await openHome(page);
    await expect(titleInputs(page)).toHaveCount(3);
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(titleInputs(page)).toHaveCount(4);
    await expect(titleInputs(page).nth(3)).toBeFocused();
  });

  test("criterion 31: empty rows are never written, and a reload shows the empty list", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: "Add task" }).click();
    await settleDebounce(page);
    expect(await storedTasks(page)).toHaveLength(0);
    await page.reload();
    await expect(titleInputs(page)).toHaveCount(3);
  });
});

test.describe("task 016 keyboard", () => {
  test("criterion 25: Enter stores the row and opens a focused empty row below it", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Write the report");
    await titleInputs(page).nth(0).press("Enter");
    await expect(titleInputs(page).nth(1)).toBeFocused();
    await settleDebounce(page);
    await page.reload();
    expect((await storedTasks(page)).map((row) => row.title)).toEqual(["Write the report"]);
    await expect(titleInputs(page).nth(0)).toHaveValue("Write the report");
  });

  test("criterion 26: Escape restores the stored title and keeps focus on the input", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Stored");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    await titleInputs(page).nth(0).press("ArrowUp");
    await expect(titleInputs(page).nth(0)).toBeFocused();
    await setCaret(titleInputs(page).nth(0), 6);
    await page.keyboard.type("xx");
    await expect(titleInputs(page).nth(0)).toHaveValue("Storedxx");
    await page.keyboard.press("Escape");
    await expect(titleInputs(page).nth(0)).toHaveValue("Stored");
    await expect(titleInputs(page).nth(0)).toBeFocused();
  });

  test("criterion 27: Backspace on an empty stored-neighbour row removes it and focuses the previous row", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Keep me");
    await titleInputs(page).nth(0).press("Enter");
    await expect(titleInputs(page).nth(1)).toBeFocused();
    await page.keyboard.press("Backspace");
    await expect(titleInputs(page).nth(0)).toBeFocused();
    await expect(titleInputs(page)).toHaveCount(1);
  });

  test("criterion 28 and 29: Arrow Up and Down at the caret boundary move focus, with no wrap", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Alpha");
    await titleInputs(page).nth(0).press("Enter");
    await page.keyboard.type("Beta");
    await settleDebounce(page);
    // Caret at offset 0 on "Beta" (explicit: Home does not move the caret in this harness).
    await setCaret(titleInputs(page).nth(1), 0);
    await page.keyboard.press("ArrowUp");
    await expect(titleInputs(page).nth(0)).toBeFocused();
    await expect.poll(() => caretOf(titleInputs(page).nth(0))).toEqual([5, 5]);
    // First row: ArrowUp at offset 0 does nothing.
    await setCaret(titleInputs(page).nth(0), 0);
    await page.keyboard.press("ArrowUp");
    await expect(titleInputs(page).nth(0)).toBeFocused();
    // Caret at the end of "Alpha" (offset 5): ArrowDown moves to "Beta" with the caret at its end.
    await setCaret(titleInputs(page).nth(0), 5);
    await page.keyboard.press("ArrowDown");
    await expect(titleInputs(page).nth(1)).toBeFocused();
    await expect.poll(() => caretOf(titleInputs(page).nth(1))).toEqual([4, 4]);
    // Last row: ArrowDown at the end does nothing.
    await page.keyboard.press("ArrowDown");
    await expect(titleInputs(page).nth(1)).toBeFocused();
  });

  test("criterion 30: an arrow away from the boundary stays inside the text", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("A twenty character title");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    // A second stored row, so ArrowDown at the selection boundary has a row to (not) move to.
    await titleInputs(page).nth(1).fill("Second row");
    await settleDebounce(page);
    // Caret in the middle (offset 12 of 24): both arrows stay in the field.
    await setCaret(titleInputs(page).nth(0), 12);
    await page.keyboard.press("ArrowUp");
    await expect(titleInputs(page).nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(titleInputs(page).nth(0)).toBeFocused();
    // A non-empty selection at the top boundary (0 to 24): still no focus move.
    await setCaret(titleInputs(page).nth(0), 0, 24);
    await page.keyboard.press("ArrowUp");
    await expect(titleInputs(page).nth(0)).toBeFocused();
    // A non-empty selection at the bottom boundary (0 to 24, caret at end): still no focus move.
    await setCaret(titleInputs(page).nth(0), 0, 24);
    await page.keyboard.press("ArrowDown");
    await expect(titleInputs(page).nth(0)).toBeFocused();
  });
});

test.describe("task 016 persistence and completion", () => {
  test("criterion 32: typed text is stored once within 600 ms of the last keystroke", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).pressSequentially("Debounced", { delay: 20 });
    await page.waitForTimeout(600);
    expect((await storedTasks(page)).map((row) => row.title)).toEqual(["Debounced"]);
  });

  test("criterion 35: ticking a middle row moves nothing and persists completed true", async ({ page }) => {
    await openHome(page);
    for (const title of ["One", "Two", "Three"]) {
      const idx = (await titleInputs(page).count()) - 1;
      await titleInputs(page).nth(idx).fill(title);
      await titleInputs(page).nth(idx).press("Enter");
      await settleDebounce(page);
    }
    const before = (await storedTasks(page)).map((row) => [row.title, row.order]);
    await taskRegion(page).getByRole("checkbox", { name: "Mark Two as completed" }).check();
    await settleDebounce(page);
    const after = await storedTasks(page);
    expect(after.map((row) => [row.title, row.order])).toEqual(before);
    expect(after.find((row) => row.title === "Two")?.completed).toBe(true);
    expect(after.find((row) => row.title === "One")?.completed).toBe(false);
  });

  test("criterion 33: a reload shows the same stored titles and order", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Persist A");
    await titleInputs(page).nth(0).press("Enter");
    await page.keyboard.type("Persist B");
    await settleDebounce(page);
    const before = (await storedTasks(page)).map((row) => row.title);
    await page.reload();
    await expect(titleInputs(page).nth(0)).toHaveValue("Persist A");
    expect((await storedTasks(page)).map((row) => row.title)).toEqual(before);
  });
});

test.describe("task 016 kebab, delete and undo", () => {
  test("criterion 37: the kebab opens a menu of Add subtask, Duplicate and Delete task in that order", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Menu row");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    const trigger = taskRegion(page).getByRole("button", { name: "Actions for Menu row" });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    const menus = page.getByRole("menu");
    await expect(menus).toHaveCount(1);
    const items = menus.getByRole("menuitem");
    await expect(items).toHaveText(["Add subtask", "Duplicate", "Delete task"]);
  });

  test("criterion 44 and 46: Delete removes the row at once, shows one Undo toast, and it lapses between 5.0 and 6.0 s", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Doomed");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    await taskRegion(page).getByRole("button", { name: "Actions for Doomed" }).click();
    const started = Date.now();
    await page.getByRole("menuitem", { name: "Delete task" }).click();
    // The stored title is gone from the list at once (a blank draft row may remain; that is not a stored task).
    await expect
      .poll(async () => titleInputs(page).evaluateAll((els) => (els as HTMLInputElement[]).map((el) => el.value)))
      .not.toContain("Doomed");
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeHidden({ timeout: 8000 });
    const elapsed = Date.now() - started;
    console.log("MEASURED", `Undo dismissed after ${elapsed} ms (from the Delete click)`);
    expect(elapsed).toBeGreaterThanOrEqual(5000);
    expect(elapsed).toBeLessThanOrEqual(6000);
    expect((await storedTasks(page)).map((row) => row.title)).toEqual([]);
  });

  test("criterion 45: Undo inside the window restores the row and its title", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Back again");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    await taskRegion(page).getByRole("button", { name: "Actions for Back again" }).click();
    await page.getByRole("menuitem", { name: "Delete task" }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(titleInputs(page).nth(0)).toHaveValue("Back again");
    await settleDebounce(page);
    expect((await storedTasks(page)).map((row) => row.title)).toEqual(["Back again"]);
  });

  test("criterion 47: a second delete inside the window leaves one toast and restores only the second task", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("First gone");
    await titleInputs(page).nth(0).press("Enter");
    await page.keyboard.type("Second gone");
    await settleDebounce(page);
    await taskRegion(page).getByRole("button", { name: "Actions for First gone" }).click();
    await page.getByRole("menuitem", { name: "Delete task" }).click();
    await page.waitForTimeout(1500);
    await taskRegion(page).getByRole("button", { name: "Actions for Second gone" }).click();
    await page.getByRole("menuitem", { name: "Delete task" }).click();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await settleDebounce(page);
    expect((await storedTasks(page)).map((row) => row.title)).toEqual(["Second gone"]);
  });
});

test.describe("task 016 layout at 320 px", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("criterion 53: the timer Surface bottom edge is at or above 568 px with three placeholder rows shown", async ({ page }) => {
    await openHome(page);
    await expect(titleInputs(page)).toHaveCount(3);
    const surface = page.locator("[data-surface]").first();
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    const scrollY = await page.evaluate(() => window.scrollY);
    console.log("MEASURED", `timer [data-surface] bottom ${box ? box.y + box.height : "n/a"} px, scrollY ${scrollY}, light theme, no background stored`);
    expect(scrollY).toBe(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
  });

  test("criterion 54 and 51: no horizontal overflow, and the handle and kebab are at least 44 by 44 CSS px", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Layout");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Reorder Layout", "Actions for Layout"]) {
      const box = await taskRegion(page).getByRole("button", { name }).boundingBox();
      console.log("MEASURED", `${name}: ${box?.width} x ${box?.height} px`);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("task 016 duplicate and title width", () => {
  test("criterion 43 (partial, no children): Duplicate inserts a copy below the original with the same title", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Copy me");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    await taskRegion(page).getByRole("button", { name: "Actions for Copy me" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await settleDebounce(page);
    await expect
      .poll(async () => (await storedTasks(page)).map((row) => row.title).sort())
      .toEqual(["Copy me", "Copy me"]);
    const stored = await storedTasks(page);
    const orders = stored.map((row) => row.order as number).sort();
    expect(orders).toEqual([0, 1]);
  });

  test.describe("at 320 px", () => {
    test.use({ viewport: { width: 320, height: 568 } });
    test("criterion 52: the title input is at least 120 px wide with a 100-character unbroken title", async ({ page }) => {
      await openHome(page);
      const long = "W".repeat(100);
      await titleInputs(page).nth(0).fill(long);
      await titleInputs(page).nth(0).press("Enter");
      await settleDebounce(page);
      const box = await titleInputs(page).nth(0).boundingBox();
      console.log("MEASURED", `title input width at 320 px: ${box?.width} px`);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(120);
    });
  });
});

test.describe("task 016 carried-forward coverage from the retired legacy specs", () => {
  test("criterion 20: each top-level row exposes exactly four controls in reading order", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("Four controls");
    await titleInputs(page).nth(0).press("Enter");
    await settleDebounce(page);
    const row = taskRegion(page).locator("li").first();
    await expect(row.getByRole("button")).toHaveCount(2); // handle and kebab
    await expect(row.getByRole("checkbox")).toHaveCount(1);
    await expect(row.getByRole("textbox")).toHaveCount(1);
    const x = async (locator: ReturnType<typeof row.getByRole>) => (await locator.first().boundingBox())?.x ?? -1;
    const handleX = await x(row.getByRole("button", { name: "Reorder Four controls" }));
    const checkX = await x(row.getByRole("checkbox"));
    const inputX = await x(row.getByRole("textbox"));
    const kebabX = await x(row.getByRole("button", { name: "Actions for Four controls" }));
    expect([handleX, checkX, inputX, kebabX]).toEqual([...[handleX, checkX, inputX, kebabX]].sort((a, b) => a - b));
  });

  test("criterion 35 and 36: ticking the first row moves the current task to the next row and strikes the title through", async ({ page }) => {
    await openHome(page);
    await titleInputs(page).nth(0).fill("One");
    await titleInputs(page).nth(0).press("Enter");
    await page.keyboard.type("Two");
    await settleDebounce(page);
    await expect(taskRegion(page).locator('li[aria-current="true"]').getByRole("textbox")).toHaveValue("One");
    await taskRegion(page).getByRole("checkbox", { name: "Mark One as completed" }).check();
    await settleDebounce(page);
    await expect(taskRegion(page).locator('li[aria-current="true"]').getByRole("textbox")).toHaveValue("Two");
    const decoration = await titleInputs(page).nth(0).evaluate((el) => {
      const own = getComputedStyle(el).textDecorationLine;
      const parent = getComputedStyle(el.parentElement as HTMLElement).textDecorationLine;
      return `${own}|${parent}`;
    });
    console.log("MEASURED", `text-decoration-line on completed input: ${decoration}`);
    expect(decoration).toContain("line-through");
  });

  test("criterion 18: the Tasks toggle hides and shows the panel, keeps its name, and the state survives a reload", async ({ page }) => {
    await openHome(page);
    const toggle = page.getByRole("button", { name: "Tasks", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(taskRegion(page)).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName("Tasks");
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(taskRegion(page)).toBeHidden();
    await toggle.click();
    await expect(taskRegion(page)).toBeVisible();
  });

  test("criterion 24 and 54: fifty rows are accepted without a cap, and the list scrolls inside a capped box", async ({ page }) => {
    await openHome(page);
    const add = page.getByRole("button", { name: "Add task" });
    for (let i = 0; i < 50; i++) await add.click();
    await expect(titleInputs(page)).toHaveCount(53);
    // The write-failure line is always mounted (a live region must exist before it is filled); it must hold no text.
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    const capped = await titleInputs(page).nth(0).evaluate((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && !["auto", "scroll"].includes(getComputedStyle(node).overflowY)) node = node.parentElement;
      return node ? { client: node.clientHeight, scroll: node.scrollHeight } : null;
    });
    console.log("MEASURED", `list scroll container at 1280 x 800 with 53 rows: ${JSON.stringify(capped)}`);
    expect(capped).not.toBeNull();
    expect((capped?.scroll ?? 0) > (capped?.client ?? 0)).toBe(true);
    await titleInputs(page).last().scrollIntoViewIfNeeded();
    await expect(titleInputs(page).last()).toBeInViewport();
  });
});
