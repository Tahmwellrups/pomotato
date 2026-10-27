import { expect, test, type Page } from "@playwright/test";
import { LAYERS } from "../lib/audio/layers";
import {
  DESKTOP,
  NARROW,
  THEME_KEY,
  TIMER_KEY,
  envelope,
  htmlHasDark,
  must,
  openThemed,
  pixelsAt,
  readout,
  themeLabel,
  themeRadio,
  type Preference,
} from "./helpers/dark";
import { readPainted } from "./helpers/painted";
import { closeTaskList, openTaskList } from "./helpers/task-list-dialog";
import { seedTimerState } from "./helpers/timer-hold";

// Task 009 criteria 3, 5, 8, 9, 10, 31-37, 40, 47, 48. The theme control and the
// preference's storage, first paint, hydration, live OS flip and motion.

const themeGroup = (page: Page) => page.getByRole("group", { name: "Theme", exact: true });

test.describe("criterion 31-33, 35-37: one native control, named, keyboard-operable, sized", () => {
  test("31: exactly one theme control on /, none on /stats", async ({ page }) => {
    await openThemed(page, { stored: null, osDark: false });
    await expect(themeGroup(page)).toHaveCount(1);
    await expect(page.locator('input[name="theme"]')).toHaveCount(3);
    await page.goto("/stats");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('input[name="theme"]')).toHaveCount(0);
    await expect(themeGroup(page)).toHaveCount(0);
  });

  test("33: the group and each option expose their accessible names and the checked state", async ({ page }) => {
    await openThemed(page, { stored: "dark", osDark: false });
    await expect(themeGroup(page)).toBeVisible();
    await expect(themeRadio(page, "Light")).toHaveCount(1);
    await expect(themeRadio(page, "Dark")).toBeChecked();
    await expect(themeRadio(page, "Light")).not.toBeChecked();
    await expect(themeRadio(page, "System")).not.toBeChecked();
    // The names a screen reader announces, recorded for the QA Report.
    const names = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>('input[name="theme"]')].map((el) => ({
        value: el.value,
        label: el.labels?.[0]?.textContent?.trim() ?? "",
        checked: el.checked,
        role: el.getAttribute("role"),
      })),
    );
    expect(names).toEqual([
      { value: "light", label: "Light", checked: false, role: null },
      { value: "dark", label: "Dark", checked: true, role: null },
      { value: "system", label: "System", checked: false, role: null },
    ]);
    const legend = await page.evaluate(() => document.querySelector('fieldset legend')?.textContent ?? "");
    expect(legend).toBeTruthy();
  });

  for (const [label, viewport] of [
    ["320 px", NARROW],
    ["1280 px", DESKTOP],
  ] as const) {
    test(`32: the control is in the initial render, with no scroll, at ${label}`, async ({ page }) => {
      await openThemed(page, { stored: null, osDark: false, viewport });
      const box = must(await themeGroup(page).boundingBox(), "theme group box");
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    });

    test(`37: each option's clickable label is at least 44x44 at ${label}`, async ({ page }) => {
      await openThemed(page, { stored: null, osDark: false, viewport });
      for (const value of ["light", "dark", "system"]) {
        const label = page.locator(`label:has(input[name="theme"][value="${value}"])`);
        const box = must(await label.boundingBox(), `${value} label box`);
        expect(box.width, `${value} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${value} height`).toBeGreaterThanOrEqual(44);
      }
    });

    test(`38: no horizontal overflow at ${label}`, async ({ page }) => {
      await openThemed(page, { stored: null, osDark: false, viewport });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });
  }

  test("35: Tab from a cold load reaches the group once; arrows change the theme; Tab leaves without a trap", async ({ page }) => {
    await openThemed(page, { stored: "system", osDark: false });
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    // Cold keyboard entry: the first Tab stop is the checked option of the theme group.
    await page.keyboard.press("Tab");
    await expect(themeRadio(page, "System")).toBeFocused();
    expect(await htmlHasDark(page)).toBe(false);
    // Arrow keys move between options and change the theme, with native radio behaviour.
    await page.keyboard.press("ArrowLeft");
    await expect(themeRadio(page, "Dark")).toBeFocused();
    await expect(themeRadio(page, "Dark")).toBeChecked();
    expect(await htmlHasDark(page)).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(themeRadio(page, "System")).toBeFocused();
    expect(await htmlHasDark(page)).toBe(false);
    // Tab moves focus out of the group: the group is entered once, not trapped.
    await page.keyboard.press("Tab");
    await expect(themeRadio(page, "System")).not.toBeFocused();
    const focusedTheme = await page.evaluate(() => document.activeElement?.getAttribute("name") ?? null);
    expect(focusedTheme).not.toBe("theme");
    // Shift+Tab returns into the group on the checked option, then Escape leaves focus alone.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).toBeVisible();
  });

  test("36: no ARIA role constructed where a native radio does the job", async ({ page }) => {
    await openThemed(page, { stored: null, osDark: false });
    const built = await page.evaluate(() => {
      const group = document.querySelector('input[name="theme"]')?.closest("fieldset");
      return {
        radiogroup: group?.querySelectorAll('[role="radiogroup"],[role="switch"]').length ?? -1,
        buttonRole: group?.querySelectorAll('[role="button"]').length ?? -1,
        inputs: group?.querySelectorAll('input[type="radio"]').length ?? -1,
        fieldset: group?.tagName ?? "",
      };
    });
    expect(built).toEqual({ radiogroup: 0, buttonRole: 0, inputs: 3, fieldset: "FIELDSET" });
  });
});

test.describe("criterion 34: the checked option is marked by weight, not only colour", () => {
  for (const osDark of [false, true]) {
    test(`checked option is bold and the others are regular, in ${osDark ? "dark" : "light"} OS and both themes`, async ({ page }) => {
      for (const stored of ["light", "dark"] as const) {
        await openThemed(page, { stored, osDark });
        const checked = await readPainted(page, page.locator(`label:has(input[name="theme"][value="${stored}"]) span`));
        const others = await Promise.all(
          (["light", "dark", "system"] as const)
            .filter((v) => v !== stored)
            .map((v) => readPainted(page, page.locator(`label:has(input[name="theme"][value="${v}"]) span`))),
        );
        expect(checked.fontWeight).toBeGreaterThanOrEqual(700);
        for (const other of others) expect(other.fontWeight).toBeLessThanOrEqual(400);
      }
    });
  }

  test("under a greyscale filter the checked option is still identifiable by weight", async ({ page }) => {
    await openThemed(page, { stored: "dark", osDark: false });
    await page.evaluate(() => {
      document.documentElement.style.filter = "grayscale(1)";
    });
    const weights = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>('input[name="theme"]')].map((el) => ({
        value: el.value,
        checked: el.checked,
        weight: getComputedStyle(el.labels?.[0]?.querySelector("span") ?? el).fontWeight,
      })),
    );
    expect(weights.find((w) => w.checked)?.weight).toBe("700");
    expect(weights.filter((w) => !w.checked).map((w) => w.weight)).toEqual(["400", "400"]);
    await page.evaluate(() => {
      document.documentElement.style.filter = "";
    });
  });
});

test.describe("criterion 3, 5, 40: storage, malformed values, immediate change, persistence", () => {
  test("3: clicking Dark writes exactly the envelope with the enum, and nothing else", async ({ page }) => {
    await openThemed(page, { stored: "system", osDark: false });
    await themeLabel(page, "Dark").click();
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), THEME_KEY);
    // Task 008 widened the entry to { theme, gaugeStyle }; task 010 adds the background reference, null here.
    // Task 011 adds the mix key at its default; the envelope is otherwise unchanged.
    expect(raw).toBe(JSON.stringify({ state: { theme: "dark", gaugeStyle: "vessel", background: null, mix: Object.fromEntries(LAYERS.map((layer) => [layer.id, { on: false, level: 50 }])) }, version: 1 }));
    expect(Object.keys(JSON.parse(raw ?? "null").state).sort()).toEqual(["background", "gaugeStyle", "mix", "theme"]);
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb|oklch|class|hsl/i);
  });

  test("40: the theme changes at once on activation, survives reload, and a new tab in the same browser", async ({ page, context }) => {
    await openThemed(page, { stored: "light", osDark: false });
    expect(await htmlHasDark(page)).toBe(false);
    const started = Date.now();
    await themeLabel(page, "Dark").click();
    // No reload, no second click: the class is on <html> within a frame or two.
    await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 1000 });
    expect(Date.now() - started).toBeLessThan(1000);
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await htmlHasDark(page)).toBe(true);
    await expect(themeRadio(page, "Dark")).toBeChecked();
    const tab = await context.newPage();
    await tab.goto("/");
    await tab.waitForLoadState("networkidle");
    expect(await htmlHasDark(tab)).toBe(true);
    await expect(themeRadio(tab, "Dark")).toBeChecked();
    await tab.close();
  });

  for (const raw of ['Dark', 'auto', '{', 'null', '42', '']) {
    test(`5: a stored ${JSON.stringify(raw)} falls back to system, with no page error and no half-applied class`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));
      await openThemed(page, { stored: null, raw, osDark: false });
      await expect(themeRadio(page, "System")).toBeChecked();
      expect(await htmlHasDark(page)).toBe(false);
      const classes = await page.evaluate(() => document.documentElement.className);
      expect(classes.split(/\s+/).filter((c) => c === "dark").length).toBeLessThanOrEqual(1);
      expect(pageErrors).toEqual([]);
    });
  }

  test("5: a malformed entry with an OS-dark machine resolves system to dark, not light", async ({ page }) => {
    await openThemed(page, { stored: null, raw: "Dark", osDark: true });
    await expect(themeRadio(page, "System")).toBeChecked();
    expect(await htmlHasDark(page)).toBe(true);
  });
});

test.describe("criterion 6: the theme is not stored in IndexedDB", () => {
  test("the preference lives in localStorage, and no IndexedDB store holds it", async ({ page }) => {
    await openThemed(page, { stored: "dark", osDark: false });
    await page.getByRole("button", { name: "Your tasks", exact: true }).click();
    await page.getByRole("dialog", { name: "Your tasks", exact: true }).waitFor();
    const hasLocal = await page.evaluate((key) => window.localStorage.getItem(key) !== null, THEME_KEY);
    expect(hasLocal).toBe(true);
    const dump = await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      const names = databases.map((d) => d.name ?? "").filter(Boolean);
      const out: string[] = [];
      for (const name of names) {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        for (const store of Array.from(db.objectStoreNames)) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const tx = db.transaction(store, "readonly");
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result as unknown[]);
            req.onerror = () => reject(req.error);
          });
          out.push(JSON.stringify(values));
        }
        db.close();
      }
      return out.join("\n");
    });
    expect(dump).not.toMatch(/pomotato-preferences|"theme"|"dark"/);
  });
});

test.describe("criterion 8, 48: no light flash, nothing transitions on load", () => {
  // Observation point: the first MutationObserver callback that can see <body>. The inline boot
  // script runs while <head> is parsed, so by then the class is set. The stored value is seeded
  // by this same init script, so it is in place before the boot script reads it.
  const setup = ([key, value, observe]: readonly [string, string, boolean]) => {
    if (observe) {
      const w = window as unknown as { __firstFrame?: { dark: boolean; transitions: number } };
      const mo = new MutationObserver(() => {
        if (!document.body || w.__firstFrame) return;
        const transitions = document.getAnimations().filter((a) => a instanceof CSSTransition).length;
        w.__firstFrame = { dark: document.documentElement.classList.contains("dark"), transitions };
        mo.disconnect();
      });
      mo.observe(document, { childList: true, subtree: true });
    }
    window.localStorage.setItem(key, value);
  };

  for (const scenario of [
    { label: "dark stored, OS light", stored: "dark" as Preference, osDark: false, expectDark: true },
    { label: "system stored, OS dark", stored: "system" as Preference, osDark: true, expectDark: true },
    { label: "light stored, OS dark", stored: "light" as Preference, osDark: true, expectDark: false },
  ]) {
    test(`8: ${scenario.label}: the class is set at the first observable point and the first frame is the final theme`, async ({ page }) => {
      await page.addInitScript(setup, [THEME_KEY, envelope(scenario.stored), true] as const);
      // Hold the app's JS back so the first paint is what server HTML and the boot script produce.
      await page.route("**/_next/static/chunks/**/*.js", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.continue();
      });
      await page.emulateMedia({ colorScheme: scenario.osDark ? "dark" : "light" });
      await page.setViewportSize(DESKTOP);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const observed = await page.evaluate(
        () => (window as unknown as { __firstFrame?: { dark: boolean; transitions: number } }).__firstFrame ?? null,
      );
      expect(observed, "the observer fired before the app loaded").not.toBeNull();
      const seen = must(observed, "first-frame observation");
      expect(seen.dark, "class at first observable point").toBe(scenario.expectDark);
      expect(seen.transitions, "colour transitions in flight at first observable point").toBe(0);
      // Painted first frame: the page ground at (4,4). This asserts the criterion's actual
      // intent -- the first frame is the RIGHT theme -- rather than an exact token match.
      // The paper grain (body::before, a noise mask over --grain-ink) means no ground pixel
      // equals the flat token any more; measured spread is 236-251 light, 28-40 dark. The two
      // themes sit ~220 apart per channel, so "nearer the correct ground than the other one"
      // is a far wider safety margin than exact equality ever gave, and still fails loudly on
      // a real wrong-theme flash. GRAIN_TOLERANCE covers the noise, not a palette change.
      const GRAIN_TOLERANCE = 24;
      const LIGHT_GROUND = [251, 244, 234];
      const DARK_GROUND = [28, 20, 14];
      const [pixel] = await pixelsAt(page, [[4, 4]]);
      const expected = scenario.expectDark ? DARK_GROUND : LIGHT_GROUND;
      const other = scenario.expectDark ? LIGHT_GROUND : DARK_GROUND;
      const spread = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
      expect(
        Math.max(...expected.map((v, i) => Math.abs(v - pixel[i]))),
        `first painted pixel ${JSON.stringify(pixel)} vs --background ${JSON.stringify(expected)} for ${scenario.label} (grain tolerance ${GRAIN_TOLERANCE})`,
      ).toBeLessThanOrEqual(GRAIN_TOLERANCE);
      expect(
        spread(pixel, expected) < spread(pixel, other),
        `first painted pixel must be nearer the ${scenario.expectDark ? "dark" : "light"} ground than the other theme's for ${scenario.label}`,
      ).toBe(true);
      await page.unroute("**/_next/static/chunks/**/*.js");
    });
  }
});

test.describe("criterion 9: no React hydration mismatch on reload, every stored state, OS and timer state", () => {
  for (const stored of ["light", "dark", "system"] as const) {
    for (const osDark of [false, true]) {
      test(`stored ${stored}, OS ${osDark ? "dark" : "light"}: zero hydrat console messages on / (idle, running, paused) and /stats`, async ({ page }) => {
        test.setTimeout(120_000);
        const hydration: string[] = [];
        page.on("console", (msg) => {
          if (/hydrat/i.test(msg.text())) hydration.push(`[${msg.type()}] ${msg.text()}`);
        });
        await page.emulateMedia({ colorScheme: osDark ? "dark" : "light" });
        await page.setViewportSize(DESKTOP);
        await page.goto("/");
        for (const timer of ["idle", "running", "paused"] as const) {
          await page.evaluate((key) => window.localStorage.removeItem(key), TIMER_KEY);
          if (timer !== "idle") {
            await seedTimerState(page, {
              status: timer,
              endTimestamp: timer === "running" ? Date.now() + 600_000 : null,
              pausedRemainingMs: timer === "paused" ? 600_000 : null,
              // Paused and running entries must carry a run id; a paused entry has no start time.
              startedAt: timer === "running" ? Date.now() : null,
              runId: `qa-${timer}`,
            });
          }
          await page.evaluate(
            ([key, value]) => window.localStorage.setItem(key, value),
            [THEME_KEY, envelope(stored)] as const,
          );
          await page.reload();
          await page.waitForLoadState("networkidle");
          await expect(readout(page)).toBeVisible();
        }
        await page.goto("/stats");
        await page.waitForLoadState("networkidle");
        expect(hydration, hydration.join("\n")).toEqual([]);
      });
    }
  }
});

test.describe("criterion 10: with system stored, the OS flip repaints live; with light or dark stored it does not", () => {
  test("system: OS flip repaints the page and the gauge without a reload", async ({ page }) => {
    await openThemed(page, { stored: "system", osDark: false, path: "/" });
    const lightGround = await readPainted(page, page.locator("body"));
    expect(lightGround.fill).toEqual([251, 244, 234]);
    expect(await htmlHasDark(page)).toBe(false);
    await expect(page.getByTestId("timer-gauge")).toHaveAttribute("data-liquid-color", "#d97706");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 2000 });
    await expect(page.getByTestId("timer-gauge")).toHaveAttribute("data-liquid-color", "#9d570d");
    const darkGround = await readPainted(page, page.locator("body"));
    expect(darkGround.fill).toEqual([28, 20, 14]);
  });

  for (const stored of ["light", "dark"] as const) {
    test(`${stored} stored: an OS flip does not move the theme`, async ({ page }) => {
      await openThemed(page, { stored, osDark: false });
      const before = await htmlHasDark(page);
      await page.emulateMedia({ colorScheme: before ? "light" : "dark" });
      await page.waitForTimeout(500);
      expect(await htmlHasDark(page)).toBe(before);
    });
  }
});

test.describe("criterion 47: the theme transition is off under prefers-reduced-motion", () => {
  // Matches `transition-property: all` as well as named colour properties. Before pass 4 the regex had
  // no `all`, so Tailwind v4's `transition-all` (literal computed value "all") could never be flagged.
  function scanForColourTransitions(): string[] {
    const COLOR_PROPS = /\ball\b|color|background|border|fill|stroke|outline|box-shadow/;
    const hits: string[] = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const durations = cs.transitionDuration.split(",").map((d) => parseFloat(d));
      const props = cs.transitionProperty;
      if (durations.some((d) => d > 0) && COLOR_PROPS.test(props)) {
        hits.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 2).join(".")} ${props} ${cs.transitionDuration}`);
      }
    }
    return hits;
  }

  function scan(page: Page): Promise<string[]> {
    return page.evaluate(scanForColourTransitions);
  }

  test("positive control: the scan flags a non-zero transition-property: all under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await openThemed(page, { stored: "light", osDark: false });
    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.id = "qa-all-probe";
      probe.style.transition = "all 0.15s";
      document.body.appendChild(probe);
    });
    const hits = await scan(page);
    expect(hits.some((h) => h.includes("qa-all-probe")), "scan must see transition: all").toBe(true);
    await page.evaluate(() => document.getElementById("qa-all-probe")?.remove());
  });

  test("no element that repaints on a theme change has a non-zero transition under reduced motion, on /, in the task dialog, and on /stats", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await openThemed(page, { stored: "light", osDark: false });
    expect(await scan(page), "/ idle").toEqual([]);

    // The colour swatch lives in the task form inside the dialog, so the scan must open it.
    await openTaskList(page);
    const dialog = page.getByRole("dialog", { name: "Your tasks", exact: true });
    await expect(dialog.locator('input[type="radio"]').first()).toBeAttached();
    expect(await scan(page), "/ with the task dialog open (includes swatches)").toEqual([]);
    await closeTaskList(page);

    await page.goto("/stats");
    await page.waitForLoadState("networkidle");
    expect(await scan(page), "/stats").toEqual([]);
  });

  test("reduced motion: the primary Start button's theme flip has zero transitions; default motion still animates it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await openThemed(page, { stored: "light", osDark: false });
    const start = page.getByRole("button", { name: "Start", exact: true });
    await themeLabel(page, "Dark").click();
    const reduced = await start.evaluate((el) => el.getAnimations().filter((a) => a instanceof CSSTransition).length);
    expect(reduced, "Start: transitions started by the flip under reduced motion").toBe(0);
    const dur = await start.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(dur.split(",").every((d) => parseFloat(d) === 0), `Start transition-duration ${dur}`).toBe(true);

    await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
    await openThemed(page, { stored: "light", osDark: false });
    const startDefault = page.getByRole("button", { name: "Start", exact: true });
    await themeLabel(page, "Dark").click();
    const normal = await startDefault.evaluate((el) => el.getAnimations().filter((a) => a instanceof CSSTransition).length);
    expect(normal, "Start: default motion animates the flip (not vacuous)").toBeGreaterThan(0);
  });
});

test.describe("criterion 38: layout at 320 and 1280 px, recorded for comparison against HEAD", () => {
  for (const [label, viewport] of [
    ["320", NARROW],
    ["1280", DESKTOP],
  ] as const) {
    test(`${label} px: wordmark, header height and main column are recorded`, async ({ page }, testInfo) => {
      await openThemed(page, { stored: "light", osDark: false, viewport });
      const wordmark = await page.getByRole("heading", { level: 1, name: "pomotato", exact: true }).boundingBox();
      const main = await page.locator("main").first().boundingBox();
      const gauge = await page.getByTestId("timer-gauge").boundingBox();
      const layout = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        const header = h1?.closest("div.w-full") ?? h1?.parentElement?.parentElement ?? null;
        return {
          headerHeight: header ? Math.round(header.getBoundingClientRect().height) : -1,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      const summary = JSON.stringify({
        wordmark: wordmark && { x: Math.round(wordmark.x), y: Math.round(wordmark.y), w: Math.round(wordmark.width), h: Math.round(wordmark.height) },
        main: main && { x: Math.round(main.x), y: Math.round(main.y), w: Math.round(main.width) },
        gaugeTop: gauge && Math.round(gauge.y),
        ...layout,
      });
      testInfo.annotations.push({ type: "layout", description: `${label}px ${summary}` });
      expect(wordmark, "wordmark is rendered").not.toBeNull();
      expect(main, "main column is rendered").not.toBeNull();
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

      // Amended 2026-10-26 (criterion 38). Figures are the HEAD (67ace13) measurements from the
      // first QA pass. 1280 px: nothing moves. 320 px: the header wraps 40 -> 80 px, which is
      // accepted, and the gauge top is stated at 352 px (was 312 px).
      const expected =
        label === "320"
          ? { wordmark: { x: 16, y: 48, w: 164, h: 40 }, headerHeight: 80, gaugeTop: 352 }
          : { wordmark: { x: 48, y: 48, w: 164, h: 40 }, headerHeight: 40, gaugeTop: 240 };
      expect(wordmark, "wordmark box").not.toBeNull();
      const w = must(wordmark, "wordmark");
      expect(Math.abs(w.x - expected.wordmark.x), "wordmark x within 1 px").toBeLessThanOrEqual(1);
      expect(Math.abs(w.y - expected.wordmark.y), "wordmark y within 1 px").toBeLessThanOrEqual(1);
      expect(Math.abs(w.width - expected.wordmark.w), "wordmark width within 1 px").toBeLessThanOrEqual(1);
      expect(Math.abs(w.height - expected.wordmark.h), "wordmark height within 1 px").toBeLessThanOrEqual(1);
      expect(Math.abs(layout.headerHeight - expected.headerHeight), `header height ${layout.headerHeight}`).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.round(gauge?.y ?? -1) - expected.gaugeTop), `gauge top ${gauge?.y}`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("criterion 61: the timer survives a theme change mid-session", () => {
  test("a running timer keeps its remaining time across a theme change (no jump, still running)", async ({ page }) => {
    await openThemed(page, { stored: "light", osDark: false });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.waitForTimeout(1200);
    const before = await readout(page).textContent();
    const beforeState = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.state, TIMER_KEY);
    await themeLabel(page, "Dark").click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    const after = await readout(page).textContent();
    const afterState = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.state, TIMER_KEY);
    // The end timestamp is stored, so a theme change must not rewrite it.
    expect(afterState.endTimestamp).toBe(beforeState.endTimestamp);
    expect(afterState.status).toBe("running");
    // The readout moved only by the wall-clock time that passed, never jumped back or forward.
    const toSec = (t: string | null) => {
      const [m, s] = (t ?? "0:0").split(":").map(Number);
      return m * 60 + s;
    };
    const delta = toSec(before) - toSec(after);
    expect(delta, `readout ${before} -> ${after}`).toBeGreaterThanOrEqual(0);
    expect(delta, `readout ${before} -> ${after}`).toBeLessThanOrEqual(3);
  });
});
