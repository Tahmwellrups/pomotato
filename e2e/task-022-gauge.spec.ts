import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { liquidTopPercent } from "./helpers/gauge-sampler";

// Task 022 behaviour specs: criteria 5, 8-14, 23-25, 27-40. Measurement (41-46)
// lives in task-022-measure.spec.ts, so a token change re-runs that file alone.

const PREFS_KEY = "pomotato-preferences";
const TIMER_KEY = "pomotato-timer";
const FOCUS_MS = 25 * 60_000;

const switchInput = (page: Page) => page.getByRole("switch", { name: "Show timer gauge" });
const switchLabel = (page: Page) => page.locator("label").filter({ has: switchInput(page) });
const option = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });
const optionLabel = (page: Page, name: string) => page.locator("label").filter({ has: option(page, name) });
const gauge = (page: Page) => page.locator('[data-testid="timer-gauge"]');
const preview = (page: Page, style: string) => page.locator(`[data-testid="gauge-preview-${style}"][data-gauge-style="${style}"]`);
const digitsEl = (page: Page) => page.locator("p").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
const startBtn = (page: Page) => page.getByRole("button", { name: "Start", exact: true });
const pauseBtn = (page: Page) => page.getByRole("button", { name: "Pause", exact: true });
const resumeBtn = (page: Page) => page.getByRole("button", { name: "Resume", exact: true });
const settingsLink = (page: Page) => page.getByRole("link", { name: "Settings", exact: true });
const backLink = (page: Page) => page.getByRole("link", { name: "Back to the timer" });

async function seedPrefs(page: Page, state: Record<string, unknown>) {
  await page.goto("/");
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [PREFS_KEY, JSON.stringify({ state, version: 4 })] as const);
  await page.reload();
  await expect(startBtn(page)).toBeVisible();
}

async function storedState(page: Page): Promise<Record<string, unknown>> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), PREFS_KEY);
  return (JSON.parse(raw ?? "null") as { state: Record<string, unknown> }).state;
}

async function readoutSeconds(page: Page): Promise<number> {
  const text = ((await digitsEl(page).textContent()) ?? "").trim();
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  expect(m, `digits show mm:ss, got "${text}"`).not.toBeNull();
  return Number(m?.[1]) * 60 + Number(m?.[2]);
}

/** Rendered rects of the three containers criterion 9 names, as plain numbers. */
async function layoutBoxes(page: Page) {
  const modes = page.locator("div").filter({ has: page.getByText("Short break", { exact: true }) }).filter({ has: page.getByText("Focus", { exact: true }) }).last();
  const controls = page.getByRole("button", { name: /^(Start|Pause|Resume)$/ }).first().locator("xpath=..");
  const boxes = await Promise.all([digitsEl(page).boundingBox(), modes.boundingBox(), controls.boundingBox()]);
  return boxes.map((b) => (b ? [b.x, b.y, b.width, b.height] : null));
}

test.describe("criterion 8, 11: the off state paints nothing", () => {
  test("criterion 8: with the gauge off, no gauge layer or glyph overlay renders on /, whatever the style", async ({ page }) => {
    for (const style of ["vessel", "glyph"]) {
      await seedPrefs(page, { gaugeEnabled: false, gaugeStyle: style });
      await expect(digitsEl(page)).toBeVisible();
      await expect(gauge(page)).toHaveCount(0);
      await expect(page.locator("span[data-time]")).toHaveCount(0);
    }
  });

  test("criterion 11: with the gauge off in storage, no gauge element appears from navigation through hydration", async ({ page }) => {
    await page.addInitScript((k) => {
      (window as unknown as { __gaugeSeen: boolean }).__gaugeSeen = false;
      localStorage.setItem(k, JSON.stringify({ state: { gaugeEnabled: false, gaugeStyle: "glyph" }, version: 4 }));
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="timer-gauge"]')) (window as unknown as { __gaugeSeen: boolean }).__gaugeSeen = true;
      }).observe(document, { childList: true, subtree: true, attributes: true });
    }, PREFS_KEY);
    await page.goto("/");
    await expect(startBtn(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __gaugeSeen: boolean }).__gaugeSeen)).toBe(false);
    await expect(gauge(page)).toHaveCount(0);
  });

  test("criterion 11 control: with the gauge on, the gauge does appear once hydrated", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
  });
});

test.describe("criterion 9, 10: off leaves zero layout shift and no gauge wrapper", () => {
  test("criterion 9, 10: the digits, mode tabs and controls rects are identical on and off, and toggled live", async ({ page }) => {
    await page.clock.install();
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await startBtn(page).click();
    await page.clock.fastForward(2 * 60_000);
    await pauseBtn(page).click();
    await expect(resumeBtn(page)).toBeVisible();
    const onBoxes = await layoutBoxes(page);
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");

    // Live toggle: off on /settings, then back to / by client navigation, no reload.
    await settingsLink(page).click();
    await switchLabel(page).click();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "false");
    await backLink(page).click();
    await expect(resumeBtn(page)).toBeVisible();
    await expect(gauge(page)).toHaveCount(0);
    expect(await layoutBoxes(page)).toEqual(onBoxes);
    // criterion 10: the digits' parent holds only the digits; no gauge wrapper or spacer.
    const kids = await digitsEl(page).evaluate((el) => [el.parentElement?.children.length ?? -1, el.parentElement?.firstElementChild?.tagName ?? ""]);
    expect(kids).toEqual([1, "P"]);

    // Reload while off: still identical.
    await page.reload();
    await expect(resumeBtn(page)).toBeVisible();
    expect(await layoutBoxes(page)).toEqual(onBoxes);
  });
});

test.describe("criterion 12, 13, 14: switch and style apply live and persist", () => {
  test("criterion 12, 13: the switch and style apply to / at once and survive a reload of both routes", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    await optionLabel(page, "In the digits").click();
    await switchLabel(page).click();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "false");
    await backLink(page).click();
    await expect(startBtn(page)).toBeVisible();
    await expect(gauge(page)).toHaveCount(0);

    await settingsLink(page).click();
    await switchLabel(page).click();
    await optionLabel(page, "Vessel").click();
    await backLink(page).click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "vessel");

    await page.reload();
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "vessel");
    await page.goto("/settings");
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "true");
    await expect(option(page, "Vessel")).toBeChecked();
    expect(await storedState(page)).toMatchObject({ gaugeEnabled: true, gaugeStyle: "vessel" });
  });

  test("criterion 14: off, choose nothing, on restores the chosen style, including across a reload taken while off", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "glyph" });
    await settingsLink(page).click();
    await switchLabel(page).click();
    await page.reload();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "false");
    await switchLabel(page).click();
    await expect(option(page, "In the digits")).toBeChecked();
    await expect(option(page, "Vessel")).not.toBeChecked();
    expect(await storedState(page)).toMatchObject({ gaugeEnabled: true, gaugeStyle: "glyph" });
  });

  test("each style selected on /settings paints on / (glyph shows the overlay, vessel the liquid)", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    await optionLabel(page, "In the digits").click();
    await backLink(page).click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "glyph");
    await expect(page.locator("span[data-time]")).toHaveCount(1);
    await settingsLink(page).click();
    await optionLabel(page, "Vessel").click();
    await backLink(page).click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "vessel");
    await expect(page.locator("span[data-time]")).toHaveCount(0);
  });
});

test.describe("criterion 23, 24, 25: a settings change while running or paused leaves the timer alone", () => {
  test("criterion 23, 25 running: the stored end timestamp is byte-identical after a mid-run change, and the chime rings once at zero", async ({ page }) => {
    await page.clock.install();
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await startBtn(page).click();
    await page.clock.fastForward(60_000);
    const before = await page.evaluate((k) => window.localStorage.getItem(k), TIMER_KEY);
    const secondsBefore = await readoutSeconds(page);
    await settingsLink(page).click();
    await switchLabel(page).click();
    await switchLabel(page).click();
    await optionLabel(page, "In the digits").click();
    await backLink(page).click();
    await expect(pauseBtn(page)).toBeVisible();
    expect(await page.evaluate((k) => window.localStorage.getItem(k), TIMER_KEY)).toBe(before);
    expect(Math.abs((await readoutSeconds(page)) - secondsBefore)).toBeLessThanOrEqual(1);
    await expect(page.locator("[data-chime-plays]")).toHaveAttribute("data-chime-plays", "0");
    await page.clock.fastForward(FOCUS_MS);
    await expect(page.locator("[data-chime-plays]")).toHaveAttribute("data-chime-plays", "1");
  });

  test("criterion 25 control: the same run with no settings change rings once at zero", async ({ page }) => {
    await page.clock.install();
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await startBtn(page).click();
    await page.clock.fastForward(60_000);
    await expect(page.locator("[data-chime-plays]")).toHaveAttribute("data-chime-plays", "0");
    await page.clock.fastForward(FOCUS_MS);
    await expect(page.locator("[data-chime-plays]")).toHaveAttribute("data-chime-plays", "1");
  });

  test("criterion 24: a settings change while paused leaves the timer paused, at the same remaining time", async ({ page }) => {
    await page.clock.install();
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await startBtn(page).click();
    await page.clock.fastForward(30_000);
    await pauseBtn(page).click();
    await expect(resumeBtn(page)).toBeVisible();
    const seconds = await readoutSeconds(page);
    await settingsLink(page).click();
    await switchLabel(page).click();
    await switchLabel(page).click();
    await optionLabel(page, "In the digits").click();
    await backLink(page).click();
    await page.clock.fastForward(5_000);
    await expect(resumeBtn(page)).toBeVisible();
    expect(await readoutSeconds(page)).toBe(seconds);
  });
});

test.describe("criterion 27-35: switch and radio group semantics, keyboard, disabled explanation", () => {
  test("criterion 27, 29, 31, 35: switch role and state, radio group with labelled names, aria-hidden previews, no progressbar or live region", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("group", { name: "Gauge style" })).toHaveCount(1);
    await expect(page.getByRole("radio", { name: "Vessel", exact: true })).toHaveCount(1);
    await expect(page.getByRole("radio", { name: "In the digits", exact: true })).toHaveCount(1);
    await expect(page.locator('[data-testid^="gauge-preview-"]').locator("xpath=ancestor::span[@aria-hidden='true'][1]")).toHaveCount(2);
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    await expect(page.locator("section").filter({ has: switchInput(page) }).locator('[role="progressbar"], [aria-live]')).toHaveCount(0);
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await expect(gauge(page).locator('[role="progressbar"], [aria-live]')).toHaveCount(0);
  });

  test("criterion 30, 34: keyboard reaches the switch, Space toggles it, the group is a tab stop, and arrows move the selection when on", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    await page.getByRole("heading", { name: "Settings" }).click();
    for (let i = 0; i < 40 && !(await switchInput(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(switchInput(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Tab");
    await expect(option(page, "Vessel")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(option(page, "Vessel")).toBeChecked();
    await expect(page.getByText("Turn on the gauge to choose a style.")).toBeVisible();
    await expect(page.getByRole("group", { name: "Gauge style" })).toHaveAttribute("aria-describedby", "gauge-style-hint");
    await page.keyboard.press("Shift+Tab");
    await expect(switchInput(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Tab");
    await expect(option(page, "Vessel")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(option(page, "In the digits")).toBeChecked();
    await expect(option(page, "In the digits")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(option(page, "Vessel")).toBeChecked();
  });

  test("criterion 30: a visible focus ring appears on the switch and on a radio when focused", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    const label = switchLabel(page);
    await page.getByRole("heading", { name: "Settings" }).click();
    const unfocused = await label.screenshot();
    for (let i = 0; i < 40 && !(await switchInput(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(switchInput(page)).toBeFocused();
    expect((await label.screenshot()).equals(unfocused)).toBe(false);
    const radioLabel = optionLabel(page, "Vessel");
    const radioBefore = await radioLabel.screenshot();
    await page.keyboard.press("Tab");
    await expect(option(page, "Vessel")).toBeFocused();
    expect((await radioLabel.screenshot()).equals(radioBefore)).toBe(false);
  });

  test("criterion 33, 34: with the gauge off the selector is present, aria-disabled, and its explanation is reachable by keyboard", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: false, gaugeStyle: "glyph" });
    await settingsLink(page).click();
    await expect(option(page, "In the digits")).toHaveAttribute("aria-disabled", "true");
    await expect(option(page, "Vessel")).toHaveAttribute("aria-disabled", "true");
    await expect(option(page, "Vessel")).not.toHaveAttribute("disabled", "");
    await expect(option(page, "In the digits")).toBeChecked();
    await expect(page.getByText("Turn on the gauge to choose a style.")).toBeVisible();
    await page.getByRole("heading", { name: "Settings" }).click();
    for (let i = 0; i < 40 && !(await option(page, "In the digits").evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(option(page, "In the digits")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(option(page, "In the digits")).toBeChecked();
    await expect(option(page, "Vessel")).not.toBeChecked();
  });
});

test.describe("criterion 36, 37: axe and activation targets on /settings", () => {
  for (const enabled of [true, false]) {
    test(`criterion 36: axe reports zero violations on /settings with the gauge ${enabled ? "on" : "off"}`, async ({ page }) => {
      await seedPrefs(page, { gaugeEnabled: enabled, gaugeStyle: "vessel" });
      await page.goto("/settings");
      await expect(switchInput(page)).toBeAttached();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }

  test("criterion 37: the switch label and each preview card have a 44x44 CSS px activation target", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    const targets: Locator[] = [switchLabel(page), optionLabel(page, "Vessel"), optionLabel(page, "In the digits")];
    for (const t of targets) {
      const box = await t.boundingBox();
      expect(box, "target has a rendered rect").not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("criterion 5, 38, 39, 40: previews are still, and the live gauge animates only when motion is allowed", () => {
  test("criterion 5: a preview's painted level is identical across two samples at least 1 s apart", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    const card = preview(page, "vessel");
    const level1 = await card.getAttribute("data-gauge-level");
    await page.waitForTimeout(1_200);
    expect(await card.getAttribute("data-gauge-level")).toBe(level1);
    expect(level1).toBe("60");
    const a = await card.screenshot();
    await page.waitForTimeout(1_200);
    expect((await card.screenshot()).equals(a)).toBe(true);
  });

  test("criterion 38: under reduced motion the preview is pixel-identical before and during hover and focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "glyph" });
    await settingsLink(page).click();
    const card = optionLabel(page, "In the digits");
    const still = await card.screenshot();
    await card.hover();
    expect((await card.screenshot()).equals(still)).toBe(true);
    await option(page, "In the digits").focus();
    expect((await card.screenshot()).equals(still)).toBe(true);
  });

  test("criterion 39: under reduced motion the live gauge has no spring, lands on the level at once, and still updates with time", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await startBtn(page).click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
    const level0 = Number(await gauge(page).getAttribute("data-gauge-level"));
    await page.clock.fastForward(5 * 60_000);
    await expect
      .poll(async () => Number(await gauge(page).getAttribute("data-gauge-level")), { message: "level tracks time" })
      .toBeLessThan(level0 - 10);
    const seconds = await readoutSeconds(page);
    const level = Number(await gauge(page).getAttribute("data-gauge-level"));
    expect(Math.abs(level - (seconds / (25 * 60)) * 100)).toBeLessThanOrEqual(2);
    // The painted level is the clip-path's top edge: top % = 100 - level. Reduced motion lands it on the same frame.
    const painted = async () => 100 - (await liquidTopPercent(gauge(page)));
    // Polled: the first frame after "ready" can still show the previous commit under load; reduced motion lands it within the poll.
    await expect
      .poll(async () => Math.abs((await painted()) - Number(await gauge(page).getAttribute("data-gauge-level"))), {
        message: "reduced motion: the first painted level lands on the reported level",
        timeout: 1_000,
      })
      .toBeLessThanOrEqual(1.5);
    await page.clock.fastForward(60_000);
    await expect
      .poll(async () => Math.abs((await painted()) - Number(await gauge(page).getAttribute("data-gauge-level"))), {
        message: "no lag: painted level lands on the reported level within 300 ms",
        timeout: 300,
      })
      .toBeLessThanOrEqual(1.5);
  });

  test("criterion 40: with motion allowed the live gauge still animates: two samples 350 ms apart during a running session differ", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await startBtn(page).click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
    // A level jump gives the spring something to travel; a steady level would not show motion.
    await page.clock.fastForward(5 * 60_000);
    const liquid = gauge(page).locator('[role="meter"] > div').first();
    const a = await liquid.evaluate((el) => getComputedStyle(el).clipPath);
    await page.waitForTimeout(350);
    const b = await liquid.evaluate((el) => getComputedStyle(el).clipPath);
    expect(a).not.toBe(b);
  });
});

test.describe("criterion 22, 28, 29, 32: the gauge paints progress again, and state has a non-colour cue", () => {
  test("criterion 22: the vessel level changes as the session runs, and the glyph boundary moves (not frozen at 100)", async ({ page }) => {
    await page.clock.install();
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "glyph" });
    await startBtn(page).click();
    const frame = gauge(page).locator("xpath=..");
    await expect(gauge(page)).toHaveAttribute("data-gauge-ready", "true");
    await expect.poll(() => frame.evaluate((el) => el.style.getPropertyValue("--gauge-surface")), { timeout: 5_000 }).not.toBe("");
    const surfaceStart = await frame.evaluate((el) => el.style.getPropertyValue("--gauge-surface"));
    await page.clock.fastForward(5 * 60_000);
    await expect.poll(() => frame.evaluate((el) => el.style.getPropertyValue("--gauge-surface")), { timeout: 5_000 }).not.toBe(surfaceStart);
    const surfaceLater = Number(await frame.evaluate((el) => el.style.getPropertyValue("--gauge-surface")));
    expect(surfaceLater).toBeLessThan(100);

    await settingsLink(page).click();
    await optionLabel(page, "Vessel").click();
    await backLink(page).click();
    await expect(gauge(page)).toHaveAttribute("data-gauge-style", "vessel");
    const levelA = Number(await gauge(page).getAttribute("data-gauge-level"));
    await page.clock.fastForward(2 * 60_000);
    await expect
      .poll(async () => Number(await gauge(page).getAttribute("data-gauge-level")), { timeout: 5_000 })
      .toBeLessThan(levelA);
  });

  test("criterion 28: the switch says On or Off in text, so its state is not carried by colour alone", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    await expect(switchLabel(page)).toContainText("On");
    await switchLabel(page).click();
    await expect(switchLabel(page)).toContainText("Off");
    await expect(switchLabel(page)).not.toContainText("On");
  });

  test("criterion 29, 32: exactly one option is checked, and the selected card carries a check mark as well as its outline", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "glyph" });
    await settingsLink(page).click();
    const group = page.getByRole("group", { name: "Gauge style" });
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(optionLabel(page, "In the digits").locator("svg")).toHaveCount(1);
    await expect(optionLabel(page, "Vessel").locator("svg")).toHaveCount(0);
    await optionLabel(page, "Vessel").click();
    await expect(optionLabel(page, "Vessel").locator("svg")).toHaveCount(1);
    await expect(optionLabel(page, "In the digits").locator("svg")).toHaveCount(0);
  });
});

test.describe("criterion 20, 22b, 33b: the default is off, and the off state shows no selected cue", () => {
  test("criterion 20, 22b: a fresh install shows no gauge on /, and the settings switch is off with vessel preselected", async ({ page }) => {
    await page.goto("/");
    await expect(startBtn(page)).toBeVisible();
    await expect(gauge(page)).toHaveCount(0);
    await expect(page.locator("span[data-time]")).toHaveCount(0);
    await settingsLink(page).click();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "false");
    await expect(option(page, "Vessel")).toBeChecked();
  });

  test("criterion 33b: off shows no check mark, outline or selected background; gaugeStyle is untouched; turning on re-shows the highlight with no reload", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "glyph" });
    await settingsLink(page).click();
    const glyphLabel = optionLabel(page, "In the digits");
    const vesselLabel = optionLabel(page, "Vessel");
    // The label, its card (child 1) and the name: the outline and bold name are painted on the card.
    const cue = (loc: Locator) =>
      loc.evaluate((el) => {
        const card = el.children[1] ?? el; // input is child 0; the card is child 1
        const name = card.querySelector("span.font-medium, span.font-bold") ?? card;
        return [el, card, name].flatMap((node) => {
          const s = getComputedStyle(node);
          return [s.borderTopWidth, s.borderTopColor, s.boxShadow, s.backgroundColor, s.outlineStyle, s.fontWeight];
        });
      });

    // On: the selected card carries the check mark and a distinct cue.
    await expect(glyphLabel.locator("svg")).toHaveCount(1);
    const onGlyph = await cue(glyphLabel);
    const onVessel = await cue(vesselLabel);
    expect(onGlyph).not.toEqual(onVessel);

    // Off: no cue on any card, but the radio stays programmatically checked (tab stop for 30/34).
    await switchLabel(page).click();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "false");
    // Soft: a failing cue must not stop the restore checks below from running.
    await expect.soft(glyphLabel.locator("svg")).toHaveCount(0);
    await expect.soft(vesselLabel.locator("svg")).toHaveCount(0);
    await expect(option(page, "In the digits")).toBeChecked();
    // Polled: the card colours ease over transition-colors, so compare the settled value, not a mid-fade one.
    const vesselOff = await cue(vesselLabel);
    await expect
      .poll(() => cue(glyphLabel), { message: "off: the selected card carries no selected-only border, shadow or weight" })
      .toEqual(vesselOff);
    expect(await storedState(page)).toMatchObject({ gaugeEnabled: false, gaugeStyle: "glyph" });

    // Back on, same page, no reload: the highlight returns on the style chosen before.
    await switchLabel(page).click();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "true");
    await expect(glyphLabel.locator("svg")).toHaveCount(1);
    await expect.poll(() => cue(glyphLabel), { message: "on again: the highlight returns on the chosen style" }).toEqual(onGlyph);
    expect(await storedState(page)).toMatchObject({ gaugeEnabled: true, gaugeStyle: "glyph" });
  });
});

test.describe("review F1, F2: Enter on the switch, and the off-state hint reaches every radio", () => {
  test("criterion 30 (Enter clause, review F2): Enter toggles the focused switch, both ways, evidenced", async ({ page }) => {
    await seedPrefs(page, { gaugeEnabled: true, gaugeStyle: "vessel" });
    await settingsLink(page).click();
    await page.getByRole("heading", { name: "Settings" }).click();
    for (let i = 0; i < 40 && !(await switchInput(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(switchInput(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "false");
    expect((await storedState(page)).gaugeEnabled).toBe(false);
    await page.keyboard.press("Enter");
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "true");
    expect((await storedState(page)).gaugeEnabled).toBe(true);
  });

  test("review F1: while off, each radio's accessible description carries the explanation, not only the fieldset", async ({ page }) => {
    // Structural check of the accessibility tree. It is not a screen-reader pass: criterion 35's by-hand pass still has to confirm F1.
    await seedPrefs(page, { gaugeEnabled: false, gaugeStyle: "glyph" });
    await settingsLink(page).click();
    const hint = /Turn on the gauge to choose a style\./;
    await expect(option(page, "In the digits")).toHaveAccessibleDescription(hint);
    await expect(option(page, "Vessel")).toHaveAccessibleDescription(hint);
    await switchLabel(page).click();
    await expect(switchInput(page)).toHaveAttribute("aria-checked", "true");
    await expect(option(page, "In the digits")).not.toHaveAccessibleDescription(hint);
  });
});
