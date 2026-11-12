import { expect, type Locator, type Page } from "@playwright/test";

// Task 017: the Focus length field moved from `/` to `/settings` (ruling 1). These
// helpers let a spec that used to type into the field on `/` do the same thing on
// the settings route, then return to the timer. The ids are unchanged.

export type LengthField = "focus-length" | "short-break-length" | "long-break-length";

/** The duration field on /settings. Only meaningful on /settings: on / it no longer exists (task 017 criterion 2). */
export function lengthField(page: Page, id: LengthField = "focus-length"): Locator {
  return page.locator(`input#${id}`);
}

/**
 * Types a length into a duration field on /settings, then returns to the timer
 * route. The store persists on each valid keystroke, so the timer reads it on /.
 */
export async function setLengthThenReturn(page: Page, minutes: number | string, id: LengthField = "focus-length") {
  await page.goto("/settings");
  await lengthField(page, id).fill(String(minutes));
  await expect(lengthField(page, id)).toHaveValue(String(minutes));
  await page.goto("/");
}

/** Reads the Focus length the preferences store holds, as stored. */
export async function storedFocusMinutes(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("pomotato-preferences");
    return raw === null ? undefined : (JSON.parse(raw).state?.focusMinutes as number | undefined);
  });
}
