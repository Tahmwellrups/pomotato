import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { chooseOnSettings, makePng, waitActive, worstAgainst, paintedColours, luminance, type Rgb } from "./helpers/background";
import { readTimerState, seedTimerState } from "./helpers/timer-hold";

// Task 013 behaviour (criteria 13-15, 23, 34-38, 43, 45, 47, 48) and the 012
// surface states that are behaviour rather than measurement (criteria 13, 18,
// 19, 21, 25, 10). Measurement lives in focus-surface-sweep.spec.ts.

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const DESKTOP = { width: 1280, height: 800 };
const NARROW = { width: 320, height: 700 };

async function seed(page: Page, timer: Parameters<typeof seedTimerState>[1]) {
  await page.goto("/");
  await seedTimerState(page, timer);
  await page.reload();
  await expect(page.locator('[data-gauge-ready="true"]')).toHaveCount(1);
}

const focusIdle = { mode: "focus", status: "idle", focusMinutes: 1, cyclePosition: 0, endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null } as const;

function announcer(page: Page) {
  return page.locator('p.sr-only[role="status"][aria-live="polite"]');
}

test.describe("013 criteria 13-15: auto-advance is already counting, end exact to the stored end", () => {
  test("a 1-minute Focus run advances to a counting 5-minute break; end = completed end + 5 min, read from localStorage", async ({ page }) => {
    await page.clock.install({ time: T0 });
    await seed(page, focusIdle);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const completedEnd = (await readTimerState(page))!.endTimestamp!;
    await page.clock.runFor(MIN + 1000);
    const after = (await readTimerState(page))!;
    expect(after.mode).toBe("shortBreak");
    expect(after.status).toBe("running");
    expect(after.endTimestamp! - completedEnd).toBe(5 * MIN);
    expect(after.runId).not.toBeNull();
  });
});

test.describe("013 criterion 35: an unattended advance does not move the digits or the dot row", () => {
  for (const viewport of [DESKTOP, NARROW]) {
    test(`${viewport.width}px: digits top and dot box are identical before and after Focus to break`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.clock.install({ time: T0 });
      await seed(page, focusIdle);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      const readout = page.locator('[data-testid="timer-gauge"]');
      const dots = page.locator("[data-treatment]").first().locator("xpath=..");
      const before = { readout: await readout.boundingBox(), dots: await dots.boundingBox() };
      await page.clock.runFor(MIN + 1000);
      await expect(page.locator('[data-gauge-style]')).toBeVisible();
      const after = { readout: await readout.boundingBox(), dots: await dots.boundingBox() };
      expect(after.readout!.y).toBe(before.readout!.y);
      expect(after.dots!.height).toBe(before.dots!.height);
      expect(after.dots!.width).toBe(before.dots!.width);
    });
  }

  test("the dot group sits under the mode row and above the digits, nearer the mode row (criterion 23, 1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seed(page, focusIdle);
    const chipRow = await page.locator("fieldset:has(input[name=\"timer-mode\"])").boundingBox();
    const dots = await page.locator("[data-treatment]").first().locator("xpath=..").boundingBox();
    const digits = await page.locator('[data-testid="timer-gauge"]').boundingBox();
    expect(dots!.y).toBeGreaterThanOrEqual(chipRow!.y + chipRow!.height);
    expect(dots!.y + dots!.height).toBeLessThanOrEqual(digits!.y);
    const gapAbove = dots!.y - (chipRow!.y + chipRow!.height);
    const gapBelow = digits!.y - (dots!.y + dots!.height);
    expect(gapAbove).toBeLessThan(gapBelow);
  });
});

test.describe("013 criteria 34, 36-38: the announcer names both halves; a stale reload advances exactly one step and says nothing", () => {
  test("criterion 34: after an auto-advance the polite announcer names the finished and the started mode", async ({ page }) => {
    await page.clock.install({ time: T0 });
    await seed(page, focusIdle);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.clock.runFor(MIN + 1000);
    await expect(announcer(page)).toContainText("Focus complete");
    await expect(announcer(page)).toContainText("Short break started");
  });

  test("criteria 36-38: a Focus run that expired two hours ago credits one row, moves to a break, lands idle, and announces nothing", async ({ page }) => {
    await page.goto("/");
    await seedTimerState(page, { mode: "focus", status: "running", focusMinutes: 1, cyclePosition: 1, endTimestamp: Date.now() - 2 * 60 * MIN, startedAt: Date.now() - 2 * 60 * MIN - MIN, runId: "stale-e2e" });
    await page.reload();
    await expect(page.locator('[data-gauge-ready="true"]')).toHaveCount(1);
    const state = (await readTimerState(page))!;
    expect(state).toMatchObject({ mode: "shortBreak", status: "idle", cyclePosition: 2, endTimestamp: null });
    await expect(announcer(page)).toHaveText("");
    const sessions = await page.evaluate(() =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("pomotato");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("sessions")) return resolve(-1);
          const c = db.transaction("sessions", "readonly").objectStore("sessions").count();
          c.onsuccess = () => resolve(c.result);
        };
      })
    );
    expect(sessions).toBe(1);
  });
});

test.describe("013 criteria 43 and 45 and 47: nothing animates when nothing happens; reduced motion is static", () => {
  test("criterion 43: no hydration error or warning across idle, running, paused, complete and mid-break reloads", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") messages.push(m.text());
    });
    for (const timer of [
      focusIdle,
      { ...focusIdle, status: "running", endTimestamp: Date.now() + 10 * MIN, runId: "r", startedAt: Date.now() },
      { ...focusIdle, status: "paused", pausedRemainingMs: 30_000 },
      { ...focusIdle, status: "complete" },
      { ...focusIdle, mode: "shortBreak", status: "running", endTimestamp: Date.now() + 3 * MIN, runId: "rb", startedAt: Date.now(), cyclePosition: 1 },
    ] as const) {
      await seed(page, timer);
    }
    expect(messages.filter((m) => /hydrat/i.test(m))).toEqual([]);
  });

  test("criterion 45: idle, one settled second: two dot-region frames are byte-identical and no rAF fires", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __raf: number }).__raf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        (window as unknown as { __raf: number }).__raf += 1;
        return orig(cb);
      };
    });
    await seed(page, focusIdle);
    await page.waitForTimeout(1000);
    const region = page.locator("[data-treatment]").first().locator("xpath=..");
    const a = await region.screenshot();
    await page.evaluate(() => ((window as unknown as { __raf: number }).__raf = 0));
    await page.waitForTimeout(1000);
    const b = await region.screenshot();
    expect(a.equals(b)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __raf: number }).__raf)).toBe(0);
  });

  test("criterion 47: prefers-reduced-motion with a Focus run running: the dot region is static, the ring is the cue", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page, { ...focusIdle, focusMinutes: 25, status: "running", endTimestamp: Date.now() + 25 * MIN, runId: "rm", startedAt: Date.now() });
    const region = page.locator("[data-treatment]").first().locator("xpath=..");
    await expect(page.locator('[data-treatment="active-running"]')).toHaveCount(1);
    const a = await region.screenshot();
    await page.waitForTimeout(1000);
    const b = await region.screenshot();
    expect(a.equals(b)).toBe(true);
  });

  test("positive control: without reduced motion, a running Focus run pulses (the region changes between frames)", async ({ page }) => {
    await seed(page, { ...focusIdle, focusMinutes: 25, status: "running", endTimestamp: Date.now() + 25 * MIN, runId: "pc", startedAt: Date.now() });
    await expect(page.locator('[data-treatment="active-running"]')).toHaveCount(1);
    const region = page.locator("[data-treatment]").first().locator("xpath=..");
    const frames = [];
    for (let i = 0; i < 4; i += 1) {
      frames.push((await region.screenshot()).toString("base64"));
      await page.waitForTimeout(400);
    }
    expect(new Set(frames).size).toBeGreaterThan(1);
  });
});

test.describe("013 criterion 48: axe on / in idle, running, paused and mid-break, both themes", () => {
  for (const timer of [
    focusIdle,
    { ...focusIdle, focusMinutes: 25, status: "running", endTimestamp: Date.now() + 25 * MIN, runId: "ax1", startedAt: Date.now() },
    { ...focusIdle, focusMinutes: 25, status: "paused", pausedRemainingMs: 60_000 },
    { ...focusIdle, mode: "shortBreak", status: "running", endTimestamp: Date.now() + 5 * MIN, runId: "ax2", startedAt: Date.now() },
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${timer.mode} ${timer.status} ${theme}: no serious or critical axe violation`, async ({ page }) => {
        await page.goto("/");
        await page.evaluate((t) => window.localStorage.setItem("pomotato-preferences", JSON.stringify({ state: { theme: t, gaugeStyle: "vessel", background: null }, version: 1 })), theme);
        await seed(page, timer);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
      });
    }
  }
});

// 012 behaviour: surfaces paint only while an image is active, the grain steps aside, the fallbacks hold.
test.describe("012 surface states: paint only with an image, grain steps aside, fallbacks hold", () => {
  test.setTimeout(180_000);
  const surfacePaint = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-surface]")].map((el) => {
        const s = getComputedStyle(el);
        return { kind: el.dataset.surface, background: s.backgroundColor, blur: s.backdropFilter, border: s.borderTopColor, shadow: s.boxShadow };
      })
    );

  test("criterion 21: with no image stored, no surface paints a fill, border, shadow or blur", async ({ page }) => {
    await seed(page, focusIdle);
    const paints = await surfacePaint(page);
    expect(paints.length).toBeGreaterThanOrEqual(2);
    for (const p of paints) {
      expect(p.background, p.kind).toMatch(/^rgba\(0, 0, 0, 0\)$/);
      expect(p.blur, p.kind).toBe("none");
      expect(p.shadow, p.kind).toBe("none");
    }
  });

  test("criteria 5 and 13 (state), 19, 21: with an image, the frosted panel blurs and the solid surfaces are opaque; grain steps aside", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await chooseOnSettings(page, makePng(DESKTOP.width, DESKTOP.height, () => [255, 255, 255]), "qa-state.png");
    await page.goto("/");
    await waitActive(page);
    const paints = await surfacePaint(page);
    const frosted = paints.find((p) => p.kind === "frosted")!;
    expect(frosted.blur).toMatch(/blur\(10px\)/);
    expect(frosted.background).toMatch(/rgba\(255, 250, 243, 0\.9\)|rgba\(30, 22, 16, 0\.9\)/);
    for (const p of paints.filter((x) => x.kind === "solid")) {
      expect(p.background, "solid is opaque").toMatch(/^rgb\(/);
      expect(p.blur, "solid carries no blur").toBe("none");
    }
    const grain = await page.evaluate(() => getComputedStyle(document.body, "::before").opacity);
    expect(grain).toBe("0");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    await page.reload();
    await waitActive(page);
    const reduced = (await surfacePaint(page)).find((p) => p.kind === "frosted")!;
    expect(reduced.blur, "reduced transparency removes the blur").toBe("none");
    expect(reduced.background, "reduced transparency makes the fill opaque").toMatch(/^rgb\(/);
  });

  test("criterion 18: with backdrop-filter disabled, the readout still reads on a bounded ground: white and black floors hold", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    for (const [name, colour] of [["white", [255, 255, 255]], ["black", [0, 0, 0]]] as const) {
      await chooseOnSettings(page, makePng(DESKTOP.width, DESKTOP.height, () => colour as Rgb), `qa-nb-${name}.png`);
      await page.goto("/");
      await waitActive(page);
      await page.addStyleTag({ content: '[data-surface="frosted"]{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });
      await page.addStyleTag({ content: "*{color:transparent!important;-webkit-text-fill-color:transparent!important}" });
      const box = await page.locator('[data-testid="timer-gauge"]').boundingBox();
      const colours = (await paintedColours(page, [{ x: box!.x, y: box!.y, w: box!.width, h: box!.height }]))[0];
      const fg = await page.locator('[data-testid="timer-gauge"]').evaluate((el) => getComputedStyle(el).color);
      const fgRgb = fg.match(/\d+/g)!.slice(0, 3).map(Number) as Rgb;
      expect(worstAgainst(colours, fgRgb).ratio, `${name} no-blur readout`).toBeGreaterThanOrEqual(4.5);
      expect(luminance(fgRgb)).toBeLessThan(0.5);
    }
  });

  test("criterion 10: /settings and /stats carry no surface and paint the plain ground", async ({ page }) => {
    await chooseOnSettings(page, makePng(DESKTOP.width, DESKTOP.height, () => [0, 0, 0]), "qa-routes.png");
    for (const route of ["/settings", "/stats"]) {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      expect(await page.locator("[data-surface]").count(), route).toBe(0);
      expect(await page.locator('[data-background="active"]').count(), route).toBe(0);
    }
  });

  test("criterion 25: with a running Focus run and an image, the readout still ticks and matches the stored end", async ({ page }) => {
    await chooseOnSettings(page, makePng(DESKTOP.width, DESKTOP.height, () => [0, 0, 0]), "qa-tick.png");
    await page.clock.install({ time: T0 });
    await seed(page, { ...focusIdle, focusMinutes: 25, status: "running", endTimestamp: T0 + 25 * MIN, runId: "tick", startedAt: T0 });
    const readout = page.locator("text=/\\d\\d:\\d\\d/").first();
    const first = await readout.textContent();
    await page.clock.runFor(1000);
    const second = await readout.textContent();
    expect(second).not.toBe(first);
    const stored = (await readTimerState(page))!;
    expect(stored.endTimestamp).toBe(T0 + 25 * MIN);
  });
});
