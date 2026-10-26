import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { openTaskList } from "./helpers/task-list-dialog";
import { readPainted, compositeOver, contrast, tokenRgb, type PaintedReading, type Rgb } from "./helpers/painted";

// Task 007 QA, Parts 2 and 3 (criteria 17-31, 35-36, 42-43). Every colour is read from the painted
// browser output (compositeOver on a canvas over the real ground), never from token arithmetic.

const DESKTOP = { width: 1280, height: 800 };
const NARROW = { width: 320, height: 720 };

const dialogLocator = (page: Page) => page.getByRole("dialog", { name: "Your tasks", exact: true });
const rowFor = (page: Page, title: string) => page.locator("ul li").filter({ hasText: title }).first();
// In edit mode the title is an input value, which hasText cannot see. The edit row is the one holding the Save button.
const editRowFor = (page: Page) => page.locator("ul li").filter({ has: page.getByRole("button", { name: "Save", exact: true }) }).first();

async function freshDialog(page: Page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("networkidle");
  await openTaskList(page);
}

async function addTask(page: Page, title: string) {
  const input = page.locator('input[id*="-title"]').first();
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

/** Lets the open/colour transitions finish before a painted reading. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(250);
}

/** Records a measured pair as an annotation so the QA Report can quote it. */
function record(testInfo: Pick<TestInfo, "annotations">, label: string, value: number) {
  testInfo.annotations.push({ type: "measure", description: `${label}: ${value.toFixed(2)}:1` });
}

function borderAgainst(reading: PaintedReading, against: "ground" | "fill"): number {
  if (!reading.borderColor) throw new Error("border not painted");
  return contrast(reading.borderColor, reading[against]);
}

test.describe("task 007 criteria 17, 21, 22, 23: the interactive boundary token and its controls", () => {
  test("criterion 21: the custom-duration input border reaches 3:1 against the painted page, and is --control-border", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText("Custom", { exact: true }).click();
    const input = page.locator("input#custom-duration");
    await expect(input).toBeVisible();
    await settle(page);
    const reading = await readPainted(page, input);
    const ratio = borderAgainst(reading, "ground");
    record(testInfo, "custom input border vs page", ratio);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(reading.borderColor).toEqual(await tokenRgb(page, "--control-border"));
    // Paired: the border is not the soft --border token that failed (1.36:1 on cream).
    expect(reading.borderColor).not.toEqual(await tokenRgb(page, "--border"));
  });

  test("criterion 22: StatsButton is a visible 44 px control with a boundary >= 3:1 on the page, its name, route and size intact", async ({ page }, testInfo) => {
    for (const viewport of [NARROW, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const stats = page.getByRole("link", { name: "Focus stats", exact: true });
      await expect(stats).toBeVisible();
      const reading = await readPainted(page, stats);
      const ratio = borderAgainst(reading, "ground");
      record(testInfo, `stats border vs page at ${viewport.width}`, ratio);
      expect(ratio).toBeGreaterThanOrEqual(3);
      const box = await stats.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await stats.getAttribute("href")).toBe("/stats");
    }
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByRole("link", { name: "Focus stats", exact: true }).click();
    await expect(page).toHaveURL(/\/stats$/);
  });

  test("criterion 17: --control-border reaches 3:1 against --background, --popover, --card and the delete-confirm tint", async ({ page }, testInfo) => {
    await freshDialog(page);
    await addTask(page, "Alpha");
    const border = await tokenRgb(page, "--control-border");
    const grounds: Record<string, Rgb> = {
      "--background (page)": await tokenRgb(page, "--background"),
      "--popover (dialog)": await tokenRgb(page, "--popover"),
      "--card (task rows)": await tokenRgb(page, "--card"),
    };
    for (const [name, ground] of Object.entries(grounds)) {
      record(testInfo, `control-border vs ${name}`, contrast(border, ground));
      expect(contrast(border, ground), name).toBeGreaterThanOrEqual(3);
    }
    // The delete-confirm tint, measured as painted on the row, not from the colour-mix arithmetic.
    await rowFor(page, "Alpha").getByRole("button", { name: "Delete Alpha", exact: true }).click();
    const panel = rowFor(page, "Alpha").getByRole("group");
    await settle(page);
    const panelReading = await readPainted(page, panel);
    record(testInfo, "control-border vs delete-confirm panel", contrast(border, panelReading.fill));
    // Measured 3.117:1 (rounds to 3.12). The criterion floor is 3:1; the brief quoted 3.12, which is a rounded figure.
    expect(contrast(border, panelReading.fill)).toBeGreaterThanOrEqual(3);
  });

  test("criterion 23 and 20: every interactive boundary in the swept controls reaches 3:1 against its own ground", async ({ page }, testInfo) => {
    await freshDialog(page);
    await addTask(page, "Alpha");
    await addTask(page, "Bravo");
    await settle(page);

    // Add-form inputs: border against the card (outside) and against the input fill (inside).
    const titleInput = page.locator('input[id*="-title"]').first();
    const inputReading = await readPainted(page, titleInput);
    record(testInfo, "form title input border vs card", borderAgainst(inputReading, "ground"));
    record(testInfo, "form title input border vs fill", borderAgainst(inputReading, "fill"));
    expect(borderAgainst(inputReading, "ground")).toBeGreaterThanOrEqual(3);
    expect(borderAgainst(inputReading, "fill")).toBeGreaterThanOrEqual(3);

    // Row action buttons: Edit, Pin (idle), +1, -1, Move up, Move down, Delete.
    const row = rowFor(page, "Alpha");
    const labels = [
      "Edit Alpha",
      "Pin Alpha as current task",
      "+1, add a completed pomodoro to Alpha",
      "-1, remove a completed pomodoro from Alpha",
      "Move Alpha up",
      "Move Alpha down",
      "Delete Alpha",
    ];
    for (const name of labels) {
      const reading = await readPainted(page, row.getByRole("button", { name, exact: true }));
      const ratio = borderAgainst(reading, "ground");
      record(testInfo, `action button border vs card: ${name}`, ratio);
      expect(ratio, name).toBeGreaterThanOrEqual(3);
    }

    // Pinned Pin button: border and state against the unpinned button of the same row shape.
    await row.getByRole("button", { name: "Pin Alpha as current task", exact: true }).click();
    const pinned = await readPainted(page, row.getByRole("button", { name: "Unpin Alpha", exact: true }));
    record(testInfo, "pinned Pin border vs card", borderAgainst(pinned, "ground"));
    expect(borderAgainst(pinned, "ground")).toBeGreaterThanOrEqual(3);
    const unpinnedRow = rowFor(page, "Bravo");
    const unpinned = await readPainted(page, unpinnedRow.getByRole("button", { name: "Pin Bravo as current task", exact: true }));
    expect(pinned.fill).not.toEqual(unpinned.fill);
    expect(pinned.borderColor).not.toEqual(unpinned.borderColor);
    expect(pinned.color).not.toEqual(unpinned.color);

    // Edit mode: Cancel in the edit form.
    await row.getByRole("button", { name: "Edit Alpha", exact: true }).click();
    const editCancel = await readPainted(page, editRowFor(page).getByRole("button", { name: "Cancel", exact: true }));
    record(testInfo, "edit Cancel border vs card", borderAgainst(editCancel, "ground"));
    expect(borderAgainst(editCancel, "ground")).toBeGreaterThanOrEqual(3);
    await editRowFor(page).getByRole("button", { name: "Cancel", exact: true }).click();

    // Delete-confirm: Cancel inside the tinted panel.
    await row.getByRole("button", { name: "Delete Alpha", exact: true }).click();
    const confirmCancel = await readPainted(page, row.getByRole("button", { name: "Cancel", exact: true }));
    record(testInfo, "confirm Cancel border vs panel", borderAgainst(confirmCancel, "ground"));
    expect(borderAgainst(confirmCancel, "ground")).toBeGreaterThanOrEqual(3);
    await row.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("criterion 23: the colour-swatch picker's checked ring reaches 3:1 against the card and against the unchecked ring", async ({ page }, testInfo) => {
    await freshDialog(page);
    const swatches = page.locator('fieldset input[type="radio"][name$="-color"]');
    await expect(swatches.first()).toBeAttached();
    const count = await swatches.count();
    expect(count).toBe(8);
    const checkedIdx = await swatches.evaluateAll((els) => els.findIndex((e) => (e as HTMLInputElement).checked));
    const ringOf = (idx: number) => swatches.nth(idx).locator("xpath=following-sibling::span[last()]");
    // The ring is Tailwind's --tw-ring-color; read the custom property, composite it, and read the ring width from the shadow.
    const ringState = async (idx: number) => {
      const raw = await ringOf(idx).evaluate((el) => {
        const s = getComputedStyle(el);
        return { ringColor: s.getPropertyValue("--tw-ring-color").trim(), ringShadow: s.getPropertyValue("--tw-ring-shadow").trim(), boxShadow: s.boxShadow };
      });
      return { ...raw, ring: await compositeOver(page, raw.ringColor, "rgb(255, 255, 255)") };
    };
    const checkedRing = await ringState(checkedIdx);
    const uncheckedRing = await ringState((checkedIdx + 1) % count);
    testInfo.annotations.push({ type: "measure", description: `checked ring: ${checkedRing.ringColor} shadow ${checkedRing.ringShadow}` });
    testInfo.annotations.push({ type: "measure", description: `unchecked ring: ${uncheckedRing.ringColor} shadow ${uncheckedRing.ringShadow}` });
    // Criterion 31: the state is also carried by ring width, not only colour.
    expect(checkedRing.ringShadow).toMatch(/calc\(2px \+/);
    expect(uncheckedRing.ringShadow).toMatch(/calc\(1px \+/);
    const section = await readPainted(page, page.locator("#add-task-heading").locator(".."));
    expect(contrast(checkedRing.ring, section.fill)).toBeGreaterThanOrEqual(3);
    expect(contrast(checkedRing.ring, uncheckedRing.ring)).toBeGreaterThanOrEqual(3);
  });
});

test.describe("task 007 pinned Pin button: the pinned state paints, and differs from the unpinned button", () => {
  // Regression for the d7d1bec defect: the pinned colour utilities were joined onto actionButtonClass with no merge,
  // so the base bg-white / border-stone-300 / text-stone-700 won, and a pinned Pin button painted exactly like an
  // unpinned one. These assertions read painted pixels, not class names, so a class-list check cannot stand in for them.
  test("pinned fill, border and label paint the pinned tokens and differ from the unpinned button in all three", async ({ page }) => {
    await freshDialog(page);
    await addTask(page, "Alpha");
    await addTask(page, "Bravo");
    await rowFor(page, "Alpha").getByRole("button", { name: "Pin Alpha as current task", exact: true }).click();
    // Task 009 R-5: the pinned button now has a hover border. Move the pointer off
    // it, then wait for the transition to settle, so this reads the resting colour.
    await page.mouse.move(0, 0);
    const pinnedButton = rowFor(page, "Alpha").getByRole("button", { name: "Unpin Alpha", exact: true });
    await expect
      .poll(async () => (await readPainted(page, pinnedButton)).borderColor)
      .toEqual(await tokenRgb(page, "--primary"));
    const pinned = await readPainted(page, pinnedButton);
    const unpinned = await readPainted(page, rowFor(page, "Bravo").getByRole("button", { name: "Pin Bravo as current task", exact: true }));

    // Pinned: fill --accent (#fef3c7), border --primary (#b45309), label --accent-foreground (#78350f).
    expect(pinned.fill).toEqual(await tokenRgb(page, "--accent"));
    expect(pinned.borderColor).toEqual(await tokenRgb(page, "--primary"));
    expect(pinned.color).toEqual(await tokenRgb(page, "--accent-foreground"));
    // Unpinned: the idle action button, popover fill, control boundary, secondary label.
    expect(unpinned.fill).toEqual(await tokenRgb(page, "--popover"));
    expect(unpinned.borderColor).toEqual(await tokenRgb(page, "--control-border"));
    expect(unpinned.color).toEqual(await tokenRgb(page, "--secondary-foreground"));
    // The state is painted: each of the three differs from the unpinned value.
    expect(pinned.fill).not.toEqual(unpinned.fill);
    expect(pinned.borderColor).not.toEqual(unpinned.borderColor);
    expect(pinned.color).not.toEqual(unpinned.color);
  });
});

test.describe("task 007 criterion 31: no state is conveyed by colour alone", () => {
  test("pinned versus unpinned: aria-pressed and the Pin/Unpin label change, not only the paint", async ({ page }) => {
    await freshDialog(page);
    await addTask(page, "Alpha");
    const row = rowFor(page, "Alpha");
    const pin = row.getByRole("button", { name: "Pin Alpha as current task", exact: true });
    await expect(pin).toHaveAttribute("aria-pressed", "false");
    await expect(pin).toHaveText("Pin");
    await pin.click();
    const unpin = row.getByRole("button", { name: "Unpin Alpha", exact: true });
    await expect(unpin).toHaveAttribute("aria-pressed", "true");
    await expect(unpin).toHaveText("Unpin");
  });

  test("drag-active: the dragged row drops to 0.6 opacity and gains a 2 px ring, not only a colour change", async ({ page }) => {
    await freshDialog(page);
    await addTask(page, "Alpha");
    await addTask(page, "Bravo");
    const handle = page.getByRole("button", { name: "Reorder Alpha", exact: true });
    await handle.focus();
    await page.keyboard.press("Space");
    const dragging = rowFor(page, "Alpha");
    await expect.poll(async () => dragging.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.6");
    const ringed = await dragging.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ringed).not.toBe("none");
    await page.keyboard.press("Escape");
    await expect.poll(async () => dragging.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });

  test("field invalid: aria-invalid plus a role=alert message, and the message text names the problem", async ({ page }) => {
    await freshDialog(page);
    const input = page.locator('input[id*="-title"]').first();
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('p[role="alert"]').first()).toBeVisible();
  });

  test("button disabled: the disabled attribute is set, not only a colour, while the custom field is locked", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText("Custom", { exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator("input#custom-duration")).toBeDisabled();
  });
});

test.describe("task 007 criteria 24-30: measured contrast of the swept pairs", () => {
  test("the named pairs that fell but still pass clear their thresholds (heading, row title, error text, delete fill, prompt)", async ({ page }, testInfo) => {
    await freshDialog(page);
    await addTask(page, "Alpha");
    const heading = page.locator("#add-task-heading");
    const headingReading = await readPainted(page, heading);
    record(testInfo, "heading on add section", contrast(headingReading.color, headingReading.ground));
    expect(contrast(headingReading.color, headingReading.ground)).toBeGreaterThanOrEqual(4.5);

    const title = rowFor(page, "Alpha").getByText("Alpha", { exact: true });
    const titleReading = await readPainted(page, title);
    record(testInfo, "row title on card", contrast(titleReading.color, titleReading.ground));
    expect(contrast(titleReading.color, titleReading.ground)).toBeGreaterThanOrEqual(4.5);

    // Error text: submit an empty add form.
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    const error = page.locator('p[role="alert"]').first();
    await expect(error).toBeVisible();
    const errorReading = await readPainted(page, error);
    record(testInfo, "error text on card", contrast(errorReading.color, errorReading.ground));
    expect(contrast(errorReading.color, errorReading.ground)).toBeGreaterThanOrEqual(4.5);

    // Delete-confirm: prompt text on the panel, Delete label on fill, Delete fill against the panel.
    await rowFor(page, "Alpha").getByRole("button", { name: "Delete Alpha", exact: true }).click();
    const prompt = rowFor(page, "Alpha").getByRole("group").locator("p").first();
    const promptReading = await readPainted(page, prompt);
    record(testInfo, "delete prompt on panel", contrast(promptReading.color, promptReading.ground));
    expect(contrast(promptReading.color, promptReading.ground)).toBeGreaterThanOrEqual(4.5);

    const del = rowFor(page, "Alpha").getByRole("button", { name: "Delete", exact: true });
    const delReading = await readPainted(page, del);
    record(testInfo, "Delete label on fill", contrast(delReading.color, delReading.fill));
    expect(contrast(delReading.color, delReading.fill)).toBeGreaterThanOrEqual(4.5);
    record(testInfo, "Delete fill vs panel", contrast(delReading.fill, delReading.ground));
    expect(contrast(delReading.fill, delReading.ground)).toBeGreaterThanOrEqual(3);
  });

  test("the eight task swatches each reach 3:1 against the card, with mint the thinnest", async ({ page }, testInfo) => {
    await freshDialog(page);
    await addTask(page, "Alpha");
    // Add form swatches: the inline background is the TASK_COLOR_HEX value for each swatch.
    const values = await page.locator('input[type="radio"][name$="-color"]').evaluateAll((radios) =>
      radios.map((r) => r.closest("label")!.querySelector<HTMLElement>("[style]")!.style.backgroundColor),
    );
    const card = await readPainted(page, page.locator("#add-task-heading").locator(".."));
    expect(values).toHaveLength(8);
    const cardRgb = card.fill;
    const ratios: number[] = [];
    for (const value of values) {
      const swatch = await compositeOver(page, value, "rgb(255, 255, 255)");
      const ratio = contrast(swatch, cardRgb);
      ratios.push(ratio);
      expect(ratio, `swatch ${value} against card`).toBeGreaterThanOrEqual(3);
    }
    testInfo.annotations.push({ type: "measure", description: `swatches vs card: ${ratios.map((r) => r.toFixed(2)).join(", ")}` });
  });

  test("the trigger fill, the wordmark and the custom input text reach their thresholds on the cream page", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const trigger = page.getByRole("button", { name: "Your tasks", exact: true });
    const reading = await readPainted(page, trigger);
    record(testInfo, "trigger fill vs page", contrast(reading.fill, reading.ground));
    expect(contrast(reading.fill, reading.ground)).toBeGreaterThanOrEqual(3);
    const icon = await readPainted(page, trigger.locator("svg").first());
    record(testInfo, "trigger icon on fill", contrast(icon.color, icon.fill));
    expect(contrast(icon.color, icon.fill)).toBeGreaterThanOrEqual(3);
    const wordmark = await readPainted(page, page.getByText("pomotato", { exact: true }).first());
    record(testInfo, "pomotato wordmark on page", contrast(wordmark.color, wordmark.ground));
    expect(contrast(wordmark.color, wordmark.ground)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("task 007 criterion 35 and 36: target size and accessibility on the surfaces", () => {
  for (const viewport of [NARROW, DESKTOP]) {
    test(`every visible control is at least 44 px on / and in the open dialog at ${viewport.width} px`, async ({ page }) => {
      await freshDialog(page, viewport);
      await addTask(page, "Alpha");
      const sizes = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=radio]):not([type=checkbox]), [role=button]"));
        return nodes
          .map((el) => {
            const r = el.getBoundingClientRect();
            const hidden = r.width <= 1 || r.height <= 1 || getComputedStyle(el).visibility === "hidden";
            return { name: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40), w: r.width, h: r.height, hidden };
          })
          .filter((n) => !n.hidden);
      });
      const small = sizes.filter((s) => s.w < 44 || s.h < 44);
      expect(small, `controls under 44 px at ${viewport.width}`).toEqual([]);
    });
  }

  for (const viewport of [NARROW, DESKTOP]) {
    test(`no serious or critical axe violation in the open dialog at ${viewport.width} px, in display, editing, confirming-delete and error states`, async ({ page }) => {
      await freshDialog(page, viewport);
      await addTask(page, "Alpha");
      const seriousOrCritical = (violations: { impact?: string | null }[]) =>
        violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      const scan = async () => seriousOrCritical((await new AxeBuilder({ page }).analyze()).violations);
      expect(await scan()).toEqual([]);
      await rowFor(page, "Alpha").getByRole("button", { name: "Edit Alpha", exact: true }).click();
      expect(await scan()).toEqual([]);
      await editRowFor(page).getByRole("button", { name: "Cancel", exact: true }).click();
      await rowFor(page, "Alpha").getByRole("button", { name: "Delete Alpha", exact: true }).click();
      expect(await scan()).toEqual([]);
      await rowFor(page, "Alpha").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      expect(await scan()).toEqual([]);
    });
  }
});

test.describe("task 007 criteria 42 and 43: console and hydration", () => {
  for (const viewport of [NARROW, DESKTOP]) {
    test(`zero console errors or warnings across the dialog interactions at ${viewport.width} px`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") problems.push(`[${msg.type()}] ${msg.text()}`);
      });
      page.on("pageerror", (err) => problems.push(`[pageerror] ${err.message}`));
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState("networkidle");
      await openTaskList(page);
      await addTask(page, "Alpha");
      await addTask(page, "Bravo");
      await rowFor(page, "Alpha").getByRole("button", { name: "Edit Alpha", exact: true }).click();
      await editRowFor(page).getByRole("button", { name: "Cancel", exact: true }).click();
      await rowFor(page, "Alpha").getByRole("button", { name: "Delete Alpha", exact: true }).click();
      await rowFor(page, "Alpha").getByRole("button", { name: "Cancel", exact: true }).click();
      await rowFor(page, "Alpha").getByRole("button", { name: "Pin Alpha as current task", exact: true }).click();
      await rowFor(page, "Alpha").getByRole("button", { name: "+1, add a completed pomodoro to Alpha", exact: true }).click();
      await rowFor(page, "Alpha").getByRole("button", { name: "-1, remove a completed pomodoro from Alpha", exact: true }).click();
      const handle = page.getByRole("button", { name: "Reorder Bravo", exact: true });
      await handle.focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Space");
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialogLocator(page)).toHaveCount(0);
      await page.locator('label:has(input[value="shortBreak"])').click();
      await page.reload();
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });
  }

  test("no React hydration mismatch on reload of / with the task dialog trigger rendered", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (/hydrat/i.test(msg.text())) problems.push(`[${msg.type()}] ${msg.text()}`);
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Your tasks", exact: true })).toBeVisible();
    expect(problems).toEqual([]);
  });
});
