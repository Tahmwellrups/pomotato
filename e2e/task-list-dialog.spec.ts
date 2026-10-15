import { test, expect, type Page } from "@playwright/test";
import { openTaskList, closeTaskList } from "./helpers/task-list-dialog";

// Behaviour that the "Your tasks" dialog introduces. Each test drives the real
// app in Chromium; nothing here is a stub. Assertions read the DOM, computed
// styles, or the `tasks` / `sessions` IndexedDB stores directly.

const TRIGGER_NAME = "Your tasks";

function trigger(page: Page) {
  return page.getByRole("button", { name: TRIGGER_NAME, exact: true });
}

function dialogOf(page: Page) {
  return page.getByRole("dialog", { name: TRIGGER_NAME, exact: true });
}

function closeButton(page: Page) {
  return dialogOf(page).getByRole("button", { name: "Close", exact: true });
}

function titleField(page: Page) {
  return dialogOf(page).locator('input[id*="-title"]').first();
}

function handleFor(page: Page, title: string) {
  return dialogOf(page).getByRole("button", { name: `Reorder ${title}`, exact: true });
}

function liveRegion(page: Page) {
  return page.locator('[id^="DndLiveRegion"]');
}

function timerText(page: Page) {
  return page.locator("text=/\\d+:\\d+/").first();
}

/** Visible titles in the dialog's current order, read from the drag handles' aria-labels. */
async function orderedTitles(page: Page): Promise<string[]> {
  return dialogOf(page)
    .locator('ul li button[aria-label^="Reorder "]')
    .evaluateAll((els) => els.map((el) => (el.getAttribute("aria-label") ?? "").replace(/^Reorder /, "")));
}

/** Titles as stored in IndexedDB, sorted by stored position. Reads storage, not the DOM. */
async function storedTitles(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
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
            const rows = query.result as { title: string; position: number }[];
            db.close();
            resolve([...rows].sort((a, b) => a.position - b.position).map((row) => row.title));
          };
        };
      }),
  );
}

async function addTasks(page: Page, titles: string[]) {
  for (const title of titles) {
    const field = titleField(page);
    await field.fill(title);
    await field.press("Enter");
    await expect(handleFor(page, title)).toBeVisible();
  }
}

/** Collects every console error/warning and uncaught page error from the moment it is attached. */
function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function openApp(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

/**
 * Waits for running CSS animations and transitions (the dialog's open fade and
 * zoom, and the button base's `transition-all`) to finish. Colours and sizes read
 * mid-transition are not the values a user sees at rest.
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
}

/** True when the element holding focus sits inside the open dialog. */
async function focusedInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
}

type Rgb = [number, number, number];

/**
 * Converts any CSS colour string (Chromium reports oklab()/oklch() for Tailwind
 * v4 tokens) to sRGB by letting a canvas resolve it, then composites its alpha
 * over `over` so translucent colours are measured as they actually render.
 */
async function resolveColour(page: Page, css: string, over: Rgb = [255, 255, 255]): Promise<Rgb> {
  const [r, g, b, a] = await page.evaluate((colour: string) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#000000";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  }, css);
  return [
    a * r + (1 - a) * over[0],
    a * g + (1 - a) * over[1],
    a * b + (1 - a) * over[2],
  ];
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The first non-transparent background walking up from an element (what the text actually sits on). */
async function effectiveBackground(page: Page, locator: ReturnType<Page["locator"]>): Promise<Rgb> {
  const value = await locator.evaluate((el) => {
    let node: Element | null = el;
    while (node) {
      const color = getComputedStyle(node).backgroundColor;
      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
      node = node.parentElement;
    }
    return "rgb(255, 255, 255)";
  });
  return resolveColour(page, value);
}

async function computedColour(page: Page, locator: ReturnType<Page["locator"]>): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).color);
}

test.describe("Task list dialog: shell", () => {
  test("trigger is a real 44px button named by its visible text, activatable with Enter and Space", async ({ page }) => {
    await openApp(page);

    const button = trigger(page);
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => el.tagName)).toBe("BUTTON");
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await button.focus();
    await page.keyboard.press("Enter");
    await expect(dialogOf(page)).toBeVisible();
    await closeTaskList(page);

    await trigger(page).focus();
    await page.keyboard.press("Space");
    await expect(dialogOf(page)).toBeVisible();
    await closeTaskList(page);
  });

  test("trigger focus indicator is a 2px outline at least 3:1 against the page", async ({ page }) => {
    await openApp(page);

    const button = trigger(page);
    await button.focus();
    expect(await button.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    await settle(page);

    const outline = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(outline.style).toBe("solid");
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

    const ratio = contrastRatio(await resolveColour(page, outline.color), await effectiveBackground(page, button));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  test("trigger text and dialog title/description meet WCAG AA against their real backgrounds", async ({ page }) => {
    await openApp(page);

    const triggerRatio = contrastRatio(
      await resolveColour(page, await computedColour(page, trigger(page))),
      await effectiveBackground(page, trigger(page)),
    );
    expect(triggerRatio).toBeGreaterThanOrEqual(4.5);

    await trigger(page).click();
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();

    const heading = dialog.getByRole("heading", { name: TRIGGER_NAME, exact: true });
    const headingRatio = contrastRatio(
      await resolveColour(page, await computedColour(page, heading)),
      await effectiveBackground(page, heading),
    );
    expect(headingRatio).toBeGreaterThanOrEqual(4.5);

    const description = dialog.locator('[data-slot="dialog-description"]');
    const descriptionRatio = contrastRatio(
      await resolveColour(page, await computedColour(page, description)),
      await effectiveBackground(page, description),
    );
    expect(descriptionRatio).toBeGreaterThanOrEqual(4.5);
  });

  test("dialog exposes role=dialog, aria-modal=true, and a visible heading with the add form and empty state", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();

    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    await expect(dialog.getByRole("heading", { name: TRIGGER_NAME, exact: true })).toBeVisible();
    await expect(titleField(page)).toBeVisible();
    await expect(dialog.getByText("No tasks yet. Add your first one above.")).toBeVisible();
  });

  test("open, interact, close: no console warnings or errors", async ({ page }) => {
    const problems = collectConsoleProblems(page);
    await openApp(page);

    await trigger(page).click();
    await addTasks(page, ["Quiet"]);
    await closeButton(page).click();
    await expect(dialogOf(page)).toHaveCount(0);

    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await closeTaskList(page);

    expect(problems).toEqual([]);
  });

  test("Close button closes the dialog and returns focus to the trigger", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await closeButton(page).click();

    await expect(dialogOf(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(timerText(page)).toBeVisible();
  });

  test("Escape closes the dialog and returns focus to the trigger", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(dialogOf(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test("clicking the overlay outside the dialog closes it and returns focus to the trigger", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();

    // The top-left corner is outside the centred dialog, so it lands on the overlay.
    await page.mouse.click(5, 5);

    await expect(dialogOf(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(timerText(page)).toBeVisible();
  });

  test("focus lands on the Close button on open, never on Delete or the body", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["First", "Second"]);

    await closeTaskList(page);
    await trigger(page).click();

    await expect(closeButton(page)).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  });

  test("Tab and Shift+Tab stay inside the dialog and never reach the timer or Focus stats", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha", "Bravo"]);
    await closeButton(page).focus();

    const outside: string[] = [];
    const visited = new Set<string>();
    const sweep = async (key: string) => {
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press(key);
        const label = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return "none";
          return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName;
        });
        visited.add(label);
        if (!(await focusedInsideDialog(page))) outside.push(label);
      }
    };
    await sweep("Tab");
    await sweep("Shift+Tab");

    expect(outside).toEqual([]);
    // Guard against a sweep that never moved focus: it must have visited several controls.
    expect(visited.size).toBeGreaterThan(5);
  });

  test("timer keeps counting down while the dialog is open, and a paused timer stays put", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Start", exact: true }).click();
    const runningBefore = await timerText(page).textContent();

    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await page.waitForTimeout(2200);
    const runningWhileOpen = await timerText(page).textContent();
    await closeTaskList(page);

    const toSeconds = (text: string | null) => {
      const [m, s] = (text ?? "").split(":").map(Number);
      return m * 60 + s;
    };
    expect(toSeconds(runningWhileOpen)).toBeLessThan(toSeconds(runningBefore));

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const pausedAt = await timerText(page).textContent();
    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await timerText(page).textContent()).toBe(pausedAt);
    await closeTaskList(page);
  });

  test("reduced motion: overlay and content animation and transition durations are 0s, and the dialog still opens and closes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page);
    await trigger(page).click();

    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();

    const overlay = page.locator('[data-slot="dialog-overlay"]');
    const content = page.locator('[data-slot="dialog-content"]');
    for (const target of [overlay, content]) {
      const timing = await target.evaluate((el) => {
        const style = getComputedStyle(el);
        return { animation: style.animationDuration, transition: style.transitionDuration };
      });
      expect(timing.animation).toBe("0s");
      expect(timing.transition).toBe("0s");
    }

    await closeButton(page).click();
    await expect(dialog).toHaveCount(0);
    await trigger(page).click();
    await expect(dialog).toBeVisible();
  });

  test("default motion: overlay and content do animate (proves the reduced-motion check is not vacuous)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openApp(page);
    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();

    const overlay = page.locator('[data-slot="dialog-overlay"]');
    const content = page.locator('[data-slot="dialog-content"]');
    for (const target of [overlay, content]) {
      const animation = await target.evaluate((el) => getComputedStyle(el).animationDuration);
      expect(animation).not.toBe("0s");
    }
    await closeTaskList(page);
  });
});

test.describe("Task list dialog: layout", () => {
  for (const [width, height] of [
    [320, 640],
    [1280, 800],
  ] as const) {
    test(`${width}px: dialog fits with no horizontal page scroll, title clear of Close, every button at least 44px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openApp(page);

      const closedOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(closedOverflow).toBeLessThanOrEqual(0);

      await trigger(page).click();
      await expect(dialogOf(page)).toBeVisible();
      await addTasks(page, ["A title that is long enough to force wrapping in a narrow dialog"]);

      const openOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(openOverflow).toBeLessThanOrEqual(0);

      const dialogBox = await dialogOf(page).boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width);

      const heading = dialogOf(page).getByRole("heading", { name: TRIGGER_NAME, exact: true });
      const headingBox = await heading.boundingBox();
      const closeBox = await closeButton(page).boundingBox();
      expect(headingBox).not.toBeNull();
      expect(closeBox).not.toBeNull();
      const overlaps =
        headingBox!.x < closeBox!.x + closeBox!.width &&
        closeBox!.x < headingBox!.x + headingBox!.width &&
        headingBox!.y < closeBox!.y + closeBox!.height &&
        closeBox!.y < headingBox!.y + headingBox!.height;
      expect(overlaps).toBe(false);

      const controls = dialogOf(page).getByRole("button");
      const count = await controls.count();
      expect(count).toBeGreaterThan(3);
      await settle(page);
      const undersized: string[] = [];
      for (let i = 0; i < count; i++) {
        const box = await controls.nth(i).boundingBox();
        expect(box, `control #${i} is rendered and measurable`).not.toBeNull();
        if (box!.height < 44 || box!.width < 44) {
          const label = (await controls.nth(i).getAttribute("aria-label")) ?? (await controls.nth(i).textContent());
          undersized.push(`${label?.trim()} ${box!.width.toFixed(2)}x${box!.height.toFixed(2)}`);
        }
      }
      expect(undersized, "buttons in the dialog smaller than 44px").toEqual([]);

      await closeTaskList(page);
      const closedAgainOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(closedAgainOverflow).toBeLessThanOrEqual(0);
    });
  }

  test("opening and closing leaves the page scroll position unchanged", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await page.evaluate(() => window.scrollY);

    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await closeTaskList(page);

    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe("Task list dialog: long lists", () => {
  test("with 50 tasks the dialog body scrolls, the page behind does not, and the last row is reachable", async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    await trigger(page).click();
    const titles = Array.from({ length: 50 }, (_, i) => `Task-${String(i).padStart(2, "0")}`);
    await addTasks(page, titles);

    const body = dialogOf(page).locator(".overflow-y-auto").first();
    const scrollable = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrollable).toBe(true);

    const box = await body.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const last = handleFor(page, "Task-49");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();

    await body.evaluate((el) => (el.scrollTop = 0));
    await expect(titleField(page)).toBeInViewport();
    expect(await orderedTitles(page)).toEqual(titles);
  });

  test("pointer drag that needs the list to auto-scroll completes, leaves no stuck drag, and persists", async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    await trigger(page).click();
    const titles = Array.from({ length: 50 }, (_, i) => `Task-${String(i).padStart(2, "0")}`);
    await addTasks(page, titles);

    const body = dialogOf(page).locator(".overflow-y-auto").first();
    const source = handleFor(page, "Task-00");
    const sourceBox = await source.boundingBox();
    const bodyBox = await body.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();

    const grabX = sourceBox!.x + sourceBox!.width / 2;
    const grabY = sourceBox!.y + sourceBox!.height / 2;
    const bottomEdgeY = bodyBox!.y + bodyBox!.height - 4;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX, bottomEdgeY, { steps: 12 });
    // Hold at the bottom edge so dnd-kit's auto-scroll has to move the list.
    await expect.poll(() => body.evaluate((el) => el.scrollTop), { timeout: 5000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000);
    await page.mouse.move(grabX, bodyBox!.y + bodyBox!.height / 2, { steps: 12 });
    await page.waitForTimeout(300);
    await page.mouse.up();

    await expect(dialogOf(page).locator('[aria-pressed="true"]')).toHaveCount(0);
    const order = await orderedTitles(page);
    expect(new Set(order).size).toBe(50);
    expect(order.length).toBe(50);
    expect(order.indexOf("Task-00")).toBeGreaterThan(0);
    // The announced position of the drop must match the row's real index.
    const dropped = order.indexOf("Task-00") + 1;
    await expect(liveRegion(page)).toContainText(`Dropped Task-00. Position ${dropped} of 50.`);
    expect(await storedTitles(page)).toEqual(order);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await openTaskList(page);
    expect(await orderedTitles(page)).toEqual(order);
  });
});

test.describe("Task list dialog: Escape precedence", () => {
  const FIVE = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

  test("Escape during a keyboard drag cancels the drag only: dialog stays open, order restored, focus on the handle; a second Escape closes", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, FIVE);
    const original = await orderedTitles(page);
    expect(original).toEqual(FIVE);

    const alpha = handleFor(page, "Alpha");
    await alpha.focus();
    await alpha.press("Space");
    await expect(liveRegion(page)).toContainText("Picked up Alpha. Position 1 of 5.");
    // Same settle the existing keyboard specs use: dnd-kit starts listening for arrows just after pickup.
    await page.waitForTimeout(150);
    await alpha.press("ArrowDown");
    await expect(liveRegion(page)).toContainText("Alpha moved to position 2 of 5.");
    await expect(dialogOf(page).locator('[aria-roledescription="sortable"][aria-pressed="true"]')).toHaveCount(1);
    expect(await orderedTitles(page)).not.toEqual(original);

    await page.keyboard.press("Escape");
    // Wait for the drag to be torn down before the next key, or the second Escape can be swallowed.
    await expect(dialogOf(page).locator('[aria-roledescription="sortable"][aria-pressed="true"]')).toHaveCount(0);

    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");
    expect(await orderedTitles(page)).toEqual(original);
    expect(await storedTitles(page)).toEqual(original);
    await expect(alpha).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test("Escape during an inline edit cancels the edit only: dialog stays open, row shows original values, focus on Edit; a second Escape closes", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Bravo"]);

    const edit = dialogOf(page).getByRole("button", { name: "Edit Bravo", exact: true });
    await edit.click();
    const editField = dialogOf(page).locator("li form input").first();
    await editField.fill("Changed");
    await page.keyboard.press("Escape");

    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");
    await expect(dialogOf(page).locator("li form")).toHaveCount(0);
    await expect(dialogOf(page).getByText("Bravo", { exact: true })).toBeVisible();
    await expect(dialogOf(page).getByText("Changed", { exact: true })).toHaveCount(0);
    expect(await storedTitles(page)).toEqual(["Bravo"]);
    await expect(dialogOf(page).getByRole("button", { name: "Edit Bravo", exact: true })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test("Escape on the delete confirmation cancels it only: task stays, dialog stays open, focus on Delete; a second Escape closes", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha", "Bravo", "Charlie"]);

    await dialogOf(page).getByRole("button", { name: "Delete Bravo", exact: true }).click();
    const confirmation = dialogOf(page).locator('li [role="group"]');
    await expect(confirmation).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(confirmation).toHaveCount(0);
    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");
    expect(await orderedTitles(page)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(await storedTitles(page)).toEqual(["Alpha", "Bravo", "Charlie"]);
    await expect(dialogOf(page).getByRole("button", { name: "Delete Bravo", exact: true })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });
});

test.describe("Task list dialog: drag and drop", () => {
  const FIVE = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

  test("pointer drag of row 1 to position 3 survives close, reopen, and reload", async ({ page }) => {
    // Tall enough that all five rows are visible; otherwise the lower row sits
    // below the list's own scroll area and the drop lands past the edge.
    await page.setViewportSize({ width: 1280, height: 1200 });
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, FIVE);

    const source = handleFor(page, "Alpha");
    const target = handleFor(page, "Charlie");
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();

    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 20 });
    await page.mouse.up();

    const moved = ["Bravo", "Charlie", "Alpha", "Delta", "Echo"];
    await expect.poll(() => orderedTitles(page)).toEqual(moved);
    await expect(liveRegion(page)).toContainText("Dropped Alpha. Position 3 of 5.");
    await settle(page);
    // dnd-kit swallows the next click for up to 50 ms after a pointer drop
    // (it removes its document-level click stopper on a 50 ms timeout), so a
    // Close click issued in that window never reaches the button.
    await page.waitForTimeout(100);

    await closeTaskList(page);
    await trigger(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await expect.poll(() => orderedTitles(page)).toEqual(moved);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await openTaskList(page);
    await expect.poll(() => orderedTitles(page)).toEqual(moved);
  });

  test("closing the dialog mid keyboard drag leaves the order either pre-drag or fully applied, never partial, and no console error", async ({ page }) => {
    const problems = collectConsoleProblems(page);
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, FIVE);
    const original = await orderedTitles(page);
    const fullyApplied = ["Bravo", "Charlie", "Alpha", "Delta", "Echo"];

    const alpha = handleFor(page, "Alpha");
    await alpha.focus();
    await alpha.press("Space");
    await expect(liveRegion(page)).toContainText("Picked up Alpha. Position 1 of 5.");
    // Same settle the existing keyboard specs use: dnd-kit starts listening for arrows just after pickup.
    await page.waitForTimeout(150);
    await alpha.press("ArrowDown");
    await expect(liveRegion(page)).toContainText("Alpha moved to position 2 of 5.");
    await alpha.press("ArrowDown");
    await expect(liveRegion(page)).toContainText("Alpha moved to position 3 of 5.");

    await closeButton(page).click();
    await expect(dialogOf(page)).toHaveCount(0);

    await openTaskList(page);
    const afterClose = await orderedTitles(page);
    expect([JSON.stringify(original), JSON.stringify(fullyApplied)]).toContain(JSON.stringify(afterClose));
    expect(new Set(afterClose).size).toBe(5);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await openTaskList(page);
    expect(await orderedTitles(page)).toEqual(afterClose);
    expect(problems).toEqual([]);
  });

  test("dnd-kit live region stays outside any aria-hidden subtree during a keyboard drag, and announces pickup, move and drop", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    // Locate handles by their exact aria-label, not by role: this test is about
    // whether the live region is hidden, so it must not depend on the list being
    // exposed to the accessibility tree.
    for (const title of FIVE) {
      const field = titleField(page);
      await field.fill(title);
      await field.press("Enter");
      await expect(dialogOf(page).locator(`button[aria-label="Reorder ${title}"]`)).toBeVisible();
    }

    const alpha = dialogOf(page).locator('button[aria-label="Reorder Alpha"]');
    await alpha.focus();
    await alpha.press("Space");
    await expect(liveRegion(page)).toContainText("Picked up Alpha. Position 1 of 5.");
    // Same settle the existing keyboard specs use: dnd-kit starts listening for arrows just after pickup.
    await page.waitForTimeout(150);

    const hiddenAncestor = () =>
      page.evaluate(() => {
        const region = document.querySelector('[id^="DndLiveRegion"]');
        if (!region) return "missing";
        return region.closest('[aria-hidden="true"]') ? "hidden" : "reachable";
      });
    expect(await hiddenAncestor()).toBe("reachable");

    await alpha.press("ArrowDown");
    await expect(liveRegion(page)).toContainText("Alpha moved to position 2 of 5.");
    await alpha.press("Space");
    await expect(liveRegion(page)).toContainText("Dropped Alpha. Position 2 of 5.");
    expect(await hiddenAncestor()).toBe("reachable");
    await expect(alpha).toBeFocused();
  });

  test("move up and move down work inside the dialog, and the first row's up and last row's down are disabled", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha", "Bravo", "Charlie"]);

    await expect(dialogOf(page).getByRole("button", { name: "Move Alpha up" })).toBeDisabled();
    await expect(dialogOf(page).getByRole("button", { name: "Move Charlie down" })).toBeDisabled();

    await dialogOf(page).getByRole("button", { name: "Move Bravo up" }).click();
    await expect.poll(() => orderedTitles(page)).toEqual(["Bravo", "Alpha", "Charlie"]);
    await dialogOf(page).getByRole("button", { name: "Move Alpha down" }).click();
    await expect.poll(() => orderedTitles(page)).toEqual(["Bravo", "Charlie", "Alpha"]);
  });

  test("row controls perform their action without starting a drag", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha", "Bravo"]);

    await dialogOf(page).getByRole("button", { name: /^\+1, add a completed pomodoro to Bravo/ }).click();
    await expect(dialogOf(page).locator("li").filter({ hasText: "Bravo" }).first()).toContainText("1 /");
    await expect(dialogOf(page).locator('[aria-pressed="true"]')).toHaveCount(0);
    expect(await orderedTitles(page)).toEqual(["Alpha", "Bravo"]);
  });
});

test.describe("Task list dialog: pin flow into the inline card", () => {
  test("pinning in the open dialog updates the inline card immediately, and unpinning restores its empty state", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha"]);

    const pin = dialogOf(page).getByRole("button", { name: "Pin Alpha as current task", exact: true });
    await pin.click();

    const card = page.getByRole("main");
    await expect(card.getByText("Alpha", { exact: true })).toBeVisible();
    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");

    await dialogOf(page).getByRole("button", { name: "Unpin Alpha", exact: true }).click();
    await expect(card.getByText("Alpha", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Pin a task from Your tasks whenever you're ready.")).toBeVisible();
  });
});

test.describe("Task list dialog: broken data layer", () => {
  test("blocked upgrade: '/' shows the blocked error without the dialog, and the timer still renders", async ({ context }) => {
    // An older-version connection that never closes blocks Dexie's upgrade, which
    // is the real "close your other Pomotato tabs" situation.
    const holder = await context.newPage();
    await holder.goto("/qa-blocked-upgrade-holder");
    await holder.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("pomotato");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("delete was blocked"));
      });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("pomotato", 1);
        request.onsuccess = () => {
          (window as unknown as Record<string, unknown>).__olderConnection = request.result;
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });

    const app = await context.newPage();
    await app.goto("/");

    const card = app.getByRole("alert").filter({ hasText: "Couldn't load the current task." });
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText("Close other Pomotato tabs, then reload.");
    await expect(app.getByText("Loading…", { exact: true })).toHaveCount(0);
    await expect(timerText(app)).toBeVisible();

    await trigger(app).click();
    const listError = dialogOf(app).getByRole("alert");
    await expect(listError).toContainText("Couldn't load your tasks.", { timeout: 15000 });
    await expect(listError).toContainText("Close other Pomotato tabs, then reload.");
  });
});

test.describe("Task list dialog: focus after row actions, visual tokens", () => {
  test("saving a valid edit returns focus to that row's Edit control and keeps the dialog open", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Bravo"]);

    await dialogOf(page).getByRole("button", { name: "Edit Bravo", exact: true }).click();
    const editField = dialogOf(page).locator("li form input").first();
    await editField.fill("Charlie");
    await page.keyboard.press("Enter");

    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");
    await expect(dialogOf(page).getByText("Charlie", { exact: true })).toBeVisible();
    await expect(dialogOf(page).getByRole("button", { name: "Edit Charlie", exact: true })).toBeFocused();
    expect(await storedTitles(page)).toEqual(["Charlie"]);
  });

  test("pin, unpin, +1 and -1 leave focus on the control that was activated", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha"]);

    const pin = dialogOf(page).getByRole("button", { name: "Pin Alpha as current task", exact: true });
    await pin.click();
    await expect(dialogOf(page).getByRole("button", { name: "Unpin Alpha", exact: true })).toBeFocused();

    await dialogOf(page).getByRole("button", { name: "Unpin Alpha", exact: true }).click();
    await expect(dialogOf(page).getByRole("button", { name: "Pin Alpha as current task", exact: true })).toBeFocused();

    const plus = dialogOf(page).getByRole("button", { name: "+1, add a completed pomodoro to Alpha", exact: true });
    await plus.click();
    await expect(plus).toBeFocused();

    const minus = dialogOf(page).getByRole("button", { name: "-1, remove a completed pomodoro from Alpha", exact: true });
    await minus.click();
    await expect(minus).toBeFocused();
  });

  test("the Close control shows a 2px focus outline at least 3:1 against the dialog surface", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha"]);
    await closeButton(page).focus();
    await settle(page);

    const close = closeButton(page);
    const outline = await close.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(outline.style).toBe("solid");
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

    const surface = await effectiveBackground(page, dialogOf(page));
    expect(contrastRatio(await resolveColour(page, outline.color), surface)).toBeGreaterThanOrEqual(3);
  });

  test("dialog heading uses the Comfortaa heading face; body text does not", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    const heading = dialogOf(page).getByRole("heading", { name: TRIGGER_NAME, exact: true });
    await expect(heading).toBeVisible();
    expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Comfortaa");

    const description = dialogOf(page).locator('[data-slot="dialog-description"]');
    expect(await description.evaluate((el) => getComputedStyle(el).fontFamily)).not.toContain("Comfortaa");
  });

  test("dialog reads as a distinct surface: overlay is translucent and the surface has a border", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");

    const overlayColour = await page
      .locator('[data-slot="dialog-overlay"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(overlayColour).not.toBe("rgba(0, 0, 0, 0)");
    expect(overlayColour).not.toBe("transparent");

    const borderWidth = await dialogOf(page).evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(borderWidth).toBeGreaterThanOrEqual(1);
  });

  test("the Focus stats link still clears 4.5:1 against the page after the token swap", async ({ page }) => {
    await openApp(page);
    const link = page.getByRole("link", { name: "Focus stats", exact: true });
    await expect(link).toBeVisible();
    const ratio = contrastRatio(
      await resolveColour(page, await computedColour(page, link)),
      await effectiveBackground(page, link),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

/** Reads the `sessions` table. Same helper as e2e/sessions.spec.ts, copied because importing that spec would pull in its tests. */
async function storedSessions(page: Page): Promise<{ taskId: string | null; mode: string }[]> {
  return page.evaluate(
    () =>
      new Promise<{ taskId: string | null; mode: string }[]>((resolve, reject) => {
        const request = indexedDB.open("pomotato");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("sessions")) {
            db.close();
            resolve([]);
            return;
          }
          const query = db.transaction(["sessions"], "readonly").objectStore("sessions").getAll();
          query.onerror = () => reject(query.error);
          query.onsuccess = () => {
            db.close();
            resolve(query.result as { taskId: string | null; mode: string }[]);
          };
        };
      }),
  );
}

test.describe("Task list dialog: counts while the dialog is open", () => {
  test("a focus run that completes while the dialog is open updates the open row and the card, and logs exactly one session", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha"]);
    await dialogOf(page).getByRole("button", { name: "Pin Alpha as current task", exact: true }).click();
    await closeTaskList(page);

    await page.getByRole("button", { name: "Start", exact: true }).click();
    // Open the dialog while the run is in progress, then let it finish behind it.
    await trigger(page).click();
    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");
    await page.clock.install();
    await page.clock.fastForward(26 * 60 * 1000);

    await expect(dialogOf(page).locator("li").filter({ hasText: "Alpha" }).first()).toContainText("1 /");
    await expect(page.getByRole("main").locator("span.font-mono").filter({ hasText: "/" })).toHaveText("1 / 1");
    await expect.poll(async () => (await storedSessions(page)).length).toBe(1);
    const [session] = await storedSessions(page);
    expect(session.mode).toBe("focus");
    expect(session.taskId).not.toBeNull();
  });

  test("incrementing the pinned task inside the open dialog updates the inline card while the dialog stays open", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha"]);
    await dialogOf(page).getByRole("button", { name: "Pin Alpha as current task", exact: true }).click();

    const card = page.getByRole("main").locator("span.font-mono").filter({ hasText: "/" });
    await expect(card).toHaveText("0 / 1");
    await dialogOf(page).getByRole("button", { name: "+1, add a completed pomodoro to Alpha", exact: true }).click();

    await expect(card).toHaveText("1 / 1");
    await expect(dialogOf(page)).toHaveAttribute("data-state", "open");
  });
});

test.describe("Task list dialog: focus indicator on every control", () => {
  test("every enabled control in the dialog shows a solid keyboard focus ring at least 3:1 against its surroundings", async ({ page }) => {
    await openApp(page);
    await trigger(page).click();
    await addTasks(page, ["Alpha"]);
    await settle(page);

    const dialog = dialogOf(page);
    // Buttons and text-like inputs, plus the colour radios. The radios are sr-only, so their
    // ring is drawn on the swatch span that follows them (peer-focus-visible).
    const targets = dialog.locator('button:visible, input:visible:not([type="radio"]), input[type="radio"]');
    const count = await targets.count();
    const failures: string[] = [];
    let checked = 0;

    for (let i = 0; i < count; i++) {
      const target = targets.nth(i);
      if (await target.isDisabled()) continue; // disabled controls cannot take focus
      const isRadio = (await target.getAttribute("type")) === "radio";
      const label = (
        (await target.getAttribute("aria-label")) ??
        (await target.getAttribute("value")) ??
        (await target.getAttribute("id")) ??
        (await target.textContent()) ??
        ""
      )
        .trim()
        .slice(0, 40);

      // Pressing a key first makes the next programmatic focus count as keyboard focus.
      await page.keyboard.press("Shift");
      await target.focus();
      await settle(page);
      const focusVisible = await target.evaluate((el) => el.matches(":focus-visible"));
      if (!focusVisible) {
        failures.push(`${label}: not :focus-visible`);
        continue;
      }
      checked++;

      const ringNode = isRadio ? target.locator("xpath=following-sibling::span[2]") : target;
      const style = await ringNode.evaluate((node) => {
        const computed = getComputedStyle(node);
        let surface = "rgb(255, 255, 255)";
        for (let p = node.parentElement; p; p = p.parentElement) {
          const colour = getComputedStyle(p).backgroundColor;
          if (colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") {
            surface = colour;
            break;
          }
        }
        return {
          outlineStyle: computed.outlineStyle,
          outlineWidth: computed.outlineWidth,
          outlineColor: computed.outlineColor,
          surface,
        };
      });
      if (style.outlineStyle !== "solid") {
        failures.push(`${label}: outline-style ${style.outlineStyle}`);
        continue;
      }
      const surface = await resolveColour(page, style.surface);
      const ring = await resolveColour(page, style.outlineColor, surface);
      const ratio = contrastRatio(ring, surface);
      if (ratio < 3) failures.push(`${label}: ${ratio.toFixed(2)}:1 (${style.outlineColor})`);
    }

    expect(checked, "controls actually measured").toBeGreaterThanOrEqual(10);
    expect(failures, "controls below 3:1 or without a visible ring").toEqual([]);
  });
});
