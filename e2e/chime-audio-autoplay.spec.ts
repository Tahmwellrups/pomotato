import { expect, test, type Page } from "@playwright/test";
import { seedTimerState } from "./helpers/timer-hold";

// Task 017 audio path, success case: launched with the autoplay policy relaxed, so
// the chime's oscillators are really scheduled on the one AudioContext. The Web
// Audio constructors are wrapped to report what the chime does. Audibility is NOT
// asserted here; it is the manual step in the QA Report.

// Top level on purpose: Playwright cannot change launch options inside a describe.
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

const MIN = 60_000;

/** Wraps the Web Audio constructors so the page reports what the chime actually schedules. */
async function instrumentAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __audio: { contexts: number; oscillators: number; immediateStops: number; scheduledStops: number[]; starts: number };
    };
    w.__audio = { contexts: 0, oscillators: 0, immediateStops: 0, scheduledStops: [], starts: 0 };
    const Original = window.AudioContext;
    const Wrapped = function (this: unknown, ...args: unknown[]) {
      w.__audio.contexts += 1;
      return new (Original as unknown as new (...a: unknown[]) => AudioContext)(...args);
    } as unknown as typeof AudioContext;
    Wrapped.prototype = Original.prototype;
    Object.defineProperty(window, "AudioContext", { value: Wrapped, configurable: true, writable: true });
    const originalCreate = Original.prototype.createOscillator;
    Original.prototype.createOscillator = function (this: AudioContext) {
      w.__audio.oscillators += 1;
      return originalCreate.call(this);
    };
    const originalStop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.stop = function (this: OscillatorNode, when?: number) {
      if (when === undefined) w.__audio.immediateStops += 1;
      else w.__audio.scheduledStops.push(when);
      return originalStop.call(this, when);
    };
    const originalStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
      w.__audio.starts += 1;
      return originalStart.call(this, when);
    };
  });
}

async function audioCounters(page: Page) {
  return page.evaluate(() => (window as unknown as { __audio: { contexts: number; oscillators: number; immediateStops: number; starts: number } }).__audio);
}

const chimePlays = (page: Page) => page.locator("[data-chime-plays]").first().getAttribute("data-chime-plays");


test.describe("autoplay allowed: the success path schedules real nodes on one context", () => {

  test("Preview schedules the two notes on one shared AudioContext, and a session end plays with no further gesture", async ({ page }) => {
    await instrumentAudio(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Preview chime" }).click();
    await expect.poll(async () => (await audioCounters(page)).starts, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
    const afterPreview = await audioCounters(page);
    expect(afterPreview.contexts).toBe(1);
    expect(afterPreview.oscillators).toBeGreaterThanOrEqual(2);

    // A session end on / after the preview, with no gesture of its own.
    await page.goto("/");
    const end = Date.now() + 3_000;
    await seedTimerState(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-autoplay", pausedRemainingMs: null });
    await page.reload();
    await expect.poll(() => chimePlays(page), { timeout: 15_000 }).toBe("1");
    const afterSession = await audioCounters(page);
    // The counters live in the document: the reload opened a new one, so the session end's own scheduling is read here.
    expect(afterSession.oscillators).toBeGreaterThanOrEqual(2);
    expect(afterSession.contexts).toBe(1);
  });

  test("a chime that is under way is not cut short by navigating away from /, and no stop is issued before the scheduled end", async ({ page }) => {
    await instrumentAudio(page);
    await page.goto("/");
    const end = Date.now() + 3_000;
    await seedTimerState(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-nav-chime", pausedRemainingMs: null });
    await page.reload();
    await expect(page.getByRole("radio", { name: "Short break" })).toBeChecked({ timeout: 15_000 });
    // Navigate client-side while the session-end alarm is sounding (its length is derived in the unit tests, not restated here) (the session ends at the seeded time, so this lands a few hundred ms into it).
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.waitForTimeout(2_200);
    const counters = await audioCounters(page);
    expect(counters.oscillators).toBeGreaterThanOrEqual(2);
    expect(counters.immediateStops).toBe(0);
    expect(counters.contexts).toBe(1);
  });
});
