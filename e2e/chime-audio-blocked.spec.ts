import { expect, test } from "@playwright/test";
import { seedTimerState } from "./helpers/timer-hold";

// Task 017 audio path, default launch (no autoplay flag): the blocked path. The
// context is refused, exactly one warning is logged, the session still advances.
// Audibility is the manual step in the QA Report, not something a browser asserts.

const MIN = 60_000;
const chimePlays = (page: import("@playwright/test").Page) => page.locator("[data-chime-plays]").first().getAttribute("data-chime-plays");

test.describe("criterion 53, in a real browser: the blocked path fails silently", () => {
  test("an expiring session on / advances and logs, plays no audible sound, and warns exactly once", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning" && msg.text().includes("session chime")) warnings.push(msg.text());
    });
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    const end = Date.now() + 3_000;
    await seedTimerState(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-blocked", pausedRemainingMs: null });
    await page.reload();
    await expect(page.getByRole("radio", { name: "Short break" })).toBeChecked({ timeout: 15_000 });
    await expect.poll(() => chimePlays(page), { timeout: 10_000 }).toBe("1");
    expect(warnings, warnings.join("\n")).toHaveLength(1);
    expect(errors).toEqual([]);
    // Nothing about audio is rendered in the UI.
    await expect(page.getByText(/chime|audio|sound could not/i)).toHaveCount(0);
  });
});
