import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { openTaskList } from "./helpers/task-list-dialog";

test.describe("Accessibility - axe-core checks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("no axe violations in idle state", async ({ page }) => {
    // Run axe check using AxeBuilder (loads from local node_modules)
    const results = await new AxeBuilder({ page }).analyze();

    const seriousViolations = (results.violations || []).filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(seriousViolations).toHaveLength(0);
  });

  test("no axe violations in running state", async ({ page }) => {
    const startButton = page.getByRole("button", { name: "Start", exact: true });
    await startButton.click();

    // Wait for the button to change to Pause
    const pauseButton = page.getByRole("button", { name: "Pause", exact: true });
    await expect(pauseButton).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    const seriousViolations = (results.violations || []).filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(seriousViolations).toHaveLength(0);
  });

  test("no axe violations in paused state", async ({ page }) => {
    const startButton = page.getByRole("button", { name: "Start", exact: true });
    await startButton.click();

    await page.waitForTimeout(500);

    const pauseButton = page.getByRole("button", { name: "Pause", exact: true });
    await pauseButton.click();

    const results = await new AxeBuilder({ page }).analyze();

    const seriousViolations = (results.violations || []).filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(seriousViolations).toHaveLength(0);
  });

  // Task 017: the Focus length field moved to /settings (ruling 1), so the axe check with the field shown runs there.
  test("no axe violations on /settings with the Focus length field shown", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("input#focus-length")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    const seriousViolations = (results.violations || []).filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(seriousViolations).toHaveLength(0);
  });

  test("all interactive elements are keyboard accessible", async ({ page }) => {
    // Get all interactive elements
    const interactiveElements = page.locator("button, input[type='radio'], input[type='text']");
    const count = await interactiveElements.count();

    expect(count).toBeGreaterThan(0);

    // Each should be focusable via Tab
    for (let i = 0; i < count; i++) {
      const element = interactiveElements.nth(i);
      await element.focus();
      const isFocused = await page.evaluate(() => {
        return document.activeElement?.tagName.toLowerCase() || null;
      });
      expect(isFocused).not.toBeNull();
    }
  });

  test("focus indicator is visible", async ({ page }) => {
    const startButton = page.getByRole("button", { name: "Start", exact: true });
    await startButton.focus();

    // Check that focus-visible styles are applied
    const hasFocusIndicator = await startButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const outlineWidth = styles.outlineWidth;
      const outline = styles.outline;
      return outlineWidth !== "0px" && outline !== "none";
    });

    // The button should have a visible focus indicator
    expect(hasFocusIndicator).toBeTruthy();
  });

  test("aria labels and descriptions are present", async ({ page }) => {
    // Mode selector should have labels
    const modeRadios = page.locator('input[type="radio"][name="timer-mode"]');
    const modeCount = await modeRadios.count();
    expect(modeCount).toBe(3);

    // Each radio should have an associated label (label is ancestor wrapping the input)
    for (let i = 0; i < modeCount; i++) {
      const radio = modeRadios.nth(i);
      const label = radio.locator("xpath=ancestor::label");
      expect(await label.count()).toBeGreaterThan(0);
    }

    // Task 017: the duration field has a programmatic label on /settings.
    await page.goto("/settings");
    const customLabelText = page.locator("label[for='focus-length']");
    await expect(customLabelText).toHaveText(/Focus length/);

    const customInput = page.locator('input[id="focus-length"]');
    await expect(customInput).toHaveAttribute("id", "focus-length");
  });

  test("live region for announcements is present and properly marked", async ({ page }) => {
    // Scoped to the timer's own sr-only announcement region: an unscoped
    // '[role="status"]' locator is ambiguous once the task list's and
    // current-task card's own "Loading…" text (also role="status") are in
    // the DOM — a strict-mode violation that's timing-dependent on a cold load.
    const liveRegion = page.locator('p.sr-only[role="status"]');
    await expect(liveRegion).toBeVisible();
    await expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });

  test("live region is empty while timer is running", async ({ page }) => {
    // Scoped to the timer's own sr-only announcement region: an unscoped
    // '[role="status"]' locator is ambiguous once the task list's and
    // current-task card's own "Loading…" text (also role="status") are in
    // the DOM — a strict-mode violation that's timing-dependent on a cold load.
    const liveRegion = page.locator('p.sr-only[role="status"]');
    const startButton = page.getByRole("button", { name: "Start", exact: true });

    // Start the timer
    await startButton.click();

    // Wait for the button to change to Pause (indicating timer is running)
    const pauseButton = page.getByRole("button", { name: "Pause", exact: true });
    await expect(pauseButton).toBeVisible();

    // Live region should be empty while running
    const liveRegionText = await liveRegion.textContent();
    expect(liveRegionText).toBe("");
  });

  test("live region contains completion text after real in-session completion", async ({ page }) => {
    // Scoped to the timer's own sr-only announcement region: an unscoped
    // '[role="status"]' locator is ambiguous once the task list's and
    // current-task card's own "Loading…" text (also role="status") are in
    // the DOM — a strict-mode violation that's timing-dependent on a cold load.
    const liveRegion = page.locator('p.sr-only[role="status"]');
    const startButton = page.getByRole("button", { name: "Start", exact: true });

    // Start the timer
    await startButton.click();

    // Wait for the button to change to Pause
    const pauseButton = page.getByRole("button", { name: "Pause", exact: true });
    await expect(pauseButton).toBeVisible();

    // Install clock and advance past the full focus duration (25:00 = 1500 seconds)
    await page.clock.install();
    await page.clock.fastForward(25 * 60 * 1000 + 1000); // 25 minutes + 1 second to ensure completion

    // Wait a moment for the effect to run
    await page.waitForTimeout(500);

    // Live region should now contain "Focus complete"
    const liveRegionText = await liveRegion.textContent();
    expect(liveRegionText).toContain("Focus complete");
  });

  test("live region stays empty when reloading into already-complete state", async ({ page }) => {
    // Manually set up a persisted complete state in localStorage
    const persistedState = {
      state: {
        mode: "focus",
        focusMinutes: 25,
        status: "complete",
        endTimestamp: null,
        pausedRemainingMs: null,
        hasHydrated: true,
      },
      version: 1,
    };

    // Set the persisted state before navigating
    await page.evaluate((state) => {
      localStorage.setItem("pomotato-timer", JSON.stringify(state));
    }, persistedState);

    // Navigate to the page
    await page.goto("/");

    // Wait for hydration to complete
    await page.waitForTimeout(500);

    // Live region should be empty (no announcement on reload)
    // Scoped to the timer's own sr-only announcement region: an unscoped
    // '[role="status"]' locator is ambiguous once the task list's and
    // current-task card's own "Loading…" text (also role="status") are in
    // the DOM — a strict-mode violation that's timing-dependent on a cold load.
    const liveRegion = page.locator('p.sr-only[role="status"]');
    const liveRegionText = await liveRegion.textContent();
    expect(liveRegionText).toBe("");
  });

  test.describe("Task List - axe-core checks", () => {
    test("no axe violations: empty task list", async ({ page }) => {
      await page.goto("/");
      await openTaskList(page);
      // Empty list should show just the add form
      const results = await new AxeBuilder({ page }).analyze();

      const seriousViolations = (results.violations || []).filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(seriousViolations).toHaveLength(0);
    });

    test("no axe violations: 3 tasks, none pinned", async ({ page }) => {
      await openTaskList(page);
      const titleInput = page.locator('input[id*="-title"]').first();

      await titleInput.fill("TaskOne");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);
      await titleInput.fill("TaskTwo");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);
      await titleInput.fill("TaskThree");
      await titleInput.press("Enter");
      await page.waitForTimeout(200);

      const results = await new AxeBuilder({ page }).analyze();

      const seriousViolations = (results.violations || []).filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(seriousViolations).toHaveLength(0);
    });

    // Re-pointed (task 015, commit 4ca861e): this was "3 tasks, one pinned". The Pin button was deleted; the
    // current task is now the first open row, so the state under test is that row's aria-current.
    test("no axe violations: 3 tasks, the first open one is the current task", async ({ page }) => {
      await openTaskList(page);
      const titleInput = page.locator('input[id*="-title"]').first();

      await titleInput.fill("Alpha");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);
      await titleInput.fill("Bravo");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);
      await titleInput.fill("Charlie");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      // No pin step: the first open row is the current task (commit 4ca861e deleted the Pin button).
      const taskRow = page.locator("ul li").filter({ hasText: "Alpha" }).first();
      await expect(taskRow).toHaveAttribute("aria-current", "true");

      const results = await new AxeBuilder({ page }).analyze();

      const seriousViolations = (results.violations || []).filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(seriousViolations).toHaveLength(0);
    });

    test("no axe violations: edit in progress", async ({ page }) => {
      await openTaskList(page);
      const titleInput = page.locator('input[id*="-title"]').first();

      await titleInput.fill("EditableTask");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      // Click edit button to enter edit mode
      const taskRow = page.locator("ul li").filter({ hasText: "EditableTask" }).first();
      const editButton = taskRow.getByRole("button", { name: /^Edit/ });
      await editButton.click();
      await page.waitForTimeout(200);

      const results = await new AxeBuilder({ page }).analyze();

      const seriousViolations = (results.violations || []).filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(seriousViolations).toHaveLength(0);
    });

    // Re-pointed (task 015, commit 4ca861e): the emoji field was deleted, so the validation error is the
    // empty-title one from the panel's add form.
    test("no axe violations: validation errors showing", async ({ page }) => {
      await openTaskList(page);
      const titleInput = page.locator('input[id*="-title"]').first();
      const submitButton = page.getByRole("button", { name: "Add task", exact: true });

      // Submit an empty title to raise the field error.
      await submitButton.click();
      await expect(titleInput).toHaveAttribute("aria-invalid", "true");
      await page.waitForTimeout(200);

      const results = await new AxeBuilder({ page }).analyze();

      const seriousViolations = (results.violations || []).filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(seriousViolations).toHaveLength(0);
    });

    test("no axe violations: delete confirmation open", async ({ page }) => {
      await openTaskList(page);
      const titleInput = page.locator('input[id*="-title"]').first();

      await titleInput.fill("DeleteMe");
      await titleInput.press("Enter");
      await page.waitForTimeout(100);

      // Click delete button to open confirmation
      const taskRow = page.locator("ul li").filter({ hasText: "DeleteMe" }).first();
      const deleteButton = taskRow.getByRole("button", { name: /^Delete/ });
      await deleteButton.click();
      await page.waitForTimeout(200);

      const results = await new AxeBuilder({ page }).analyze();

      const seriousViolations = (results.violations || []).filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(seriousViolations).toHaveLength(0);
    });
  });
});
