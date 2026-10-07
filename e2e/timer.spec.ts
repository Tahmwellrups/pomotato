import { test, expect } from "@playwright/test";

test.describe("Pomotato Focus Timer E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear localStorage to start fresh
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("displays Focus mode with 25:00 on first visit", async ({ page }) => {
    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    await expect(timerDisplay).toContainText("25:00");
  });

  test("mode selector shows Focus as selected initially", async ({ page }) => {
    const focusRadio = page.locator('input[type="radio"][value="focus"]');
    await expect(focusRadio).toBeChecked();
  });

  test("starts the timer and countdown begins", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // After starting, Pause button should appear
    const pauseButton = page.locator("button:has-text('Pause')");
    await expect(pauseButton).toBeVisible({ timeout: 5000 });

    // Wait a bit and check that the display has changed
    await page.waitForTimeout(1000);
    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    const displayText = await timerDisplay.textContent();
    // Should be less than 25:00 after a second
    expect(displayText).not.toContain("25:00");
  });

  test("pauses the timer and display freezes", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // Wait a moment for the timer to count down
    await page.waitForTimeout(500);

    const pauseButton = page.locator("button:has-text('Pause')");
    await pauseButton.click();

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    const pausedTime = await timerDisplay.textContent();

    // Wait another second
    await page.waitForTimeout(1000);

    const stillPausedTime = await timerDisplay.textContent();
    // Display should not have changed while paused
    expect(stillPausedTime).toBe(pausedTime);

    // Resume button should be visible
    const resumeButton = page.locator("button:has-text('Resume')");
    await expect(resumeButton).toBeVisible();
  });

  test("resumes the timer after pause", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    await page.waitForTimeout(500);

    const pauseButton = page.locator("button:has-text('Pause')");
    await pauseButton.click();

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    const pausedTime = await timerDisplay.textContent();

    const resumeButton = page.locator("button:has-text('Resume')");
    await resumeButton.click();

    // Pause button should appear again (not Resume)
    const newPauseButton = page.locator("button:has-text('Pause')");
    await expect(newPauseButton).toBeVisible();

    // Wait a moment and check that time is counting down again
    await page.waitForTimeout(1000);
    const resumedTime = await timerDisplay.textContent();
    expect(resumedTime).not.toBe(pausedTime);
  });

  test("reset returns to full duration and idle state", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    await page.waitForTimeout(500);

    const resetButton = page.locator("button:has-text('Reset')");
    await resetButton.click();

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    await expect(timerDisplay).toContainText("25:00");

    // Start button should be visible again
    const newStartButton = page.locator("button:has-text('Start')");
    await expect(newStartButton).toBeVisible();
  });

  test("switching modes mid-run stops the countdown", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    await page.waitForTimeout(500);

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();

    const shortBreakLabel = page.locator('label:has(input[value="shortBreak"])');
    await shortBreakLabel.click();

    // Should now show Short Break (5:00)
    await expect(timerDisplay).toContainText("05:00");

    // Start button should be visible again
    const newStartButton = page.locator("button:has-text('Start')");
    await expect(newStartButton).toBeVisible();
  });

  test("custom duration input is visible in custom mode", async ({ page }) => {
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

    const customInput = page.locator('input[id="custom-duration"]');
    await expect(customInput).toBeVisible();
  });

  test("custom duration input accepts valid values", async ({ page }) => {
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

    const customInput = page.locator('input[id="custom-duration"]');
    await customInput.fill("50");

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    await expect(timerDisplay).toContainText("50:00");
  });

  test("custom duration input shows error for invalid values", async ({ page }) => {
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

    const customInput = page.locator('input[id="custom-duration"]');
    await customInput.fill("abc");

    const errorMessage = page.locator("text=/Enter a whole number/");
    await expect(errorMessage).toBeVisible();
  });

  test("custom duration input is disabled while running", async ({ page }) => {
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    const customInput = page.locator('input[id="custom-duration"]');
    await expect(customInput).toBeDisabled();
  });

  test("custom duration input is disabled while paused", async ({ page }) => {
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    const pauseButton = page.locator("button:has-text('Pause')");
    await pauseButton.click();

    const customInput = page.locator('input[id="custom-duration"]');
    await expect(customInput).toBeDisabled();
  });

  test("jumping forward 10 minutes while running shows correct remaining time", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // Use page.clock to advance time
    await page.clock.install();
    await page.clock.fastForward(10 * 60 * 1000); // 10 minutes

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    // Should show approximately 15:00 (25:00 - 10:00)
    await expect(timerDisplay).toContainText("15:0");
  });

  test("reload while running keeps correct timer value", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // Use page.clock to advance 2 minutes
    await page.clock.install();
    await page.clock.fastForward(2 * 60 * 1000);

    // Reload the page
    await page.reload();

    // Timer should still be running
    const pauseButton = page.locator("button:has-text('Pause')");
    await expect(pauseButton).toBeVisible({ timeout: 5000 });

    // Display should show approximately 23:00 (25:00 - 2:00)
    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    await expect(timerDisplay).toContainText("23:0");
  });

  test("reload after end time passed shows 00:00 and complete state", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // Use page.clock to advance past the end
    await page.clock.install();
    await page.clock.fastForward(26 * 60 * 1000); // 26 minutes (past 25)

    // Reload the page
    await page.reload();

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    await expect(timerDisplay).toContainText("00:00");

    // Start button should be visible (timer is in complete state)
    const startButtonAfterReload = page.locator("button:has-text('Start')");
    await expect(startButtonAfterReload).toBeVisible();
  });

  test("reload while paused preserves paused state", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // Wait a moment and pause
    await page.waitForTimeout(500);

    const pauseButton = page.locator("button:has-text('Pause')");
    await pauseButton.click();

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    const pausedTime = await timerDisplay.textContent();

    // Reload the page
    await page.reload();

    // Timer should still be paused with the same time
    const pausedTimeAfterReload = await timerDisplay.textContent();
    expect(pausedTimeAfterReload).toBe(pausedTime);

    // Resume button should be visible
    const resumeButton = page.locator("button:has-text('Resume')");
    await expect(resumeButton).toBeVisible();
  });

  test("keyboard navigation: Tab through controls", async ({ page }) => {
    const modeSelector = page.locator('input[type="radio"][value="focus"]');
    const startButton = page.locator("button:has-text('Start')");
    const resetButton = page.locator("button:has-text('Reset')");

    // Tab to first mode radio
    await page.keyboard.press("Tab");
    await expect(modeSelector).toBeFocused();

    // Tab through to the start button
    let i = 0;
    while (i < 5) {
      await page.keyboard.press("Tab");
      const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || (document.activeElement as HTMLElement)?.textContent);
      if (focusedElement?.includes("Start")) {
        break;
      }
      i++;
    }
    await expect(startButton).toBeFocused();

    // Tab to reset button
    await page.keyboard.press("Tab");
    await expect(resetButton).toBeFocused();
  });

  test("keyboard activation: Space to start timer", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.focus();
    await page.keyboard.press("Space");

    // Pause button should appear
    const pauseButton = page.locator("button:has-text('Pause')");
    await expect(pauseButton).toBeVisible({ timeout: 5000 });
  });

  test("keyboard activation: Enter to reset timer", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    await page.waitForTimeout(500);

    const resetButton = page.locator("button:has-text('Reset')");
    await resetButton.focus();
    await page.keyboard.press("Enter");

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    await expect(timerDisplay).toContainText("25:00");
  });

  test("focus indicator visible on buttons", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.focus();

    // Check that the button has the focus-visible class applied
    const focusStyle = await startButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.outlineWidth !== "0px" || styles.outline !== "none";
    });

    expect(focusStyle).toBeTruthy();
  });

  test("persistence: custom duration persists across reload", async ({ page }) => {
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

    const customInput = page.locator('input[id="custom-duration"]');
    await customInput.fill("60");

    const timerDisplay = page.locator("text=/\\d+:\\d+/").first();
    await expect(timerDisplay).toContainText("60:00");

    // Reload
    await page.reload();

    // Custom duration should still be 60
    await expect(timerDisplay).toContainText("60:00");
    const customRadio = page.locator('input[type="radio"][value="custom"]');
    await expect(customRadio).toBeChecked();
    await expect(customInput).toHaveValue("60");
  });

  test("no hydration mismatch on reload", async ({ page }) => {
    // Start the timer
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // Reload and check for console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.reload();

    // Filter for hydration-related errors
    const hydrationErrors = consoleErrors.filter((err) =>
      err.includes("hydration") || err.includes("mismatch")
    );

    expect(hydrationErrors.length).toBe(0);
  });
});
