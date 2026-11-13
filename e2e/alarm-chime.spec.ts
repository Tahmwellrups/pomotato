import { expect, test, type Page } from "@playwright/test";

// Task 021 e2e: criterion 14 (Preview plays the whole alarm, with the toggle off) and
// criterion 19 (the settings copy states the duration the chime derives from its schedule). Criterion
// 15 was verified in a real browser by the orchestrator and is not re-run here.
// Scheduled times are read from the Web Audio constructors, so the measure is the
// schedule the chime hands the AudioContext, not a stopwatch.

// Top level on purpose: Playwright cannot change launch options inside a describe.
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

interface AlarmRecord {
  startWhens: number[];
  stopWhens: number[];
}

async function recordSchedule(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __alarm: AlarmRecord };
    w.__alarm = { startWhens: [], stopWhens: [] };
    const originalStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
      w.__alarm.startWhens.push(when ?? 0);
      return originalStart.call(this, when);
    };
    const originalStop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.stop = function (this: OscillatorNode, when?: number) {
      if (when !== undefined) w.__alarm.stopWhens.push(when);
      return originalStop.call(this, when);
    };
  });
}

async function readSchedule(page: Page): Promise<AlarmRecord> {
  return page.evaluate(() => (window as unknown as { __alarm: AlarmRecord }).__alarm);
}

test.describe("task 021: the session-end alarm", () => {
  test("criterion 14: with the toggle off, Preview schedules the whole alarm as strikes", async ({ page }) => {
    await recordSchedule(page);
    await page.goto("/settings");
    await page.getByRole("checkbox", { name: "Play a chime when a session ends" }).uncheck();
    await page.getByRole("button", { name: "Preview chime" }).click();
    await expect.poll(async () => (await readSchedule(page)).startWhens.length, { timeout: 5_000 }).toBeGreaterThan(0);
    await expect(page.locator("[data-chime-plays]").first()).toHaveAttribute("data-chime-plays", "1");

    const { startWhens, stopWhens } = await readSchedule(page);
    // Each bell has two partials that start at different times (the upper one 0.16 s behind), so the
    // sorted starts alternate lower, upper, lower, upper. The lower partial of each bell is the strike.
    const sorted = [...startWhens].sort((a, b) => a - b);
    const strikeStarts = sorted.filter((_, i) => i % 2 === 0);
    const upperStarts = sorted.filter((_, i) => i % 2 === 1);
    // Criterion 2 (owner-tuned, third ruling 2026-11-13): exactly five bells.
    expect(strikeStarts).toHaveLength(5);
    expect(upperStarts).toHaveLength(strikeStarts.length);
    strikeStarts.forEach((start, i) => expect(upperStarts[i]).toBeGreaterThan(start));
    // Criterion 3: evenly spaced, and the spacing is the same for every gap.
    const gaps = strikeStarts.slice(1).map((start, i) => start - strikeStarts[i]);
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);

    // Criterion 6 (third ruling): the alarm spans 8.0 s to 8.6 s from the first strike, read from the schedule.
    const span = Math.max(...stopWhens) - Math.min(...startWhens);
    expect(span).toBeGreaterThanOrEqual(8.0);
    expect(span).toBeLessThanOrEqual(8.6);
  });
});

test.describe("task 021: settings copy", () => {
  test("criterion 19: the rendered duration tracks the scheduled alarm span, and no copy calls it brief or single", async ({ page }) => {
    await recordSchedule(page);
    await page.goto("/settings");
    const helper = page.locator("#chime-state");
    const toggle = page.getByRole("checkbox", { name: "Play a chime when a session ends" });
    await toggle.uncheck();
    await page.getByRole("button", { name: "Preview chime" }).click();
    await expect.poll(async () => (await readSchedule(page)).startWhens.length, { timeout: 5_000 }).toBeGreaterThan(0);
    // The figure the copy shows must be the scheduled span, rounded the way the copy rounds it. A hand-written
    // word would pass at one count and drift at the next; this follows the schedule the chime actually hands over.
    const { startWhens, stopWhens } = await readSchedule(page);
    const span = Math.max(...stopWhens) - Math.min(...startWhens);
    const expected = `about ${Math.round(span)} seconds`;
    await expect(helper).toContainText(expected);
    await toggle.check();
    await expect(helper).toContainText(expected);
    const copy = await page.locator("fieldset", { has: page.locator("#chime-state") }).innerText();
    expect(copy).not.toMatch(/single chime|brief|1\.7 s|1\.66|\b2 seconds\b/i);
  });
});
