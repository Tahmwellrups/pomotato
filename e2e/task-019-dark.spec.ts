import { expect, test, type Browser, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { PREFS_KEY } from "./helpers/background";
import { DESKTOP } from "./helpers/dark";

// Task 019, behaviour and platform checks: groups A (rendered), B, C (e2e half), D, E.
// Measurement lives in e2e/task-019-measure.spec.ts. Dark is the only palette, so the
// expected ground is the one dark value, read from the computed style of <html>.

const DARK_BACKGROUND = "#1c140e";
const ROUTES = ["/", "/stats", "/settings"] as const;
const SCHEMES = ["light", "dark", "no-preference"] as const;

async function backgroundToken(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim().toLowerCase());
}

/** Storage envelope a stale build could leave behind: the deleted theme field plus non-default neighbours. */
function staleEnvelope(extra: Record<string, unknown>): string {
  return JSON.stringify({
    state: {
      theme: "light",
      gaugeStyle: "glyph",
      background: null,
      mix: { rain: { on: false, level: 50 }, wind: { on: false, level: 50 }, waves: { on: false, level: 50 }, hum: { on: false, level: 50 } },
      taskPanelVisible: true,
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      chimeEnabled: true,
      chimeLevel: 50,
      ...extra,
    },
    version: 3,
  });
}

/** Seeds the envelope once, before any app script runs on the first load of the context. */
async function seedOnce(page: Page, raw: string) {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("seeded", "1");
      }
    },
    [PREFS_KEY, raw] as const,
  );
}

/** Attributes on <html>, as name=value strings, minus the font-variable class list which the build may reorder. */
async function rootAttributes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.documentElement.attributes)
      .filter((a) => a.name !== "class" && a.name !== "style")
      .map((a) => `${a.name}=${a.value}`)
      .sort(),
  );
}

/** Focus stops from Tab: accessible name, whether a focus target is visible, and whether the stop sits in the header. */
async function focusStops(page: Page, limit: number) {
  const stops: { name: string; visible: boolean; tag: string; inHeader: boolean }[] = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      // A sr-only radio shows its focus on the chip beside it (peer-focus-visible).
      const chip = el.nextElementSibling as HTMLElement | null;
      const chipStyle = chip ? getComputedStyle(chip) : null;
      const ring = (s: CSSStyleDeclaration) => (s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none";
      const visible = ring(style) || (el.matches('input[type="radio"]') && !!chipStyle && ring(chipStyle));
      const name = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.getAttribute("name") ?? "";
      // HeaderNav is the div that holds the wordmark h1.
      const header = document.querySelector("h1")?.parentElement ?? null;
      return { name: name.slice(0, 60), visible, tag: el.tagName.toLowerCase(), inHeader: !!header && header.contains(el) };
    });
    if (!stop) break;
    stops.push(stop);
  }
  return stops;
}

test.describe("criterion 11-13: dark paints under every OS colour scheme", () => {
  for (const scheme of SCHEMES) {
    test(`colorScheme ${scheme}: / paints the dark --background`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: scheme, viewport: DESKTOP });
      const page = await context.newPage();
      await page.goto("/");
      expect(await backgroundToken(page)).toBe(DARK_BACKGROUND);
      await context.close();
    });
  }

  test("colorScheme light: /, /stats and /settings all paint the same dark --background", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light", viewport: DESKTOP });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(route);
      expect(await backgroundToken(page), route).toBe(DARK_BACKGROUND);
    }
    await context.close();
  });
});

test.describe("criterion 14: the dark signal is in the server-rendered HTML", () => {
  test("with JavaScript disabled, each route's <html> carries data-theme=dark", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(route);
      const html = await page.content();
      expect(html, route).toMatch(/<html[^>]*data-theme="dark"/);
    }
    await context.close();
  });

  test("the response body read by the request API carries the dark signal before any script", async ({ request }) => {
    for (const route of ROUTES) {
      const body = await (await request.get(route)).text();
      expect(body, route).toMatch(/<html[^>]*data-theme="dark"/);
    }
  });
});

test.describe("criterion 25, 26: native UI and platform signals", () => {
  test("color-scheme resolves to dark on <html> on every route", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
      expect(scheme, route).toBe("dark");
    }
  });

  test("theme-color meta equals the computed --background of <html> on /", async ({ page }, testInfo) => {
    await page.goto("/");
    const meta = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content")?.trim().toLowerCase() ?? null);
    const token = await backgroundToken(page);
    testInfo.annotations.push({ type: "figure", description: `theme-color=${meta}; computed --background on <html> of / = ${token}` });
    expect(meta).not.toBeNull();
    expect(meta).toBe(token);
  });
});

test.describe("criterion 3, 4: no theme control in the header, and the tab order has visible focus", () => {
  test("no Theme text or theme control on any route", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, route).not.toMatch(/\btheme\b/i);
      expect(await page.locator('[name="theme"], [data-testid*="theme" i]').count(), route).toBe(0);
    }
  });

  test("tab order on / has no theme stop, and no header stop lacks a visible focus target", async ({ page }, testInfo) => {
    await page.goto("/");
    const stops = await focusStops(page, 60);
    testInfo.annotations.push({
      type: "figure",
      description: `focus stops on / (all): ${stops.map((s) => `${s.tag}:${s.name}${s.visible ? "" : "(no visible focus)"}${s.inHeader ? "[header]" : ""}`).join(" | ")}`,
    });
    expect(stops.filter((s) => /theme|light|system/i.test(s.name))).toEqual([]);
    expect(stops.filter((s) => s.inHeader && !s.visible)).toEqual([]);
  });

  test("the header's children on / are recorded (HeaderNav: wordmark only)", async ({ page }, testInfo) => {
    await page.goto("/");
    const children = await page.evaluate(() => {
      const header = document.querySelector("h1")?.parentElement;
      return header ? Array.from(header.children).map((el) => el.tagName.toLowerCase()) : [];
    });
    testInfo.annotations.push({ type: "figure", description: `header children on /: ${children.join(", ")}` });
    expect(children).toEqual(["h1"]);
  });
});

test.describe("criterion 15 (instrumented): no light frame on a throttled hard refresh", () => {
  test("4x CPU throttle, 1280x800: no sampled frame paints a non-dark background", async ({ page }, testInfo) => {
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.setViewportSize(DESKTOP);
    await page.addInitScript(() => {
      const samples: string[] = [];
      (window as unknown as { __samples: string[] }).__samples = samples;
      const tick = () => {
        samples.push(getComputedStyle(document.documentElement).getPropertyValue("--background").trim().toLowerCase() || "unset");
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto("/");
    await page.reload();
    await page.waitForLoadState("load");
    const samples = await page.evaluate(() => (window as unknown as { __samples: string[] }).__samples);
    testInfo.annotations.push({ type: "figure", description: `throttle=4x viewport=1280x800 frames=${samples.length} distinct=${[...new Set(samples)].join(" ")}` });
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.filter((s) => s !== DARK_BACKGROUND)).toEqual([]);
  });
});

test.describe("criterion 17, 18, 20, 21: a stale stored theme boots clean and is dropped from storage", () => {
  async function boot(browser: Browser, raw: string | null) {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });
    if (raw !== null) await seedOnce(page, raw);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    return { context, page, errors };
  }

  test("criterion 17: a stale theme boots with no page error and no console error", async ({ browser }) => {
    const { context, errors } = await boot(browser, staleEnvelope({}));
    expect(errors).toEqual([]);
    await context.close();
  });

  test("criterion 18: a stale theme paints and sets the same <html> state as a boot with no stored entry", async ({ browser }) => {
    const seeded = await boot(browser, staleEnvelope({}));
    const seededBg = await backgroundToken(seeded.page);
    const seededAttrs = await rootAttributes(seeded.page);
    await seeded.context.close();

    const clean = await boot(browser, null);
    expect(seededBg).toBe(await backgroundToken(clean.page));
    expect(seededAttrs).toEqual(await rootAttributes(clean.page));
    await clean.context.close();
  });

  test("criterion 20, 21: the theme field is written away and the neighbours survive unchanged", async ({ browser }) => {
    const { context, page } = await boot(browser, staleEnvelope({ background: "123e4567-e89b-42d3-a456-426614174000", taskPanelVisible: false, focusMinutes: 30, shortBreakMinutes: 7, longBreakMinutes: 20, chimeEnabled: false, chimeLevel: 40, gaugeStyle: "glyph" }));
    const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), PREFS_KEY)) ?? "null") as { state: Record<string, unknown>; version: number };
    expect(Object.prototype.hasOwnProperty.call(stored.state, "theme")).toBe(false);
    expect(stored.state).toMatchObject({
      background: "123e4567-e89b-42d3-a456-426614174000",
      taskPanelVisible: false,
      gaugeStyle: "glyph",
      focusMinutes: 30,
      shortBreakMinutes: 7,
      longBreakMinutes: 20,
      chimeEnabled: false,
      chimeLevel: 40,
    });
    await context.close();
  });
});

test.describe("criterion 31, 32: axe at serious or critical, and a clean console on all three routes", () => {
  for (const route of ROUTES) {
    test(`axe on ${route} has no serious or critical violations`, async ({ page }, testInfo) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const moderate = results.violations.filter((v) => v.impact === "moderate").map((v) => v.id);
      testInfo.annotations.push({ type: "figure", description: `${route} moderate: ${moderate.join(",") || "none"}` });
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking.map((v) => `${v.impact}:${v.id}`)).toEqual([]);
    });
  }

  test("no console error or warning while loading all three routes", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
    }
    expect(messages).toEqual([]);
  });
});

test.describe("criterion 29, 30: active states carry a non-colour indicator and matching ARIA", () => {
  test("mode chips: the checked radio is native-checked and its chip is heavier than the unchecked chips", async ({ page }, testInfo) => {
    await page.goto("/");
    const chips = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name="timer-mode"]')).map((input) => {
        const chip = input.nextElementSibling as HTMLElement | null;
        return { value: input.value, checked: input.checked, weight: chip ? getComputedStyle(chip).fontWeight : "missing" };
      }),
    );
    testInfo.annotations.push({ type: "figure", description: `mode chips: ${JSON.stringify(chips)}` });
    const checked = chips.filter((c) => c.checked);
    const unchecked = chips.filter((c) => !c.checked);
    expect(checked).toHaveLength(1);
    expect(unchecked.length).toBeGreaterThan(0);
    for (const c of unchecked) expect(Number(checked[0].weight)).toBeGreaterThan(Number(c.weight));
  });

  test("task-panel toggle: aria-expanded and the active mark agree, and the mark is absent when closed", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Tasks", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle.getByTestId("task-panel-active-mark")).toHaveCount(1);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle.getByTestId("task-panel-active-mark")).toHaveCount(0);
  });
});

test.describe("criterion 33: reduced motion leaves no running finite animation", () => {
  test("under prefers-reduced-motion: reduce, no finite-duration animation is running on /", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: DESKTOP });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForTimeout(800);
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.effect?.getComputedTiming().duration !== Infinity)
        .map((a) => (a as CSSAnimation).animationName || a.constructor.name),
    );
    testInfo.annotations.push({ type: "figure", description: `running finite animations under reduced motion: ${running.join(",") || "none"}` });
    expect(running).toEqual([]);
    await context.close();
  });
});

test.describe("criterion 27, 34: native chrome and forced colours, with screenshot evidence", () => {
  test("/settings: color-scheme is dark and one screenshot is kept for the native-chrome review", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: DESKTOP, colorScheme: "light" });
    const page = await context.newPage();
    await page.goto("/settings");
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    const path = testInfo.outputPath("task-019-settings-native.png");
    await page.screenshot({ path });
    testInfo.annotations.push({ type: "figure", description: `/settings color-scheme=${scheme}; screenshot=${path}` });
    expect(scheme).toBe("dark");
    await context.close();
  });

  test("forced-colors: active on /, the timer digits, the start control and the mode chips are visible, and the selected chip differs", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: DESKTOP, forcedColors: "active" });
    const page = await context.newPage();
    await page.goto("/");
    const visible = await page.evaluate(() => {
      const shown = (el: Element | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const checked = document.querySelector<HTMLInputElement>('input[name="timer-mode"]:checked + span');
      const unchecked = document.querySelector<HTMLInputElement>('input[name="timer-mode"]:not(:checked) + span');
      return {
        digits: shown(document.querySelector('[class*="tabular-nums"]')),
        start: shown(document.querySelector('button[aria-label="Start"], button[aria-label="Pause"]')),
        chipChecked: shown(checked),
        chipUnchecked: shown(unchecked),
        selectedHeavier: checked && unchecked ? Number(getComputedStyle(checked).fontWeight) > Number(getComputedStyle(unchecked).fontWeight) : false,
      };
    });
    const path = testInfo.outputPath("task-019-forced-colors.png");
    await page.screenshot({ path });
    testInfo.annotations.push({ type: "figure", description: `forced-colors on /: ${JSON.stringify(visible)}; screenshot=${path}` });
    expect(visible.digits && visible.start && visible.chipChecked && visible.chipUnchecked).toBe(true);
    expect(visible.selectedHeavier).toBe(true);
    await context.close();
  });
});

test.describe("criterion 35 (plain page): the focus ring shows on keyboard focus and not on mouse focus", () => {
  test("keyboard: every focus stop on / shows a visible focus target, including the task-title inputs", async ({ page }, testInfo) => {
    await page.goto("/");
    const stops = await focusStops(page, 60);
    const hidden = stops.filter((s) => !s.visible).map((s) => `${s.tag}:${s.name}`);
    testInfo.annotations.push({ type: "figure", description: `keyboard stops on /: ${stops.length}; without a visible target: ${hidden.join(" | ") || "none"}` });
    expect(stops.length).toBeGreaterThan(5);
    expect(hidden).toEqual([]);
  });

  test("mouse: clicking a task-title input or the Start control does not show the focus ring", async ({ page }, testInfo) => {
    await page.goto("/");
    const results: string[] = [];
    // A text input matches :focus-visible even on mouse focus (the caret needs it), so for the input the
    // check is that no default UA outline appears: the outline is the token ring or none, never "auto".
    const input = page.locator("input[type=\"text\"], input:not([type])").first();
    await input.click();
    const inputState = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { tag: el.tagName, focusVisible: el.matches(":focus-visible"), outline: s.outlineStyle, outlineColor: s.outlineColor };
    });
    results.push(JSON.stringify(inputState));
    expect(inputState.tag).toBe("INPUT");
    expect(inputState.outline).not.toBe("auto");
    // A button does not match :focus-visible on mouse focus, so it shows no ring at all.
    const start = page.getByRole("button", { name: "Start", exact: true });
    await start.click();
    const startState = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { label: el.getAttribute("aria-label"), focusVisible: el.matches(":focus-visible"), outline: s.outlineStyle };
    });
    results.push(JSON.stringify(startState));
    expect(startState.focusVisible).toBe(false);
    expect(startState.outline).toBe("none");
    testInfo.annotations.push({ type: "figure", description: `mouse focus states: ${results.join(" ; ")}` });
  });
});
