import { expect, type Locator, type Page } from "@playwright/test";
import { DEFAULT_FOCUS_MINUTES, DEFAULT_LONG_BREAK_MINUTES, DEFAULT_SHORT_BREAK_MINUTES } from "../../lib/timer/constants";

export const TIMER_STORAGE_KEY = "pomotato-timer";

export interface StoredTimerState {
  mode: string;
  /** Task 017: a preference, not a timer field. Seeding it writes pomotato-preferences. */
  focusMinutes?: number;
  cyclePosition: number;
  status: "idle" | "running" | "paused" | "complete";
  endTimestamp: number | null;
  pausedRemainingMs: number | null;
  runId: string | null;
  startedAt: number | null;
  plannedDurationMs?: number | null;
}

/** The Reset control on `/`. Matched exactly so the three label copies never count as extra matches. */
export function resetControl(page: Page): Locator {
  return page.getByRole("button", { name: "Reset", exact: true });
}

/** Reads the persisted timer state as the app stored it. */
export async function readTimerState(page: Page): Promise<StoredTimerState | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return (JSON.parse(raw) as { state: StoredTimerState }).state;
  }, TIMER_STORAGE_KEY);
}

/**
 * Writes a persisted timer state directly, so a test can start from paused or
 * complete without driving the UI or the clock. Reload afterwards to hydrate it.
 *
 * Task 017: the Focus length is no longer a timer field. `focusMinutes` is
 * written to `pomotato-preferences` (merged into whatever preferences entry is
 * already there), and the timer entry is version 4 with `plannedDurationMs`
 * set for a running or paused run, as the app would store it.
 */
export async function seedTimerState(page: Page, overrides: Partial<StoredTimerState>) {
  await page.evaluate(
    ([timerKey, prefKey, state, focusMinutes, shortBreak, longBreak]) => {
      const { focusMinutes: _ignored, ...timer } = state as Record<string, unknown>;
      const mode = timer.mode as string;
      // Break defaults come from the one constants module, so a moved default cannot desync this seed.
      const fullMinutes = mode === "focus" ? focusMinutes : mode === "shortBreak" ? shortBreak : longBreak;
      const live = timer.status === "running" || timer.status === "paused";
      window.localStorage.setItem(
        timerKey,
        JSON.stringify({ state: { ...timer, plannedDurationMs: live ? fullMinutes * 60_000 : null }, version: 4 }),
      );
      const existing = JSON.parse(window.localStorage.getItem(prefKey) ?? "null") as { state?: Record<string, unknown> } | null;
      window.localStorage.setItem(
        prefKey,
        JSON.stringify({ state: { ...(existing?.state ?? {}), focusMinutes }, version: 3 }),
      );
    },
    [
      TIMER_STORAGE_KEY,
      "pomotato-preferences",
      {
        mode: "focus",
        cyclePosition: 0,
        status: "idle",
        endTimestamp: null,
        pausedRemainingMs: null,
        runId: null,
        startedAt: null,
        ...overrides,
      },
      overrides.focusMinutes ?? DEFAULT_FOCUS_MINUTES,
      DEFAULT_SHORT_BREAK_MINUTES,
      DEFAULT_LONG_BREAK_MINUTES,
    ] as const,
  );
}

/** Presses the pointer on `target`, holds it for `ms`, then releases. */
export async function holdPointer(page: Page, target: Locator, ms: number) {
  const box = await target.boundingBox();
  expect(box, "hold target has a bounding box").not.toBeNull();
  if (box === null) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Presses a key on the focused element, holds it for `ms`, then releases it. */
export async function holdKey(page: Page, key: "Space" | "Enter", ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Resets through the hold, as a user would: hold for well over the 800 ms hold time. */
export async function holdResetWithPointer(page: Page, ms = 1200) {
  await holdPointer(page, resetControl(page), ms);
}
