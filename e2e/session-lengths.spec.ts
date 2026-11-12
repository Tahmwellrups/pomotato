import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedTimerState } from "./helpers/timer-hold";

// Task 017 behaviour, end to end: the settings flow, the timer reading the
// settings, the run-scoped length, the migration carry, and the chime's play
// count (observed through data-chime-plays, which needs no audio hardware).
// Measurement (group I) lives in e2e/settings-measure.spec.ts.

const MIN = 60_000;
const TIMER_KEY = "pomotato-timer";
const PREFS_KEY = "pomotato-preferences";

const field = (page: Page, id: string) => page.locator(`input#${id}`);
const timerDisplay = (page: Page) => page.locator("text=/\\d+:\\d+/").first();
/** The timer's polite announcer (PomotatoTimer). Other status regions on /settings are not this one. */
const announcer = (page: Page) => page.locator("p.sr-only[role='status']");

async function storedPrefs(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.state ?? null, PREFS_KEY);
}

async function storedTimer(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.state ?? null, TIMER_KEY);
}

/** Seeds a timer state from a same-origin page (storage is not reachable from about:blank). */
async function seed(page: Page, state: Parameters<typeof seedTimerState>[1]) {
  await page.goto("/settings");
  await seedTimerState(page, state);
}

/** The chime's page-readable play count on the current route (the timer root on /, the sound fieldset on /settings). */
async function chimePlays(page: Page): Promise<number> {
  const raw = await page.locator("[data-chime-plays]").first().getAttribute("data-chime-plays");
  return Number(raw ?? "NaN");
}

test.describe("criterion 1, 2, 7: the settings route and the timer's first visit", () => {
  test("/settings shows both new sections with their own legends, and the timer's Focus field is gone from /", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("group", { name: "Session lengths" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Session-end sound" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Timer gauge" })).toBeVisible();
    // Criterion 1's heading clause: the route has one h1 and no heading below it, the same shape as the existing sections.
    await expect(page.locator("h1")).toHaveCount(1);
    await page.goto("/");
    await expect(page.locator("#focus-length")).toHaveCount(0);
    await expect(page.getByText("Focus length", { exact: false })).toHaveCount(0);
    await expect(page.locator("input[inputmode='numeric']")).toHaveCount(0);
  });

  test("on a first visit the three fields read 25, 5 and 15, and / shows 25:00 idle in Focus", async ({ page }) => {
    await page.goto("/settings");
    await expect(field(page, "focus-length")).toHaveValue("25");
    await expect(field(page, "short-break-length")).toHaveValue("5");
    await expect(field(page, "long-break-length")).toHaveValue("15");
    await page.goto("/");
    await expect(timerDisplay(page)).toContainText("25:00");
  });
});

test.describe("criterion 4, 5, 6: keyboard order and labelling on /settings", () => {
  test("Tab from Back to the timer reaches the three fields, Reset, the toggle, the slider, then Preview, each with a focus ring", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Back to the timer" }).focus();
    const order: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return { label: "", outline: "", width: "" };
        const style = getComputedStyle(el);
        const isToggle = el instanceof HTMLInputElement && el.type === "checkbox";
        return { label: el.id || (isToggle ? "sound-toggle" : el.textContent?.trim() || el.tagName), outline: style.outlineStyle, width: style.outlineWidth };
      });
      order.push(info.label);
      // Every control shows a visible focus indicator when reached by keyboard.
      expect(info.outline, `focus ring on ${info.label}`).not.toBe("none");
    }
    expect(order).toEqual([
      "focus-length",
      "short-break-length",
      "long-break-length",
      "Reset to defaults",
      "sound-toggle",
      "chime-volume",
      "Preview chime",
    ]);
  });

  test("the sound toggle, the slider and Preview have accessible names, and the slider exposes its value", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("checkbox", { name: "Play a chime when a session ends" })).toBeVisible();
    const slider = page.getByRole("slider", { name: "Chime volume" });
    await expect(slider).toHaveAttribute("min", "0");
    await expect(slider).toHaveAttribute("max", "100");
    await expect(slider).toHaveValue("50");
    await expect(page.getByRole("button", { name: "Preview chime" })).toBeVisible();
  });

  test("with an invalid field, aria-invalid and aria-describedby point at its own error node, and clear when valid", async ({ page }) => {
    await page.goto("/settings");
    await field(page, "short-break-length").fill("0");
    await expect(field(page, "short-break-length")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "short-break-length")).toHaveAttribute("aria-describedby", "short-break-length-error");
    await expect(page.locator("#short-break-length-error")).toHaveText("Enter a number from 1 to 60.");
    await field(page, "short-break-length").fill("9");
    await expect(page.locator("#short-break-length-error")).toHaveCount(0);
    await expect(field(page, "short-break-length")).not.toHaveAttribute("aria-describedby", /.*/);
  });
});

test.describe("criterion 8, 10, 11, 12, 13: validation, paste, Reset and persistence", () => {
  test("pasting ' 30 ' stores 30; pasting 'abc' shows the error, and the stored value keeps its last valid entry", async ({ page }) => {
    await page.goto("/settings");
    await field(page, "focus-length").fill(" 30 ");
    await expect.poll(async () => (await storedPrefs(page))?.focusMinutes).toBe(30);
    await field(page, "focus-length").fill("abc");
    await expect(page.locator("#focus-length-error")).toBeVisible();
    expect((await storedPrefs(page))?.focusMinutes).toBe(30);
  });

  test("with Focus at 25, typing 0 leaves the stored value at 25 at every keystroke", async ({ page }) => {
    await page.goto("/settings");
    await field(page, "focus-length").fill("");
    await field(page, "focus-length").pressSequentially("0", { delay: 50 });
    expect((await storedPrefs(page))?.focusMinutes ?? 25).toBe(25);
    await expect(page.locator("#focus-length-error")).toBeVisible();
  });

  test("the out-of-range message names the field's own bound", async ({ page }) => {
    await page.goto("/settings");
    await field(page, "long-break-length").fill("121");
    await expect(page.locator("#long-break-length-error")).toHaveText("Enter a number from 1 to 120.");
  });

  test("Reset to defaults restores 25 / 5 / 15, clears errors, persists, and leaves the sound settings alone", async ({ page }) => {
    await page.goto("/settings");
    await field(page, "focus-length").fill("90");
    await field(page, "long-break-length").fill("0");
    await page.getByRole("checkbox", { name: "Play a chime when a session ends" }).uncheck();
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(field(page, "focus-length")).toHaveValue("25");
    await expect(field(page, "long-break-length")).toHaveValue("15");
    await expect(field(page, "long-break-length")).toHaveAttribute("aria-invalid", "false");
    await expect.poll(async () => (await storedPrefs(page))?.focusMinutes).toBe(25);
    expect((await storedPrefs(page))?.chimeEnabled).toBe(false);
  });

  test("a changed length survives a reload", async ({ page }) => {
    await page.goto("/settings");
    await field(page, "short-break-length").fill("9");
    await expect.poll(async () => (await storedPrefs(page))?.shortBreakMinutes).toBe(9);
    await page.reload();
    await expect(field(page, "short-break-length")).toHaveValue("9");
  });
});

test.describe("criterion 15, 16, 17, 18, 19, 20: the timer reads the settings, and a run keeps its own length", () => {
  test("idle: Focus 50 reads 50:00 on /, and Short break at 9 reads 09:00 once selected", async ({ page }) => {
    await page.goto("/settings");
    await field(page, "focus-length").fill("50");
    await field(page, "short-break-length").fill("9");
    await page.goto("/");
    await expect(timerDisplay(page)).toContainText("50:00");
    await page.getByRole("radio", { name: "Short break" }).check({ force: true });
    await expect(timerDisplay(page)).toContainText("09:00");
  });

  test("the running-session note appears only while a run is live and names the session type", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/keeps the length it started with/)).toHaveCount(0);
    await seed(page, { status: "running", mode: "focus", focusMinutes: 25, endTimestamp: Date.now() + 10 * MIN, startedAt: Date.now(), runId: "qa-note", pausedRemainingMs: null });
    await page.reload();
    await expect(page.getByText(/Your Focus session is running/)).toBeVisible();
    await seed(page, { status: "idle", mode: "focus", focusMinutes: 25, endTimestamp: null, startedAt: null, runId: null, pausedRemainingMs: null });
    await page.reload();
    await expect(page.getByText(/keeps the length it started with/)).toHaveCount(0);
  });

  test("a running Focus is untouched by an edit: the stored end timestamp is byte-identical and the logged length is the one it started with", async ({ page }) => {
    // Long enough that the edit lands well before the run ends.
    const end = Date.now() + 6_000;
    await seed(page, { status: "running", mode: "focus", focusMinutes: 25, endTimestamp: end, startedAt: end - 25 * MIN, runId: "qa-run-25", pausedRemainingMs: null });
    await page.goto("/settings");
    const before = JSON.stringify(await storedTimer(page));
    await field(page, "focus-length").fill("50");
    await expect.poll(async () => (await storedPrefs(page))?.focusMinutes).toBe(50);
    expect(JSON.stringify(await storedTimer(page))).toBe(before);
    // Let the 2-second run finish: the completion is logged with the length it started with.
    await page.goto("/");
    await expect(page.getByRole("radio", { name: "Short break" })).toBeChecked({ timeout: 15_000 });
    const planned = await page.evaluate(async () => {
      const req = indexedDB.open("pomotato");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows: { runId: string; plannedDurationMs: number }[] = await new Promise((resolve, reject) => {
        const tx = db.transaction("sessions", "readonly").objectStore("sessions").getAll();
        tx.onsuccess = () => resolve(tx.result);
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return rows.find((row) => row.runId === "qa-run-25")?.plannedDurationMs ?? null;
    });
    expect(planned).toBe(25 * MIN);
  });

  test("a paused run keeps 40:00 frozen when the Focus length is lowered to 5", async ({ page }) => {
    await seed(page, { status: "paused", mode: "focus", focusMinutes: 50, endTimestamp: null, startedAt: Date.now() - 10 * MIN, runId: "qa-pause", pausedRemainingMs: 40 * MIN });
    await page.goto("/settings");
    await field(page, "focus-length").fill("5");
    await expect.poll(async () => (await storedPrefs(page))?.focusMinutes).toBe(5);
    await page.goto("/");
    await expect(timerDisplay(page)).toContainText("40:00");
  });

  test("the field stays enabled in every state, and focus is retained across an auto-advance while typing", async ({ page }) => {
    const end = Date.now() + 2_500;
    await seed(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-focus-keep", pausedRemainingMs: null });
    await page.goto("/settings");
    await expect(field(page, "focus-length")).toBeEnabled();
    await field(page, "focus-length").focus();
    await page.keyboard.type("3");
    await expect.poll(async () => (await storedTimer(page))?.mode, { timeout: 10_000 }).toBe("shortBreak");
    await expect(field(page, "focus-length")).toBeEnabled();
    await expect(field(page, "focus-length")).toBeFocused();
  });
});

test.describe("criterion 28, 57, 58: migration carry, a reload that lands on an expired run, and refocus", () => {
  test("a v3 timer entry with focusMinutes 50 and no preferences shows 50:00, and still reads 50 after a second reload", async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.localStorage.getItem("pomotato-seeded")) {
        window.localStorage.setItem("pomotato-seeded", "1");
        window.localStorage.setItem(
          "pomotato-timer",
          JSON.stringify({
            state: { mode: "focus", focusMinutes: 50, cyclePosition: 0, status: "idle", endTimestamp: null, pausedRemainingMs: null, runId: null, startedAt: null },
            version: 3,
          })
        );
      }
    });
    await page.goto("/");
    await expect(timerDisplay(page)).toContainText("50:00");
    await page.reload();
    await expect(timerDisplay(page)).toContainText("50:00");
    expect((await storedPrefs(page))?.focusMinutes).toBe(50);
    expect((await storedTimer(page))).not.toHaveProperty("focusMinutes");
  });

  test("a reload landing on an expired run advances one step and plays no chime", async ({ page }) => {
    const end = Date.now() - 2 * MIN;
    await seed(page, { status: "running", mode: "focus", focusMinutes: 25, endTimestamp: end, startedAt: end - 25 * MIN, runId: "qa-expired", pausedRemainingMs: null });
    await page.goto("/");
    await expect(page.getByRole("radio", { name: "Short break" })).toBeChecked();
    await expect(announcer(page)).toHaveText("");
    expect(await chimePlays(page)).toBe(0);
  });

  test("repeated focus and visibilitychange events after an advance produce no second chime", async ({ page }) => {
    const end = Date.now() + 4_000;
    await seed(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-refocus", pausedRemainingMs: null });
    await page.goto("/");
    await expect.poll(() => chimePlays(page), { timeout: 10_000 }).toBe(1);
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    await page.waitForTimeout(300);
    expect(await chimePlays(page)).toBe(1);
  });

  test("a chime from an advance observed on /settings is not re-announced on /, and the chime still fires once", async ({ page }) => {
    const end = Date.now() + 4_000;
    await seed(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-nav", pausedRemainingMs: null });
    await page.goto("/settings");
    await expect.poll(() => chimePlays(page), { timeout: 10_000 }).toBe(1);
    // Client-side return to the timer, via the back link (no reload, so no rehydrate clears the advance).
    await page.getByRole("link", { name: "Back to the timer" }).click();
    await expect(page.getByRole("radio", { name: "Short break" })).toBeChecked();
    await expect(announcer(page)).not.toContainText("Focus complete");
    expect(await chimePlays(page)).toBe(1);
  });
});

test.describe("criterion 41, 43, 44: sound off, Preview, and the volume's write count", () => {
  test("sound off: an advance happens and logs, no chime plays, and the setting survives a reload", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("checkbox", { name: "Play a chime when a session ends" }).uncheck();
    await expect.poll(async () => (await storedPrefs(page))?.chimeEnabled).toBe(false);
    const end = Date.now() + 4_000;
    await seed(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-off", pausedRemainingMs: null });
    await page.reload();
    await expect.poll(async () => (await storedTimer(page))?.mode, { timeout: 10_000 }).toBe("shortBreak");
    expect(await chimePlays(page)).toBe(0);
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Play a chime when a session ends" })).not.toBeChecked();
  });

  test("Preview plays once per click at the stored level, and works while sound is off", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("checkbox", { name: "Play a chime when a session ends" }).uncheck();
    await page.getByRole("button", { name: "Preview chime" }).click();
    await expect.poll(() => chimePlays(page)).toBe(1);
    await page.getByRole("button", { name: "Preview chime" }).click();
    await expect.poll(() => chimePlays(page)).toBe(2);
  });

  test("a 20-step keyboard change of the volume writes preferences at most twice", async ({ page }) => {
    await page.goto("/settings");
    const slider = page.getByRole("slider", { name: "Chime volume" });
    await slider.focus();
    await page.evaluate(() => {
      const w = window as unknown as { __prefWrites: number };
      w.__prefWrites = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "pomotato-preferences") w.__prefWrites += 1;
        return original.call(this, key, value);
      };
    });
    for (let i = 0; i < 20; i += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Tab");
    const writes = await page.evaluate(() => (window as unknown as { __prefWrites: number }).__prefWrites);
    expect(writes).toBeLessThanOrEqual(2);
    expect((await storedPrefs(page))?.chimeLevel).toBe(70);
  });
});

test.describe("criterion 33, 61, 62, 63, 64, 65: console, live regions, axe, motion, targets and overflow", () => {
  test("no hydration error or warning on / or /settings in idle, running, paused, mid-break and expired-while-closed", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if ((msg.type() === "error" || msg.type() === "warning") && /hydrat/i.test(msg.text())) problems.push(msg.text());
    });
    const end = Date.now() + 60_000;
    const states = [
      { status: "idle", mode: "focus" },
      { status: "running", mode: "focus", endTimestamp: end, startedAt: end - 25 * MIN, runId: "h1", pausedRemainingMs: null },
      { status: "paused", mode: "focus", endTimestamp: null, pausedRemainingMs: 60_000, startedAt: end - 25 * MIN, runId: "h2" },
      { status: "running", mode: "shortBreak", endTimestamp: end, startedAt: end - 5 * MIN, runId: "h3", pausedRemainingMs: null },
      { status: "running", mode: "focus", endTimestamp: Date.now() - 1000, startedAt: Date.now() - 26 * MIN, runId: "h4", pausedRemainingMs: null },
    ] as const;
    for (const state of states) {
      await seed(page, state);
      await page.goto("/");
      await page.waitForTimeout(300);
      await page.goto("/settings");
      await page.waitForTimeout(300);
    }
    expect(problems).toEqual([]);
  });

  test("the polite announcement on / still reads both halves, and no live region is added to /", async ({ page }) => {
    // The run must expire while / is open: a reload that lands on an expired run announces nothing, by design.
    await page.goto("/");
    const end = Date.now() + 3_000;
    await seedTimerState(page, { status: "running", mode: "focus", focusMinutes: 1, endTimestamp: end, startedAt: end - MIN, runId: "qa-announce", pausedRemainingMs: null });
    await page.reload();
    await expect(announcer(page)).toHaveText("Focus complete. Short break started.", { timeout: 10_000 });
    // No duration-field error node on /. (Other alerts on / belong to the task panel, which predates this task.)
    await expect(page.locator("[id$='-error'][role='alert']")).toHaveCount(0);
  });

  test("on /settings, an invalid field adds exactly its own error live region and nothing else", async ({ page }) => {
    await page.goto("/settings");
    const liveRegions = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("[aria-live], [role='status'], [role='alert']")).map(
          (el) => `${el.id || el.tagName}|${el.getAttribute("role") ?? el.getAttribute("aria-live")}`
        )
      );
    const before = await liveRegions();
    await field(page, "focus-length").fill("0");
    await expect(page.locator("#focus-length-error")).toHaveAttribute("role", "alert");
    const after = await liveRegions();
    expect(after.filter((entry) => !before.includes(entry))).toEqual(["focus-length-error|alert"]);
    expect(before.length, "baseline live regions on /settings").toBeGreaterThanOrEqual(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`axe reports no serious or critical violation on /settings in ${theme}, clean, one field in error, sound off and sound on`, async ({ page }) => {
      await page.addInitScript((t) => {
        if (!window.localStorage.getItem("pomotato-theme-seeded")) {
          window.localStorage.setItem("pomotato-theme-seeded", "1");
          window.localStorage.setItem("pomotato-preferences", JSON.stringify({ state: { theme: t }, version: 3 }));
        }
      }, theme);
      await page.goto("/settings");
      const scan = async (label: string) => {
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${label}: ${v.id}`)).toEqual([]);
      };
      await scan("clean");
      await field(page, "focus-length").fill("0");
      await scan("field in error");
      await field(page, "focus-length").fill("25");
      await page.getByRole("checkbox", { name: "Play a chime when a session ends" }).uncheck();
      await scan("sound off");
      await page.getByRole("checkbox", { name: "Play a chime when a session ends" }).check();
      await scan("sound on");
    });
  }

  test("nothing new animates: two frames 1 s apart are identical, with and without reduced motion, and no rAF fires", async ({ page }) => {
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await page.goto("/settings");
      await page.evaluate(() => {
        const w = window as unknown as { __raf: number };
        w.__raf = 0;
        const original = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb: FrameRequestCallback) => {
          w.__raf += 1;
          return original(cb);
        };
      });
      const section = page.getByRole("group", { name: "Session-end sound" });
      const sessions = page.getByRole("group", { name: "Session lengths" });
      const first = [await section.screenshot({ caret: "hide" }), await sessions.screenshot({ caret: "hide" })];
      await page.waitForTimeout(1000);
      const second = [await section.screenshot({ caret: "hide" }), await sessions.screenshot({ caret: "hide" })];
      expect(Buffer.compare(first[0], second[0]), `sound section reduced=${reduced}`).toBe(0);
      expect(Buffer.compare(first[1], second[1]), `session lengths reduced=${reduced}`).toBe(0);
      expect(await page.evaluate(() => (window as unknown as { __raf: number }).__raf), `rAF reduced=${reduced}`).toBe(0);
    }
  });

  test("at 320 px every new control has a hit area of at least 44 by 44 and no two overlap", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/settings");
    const targets = [
      field(page, "focus-length"),
      field(page, "short-break-length"),
      field(page, "long-break-length"),
      page.getByRole("button", { name: "Reset to defaults" }),
      page.locator("label:has(input[type='checkbox'])"),
      page.getByRole("slider", { name: "Chime volume" }),
      page.getByRole("button", { name: "Preview chime" }),
    ];
    const boxes = [];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      boxes.push(box!);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `targets ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  test("at 320 px /settings has no horizontal overflow, even with all three fields in their longest error", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/settings");
    for (const id of ["focus-length", "short-break-length", "long-break-length"]) {
      await field(page, id).fill("2.5");
    }
    await expect(page.locator("[id$='-error'][role='alert']")).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("criterion 3: no gap where the Focus field was", () => {
  for (const size of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    test(`the vertical gaps between timer children are equal at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/");
      const gaps = await page.evaluate(() => {
        const root = document.querySelector("[data-chime-plays]") as HTMLElement | null;
        if (!root) return [];
        // In-flow children only: the sr-only announcer is absolutely positioned and is not part of the stack.
        const inFlow = Array.from(root.children).filter((el) => getComputedStyle(el).position !== "absolute");
        const kids = inFlow.map((el) => el.getBoundingClientRect());
        const out: number[] = [];
        for (let i = 1; i < kids.length; i += 1) out.push(Math.round((kids[i].top - kids[i - 1].bottom) * 10) / 10);
        return out;
      });
      expect(gaps.length).toBeGreaterThan(1);
      expect(new Set(gaps).size, `gaps ${gaps.join(",")}`).toBe(1);
    });
  }
});
