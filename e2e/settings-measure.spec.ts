import { expect, test } from "@playwright/test";
import { DESKTOP, openPage, settle } from "./helpers/dark";
import { sampleSettingsOnce, type SettingsReading } from "./helpers/settings-sampler";

// Task 017 group I: the measurement sweep for /settings, taken once per theme
// (criteria 66, 67, 68, 69). Behaviour lives in e2e/session-lengths.spec.ts.
// Re-run this file alone when a token changes: `npx playwright test -c
// e2e/scratch-3100.config.ts e2e/settings-measure.spec.ts`.

// Task 019: dark is the only palette, so the sweep has one entry.
const THEMES = ["dark"] as const;

for (const theme of THEMES) {
  test(`[${theme}] group I: every new boundary and text ground on /settings, from one capture`, async ({ page }, testInfo) => {
    await openPage(page, { viewport: DESKTOP, path: "/settings" });
    await settle(page);
    // One field in error, so the error text is in the same capture. Every other figure is the clean state.
    await page.locator("input#short-break-length").fill("0");
    await expect(page.locator("#short-break-length-error")).toBeVisible();
    await settle(page);

    const readings: SettingsReading[] = await sampleSettingsOnce(page);
    const rows = readings.map((r) => ({
      theme,
      kind: r.kind,
      label: r.label,
      ink: r.kind === "text" ? `${r.ink}` : `${r.pixel}`,
      ground: `${r.ground}`,
      ratio: Number(r.ratio.toFixed(2)),
      coords: r.coords,
    }));
    testInfo.annotations.push({ type: "group-i", description: JSON.stringify(rows) });
    console.log(`GROUP-I ${theme}\n${rows.map((r) => `${r.kind}\t${r.label}\t${r.ink}\t${r.ground}\t${r.ratio}\t${r.coords}`).join("\n")}`);

    for (const r of readings) {
      if (r.kind === "boundary") {
        expect.soft(r.ratio, `boundary ${r.label} (${theme})`).toBeGreaterThanOrEqual(3);
      } else {
        expect.soft(r.ratio, `text ${r.label} (${theme})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
}

// Criterion 68: the toggle's on and off states are told apart by more than colour. The cue is the On/Off word beside
// the box, which is text and survives greyscale and forced colours; the box also changes fill (filled versus empty).
for (const forced of [false, true] as const) {
  test(`toggle on and off differ by a word, not only colour (forced colours: ${forced})`, async ({ page }) => {
    await openPage(page, { viewport: DESKTOP, path: "/settings" });
    if (forced) await page.emulateMedia({ forcedColors: "active" });
    const toggle = page.getByRole("checkbox", { name: "Play a chime when a session ends" });
    await expect(toggle).toBeChecked();
    await expect(page.getByText("On", { exact: true })).toBeVisible();
    await toggle.uncheck();
    await expect(page.getByText("Off", { exact: true })).toBeVisible();
    await expect(page.getByText("On", { exact: true })).toHaveCount(0);
  });
}
