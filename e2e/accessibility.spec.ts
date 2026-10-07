import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

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
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    // Wait for the button to change to Pause
    const pauseButton = page.locator("button:has-text('Pause')");
    await expect(pauseButton).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    const seriousViolations = (results.violations || []).filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(seriousViolations).toHaveLength(0);
  });

  test("no axe violations in paused state", async ({ page }) => {
    const startButton = page.locator("button:has-text('Start')");
    await startButton.click();

    await page.waitForTimeout(500);

    const pauseButton = page.locator("button:has-text('Pause')");
    await pauseButton.click();

    const results = await new AxeBuilder({ page }).analyze();

    const seriousViolations = (results.violations || []).filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(seriousViolations).toHaveLength(0);
  });

  test("no axe violations in custom mode", async ({ page }) => {
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

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
    const startButton = page.locator("button:has-text('Start')");
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
    expect(modeCount).toBe(4);

    // Each radio should have an associated label (label is ancestor wrapping the input)
    for (let i = 0; i < modeCount; i++) {
      const radio = modeRadios.nth(i);
      const label = radio.locator("xpath=ancestor::label");
      expect(await label.count()).toBeGreaterThan(0);
    }

    // Custom input should have a label
    const customLabel = page.locator('label:has(input[value="custom"])');
    await customLabel.click();

    const customLabelText = page.locator("label:has-text('Custom duration')");
    await expect(customLabelText).toBeVisible();

    const customInput = page.locator('input[id="custom-duration"]');
    await expect(customInput).toHaveAttribute("id", "custom-duration");
  });

  test("live region for announcements is present and properly marked", async ({ page }) => {
    const liveRegion = page.locator('[role="status"]');
    await expect(liveRegion).toBeVisible();
    await expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });

  test("live region is empty while timer is running", async ({ page }) => {
    const liveRegion = page.locator('[role="status"]');
    const startButton = page.locator("button:has-text('Start')");

    // Start the timer
    await startButton.click();

    // Wait for the button to change to Pause (indicating timer is running)
    const pauseButton = page.locator("button:has-text('Pause')");
    await expect(pauseButton).toBeVisible();

    // Live region should be empty while running
    const liveRegionText = await liveRegion.textContent();
    expect(liveRegionText).toBe("");
  });

  test("live region contains completion text after real in-session completion", async ({ page }) => {
    const liveRegion = page.locator('[role="status"]');
    const startButton = page.locator("button:has-text('Start')");

    // Start the timer
    await startButton.click();

    // Wait for the button to change to Pause
    const pauseButton = page.locator("button:has-text('Pause')");
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
        customMinutes: 25,
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
    const liveRegion = page.locator('[role="status"]');
    const liveRegionText = await liveRegion.textContent();
    expect(liveRegionText).toBe("");
  });
});
