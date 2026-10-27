import { expect, test, type Page } from "@playwright/test";
import {
  DESKTOP,
  NARROW,
  backgroundRowCount,
  junkJpeg,
  maxSizePng,
  pickImage,
  prefsRaw,
  setPrefs,
  statusLine,
  timerRaw,
  ADVERSARIAL,
  MAX_BYTES,
} from "./helpers/background";
import { seedTimerState } from "./helpers/timer-hold";

// Task 010 criteria 3, 7, 8, 9, 10, 11, 12, 29 (the control, the storage shape,
// rejections, the network, and the timer). Every image is generated in the test.

const WHITE = () => ADVERSARIAL.white();
const BLACK = () => ADVERSARIAL.black();

async function chooseOnSettings(page: Page, buffer: Buffer, name: string, mimeType = "image/png") {
  await page.goto("/settings");
  await pickImage(page, buffer, name, mimeType);
  await expect(statusLine(page)).toContainText(/is now your background|could not|not supported|too large|not be read|Animated|damaged/);
}

async function waitActive(page: Page) {
  await expect(page.locator('[data-background="active"]')).toHaveCount(1);
  await expect
    .poll(() => page.locator('[data-background="active"]').evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

test.describe("criterion 3: the bytes are not in localStorage", () => {
  test("one pomotato-preferences entry, under 1 KB growth, no data URL, no base64, state keys enumerated", async ({ page }) => {
    await page.goto("/settings");
    await setPrefs(page, { theme: "light" });
    await page.reload();
    const before = (await prefsRaw(page)) ?? "";
    await pickImage(page, WHITE(), "white.png");
    await expect(statusLine(page)).toContainText("is now your background");
    const after = (await prefsRaw(page)) ?? "";
    const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("pomotato")).sort());
    expect(keys).toEqual(["pomotato-preferences"]);
    expect(after.length - before.length).toBeLessThan(1024);
    expect(after).not.toMatch(/data:|base64|blob:|iVBOR/);
    const parsed = JSON.parse(after) as { state: Record<string, unknown>; version: number };
    expect(parsed.version).toBe(1);
    // Task 011 adds the mix key; the pinned key list gains it.
    expect(Object.keys(parsed.state).sort()).toEqual(["background", "gaugeStyle", "mix", "theme"]);
    expect(parsed.state.theme).toBe("light");
    expect(typeof parsed.state.background).toBe("string");
    // Measured figures for the QA Report.
    test.info().annotations.push({
      type: "measure",
      description: `criterion 3: preferences entry before=${before.length} B, after=${after.length} B, growth=${after.length - before.length} B; state keys=${Object.keys(parsed.state).join(",")}`,
    });
  });
});

test.describe("criterion 8: replace and remove are clean and survive reload and a second tab", () => {
  test("replace leaves one row; remove leaves zero rows and no dangling reference; both survive reload and a second tab", async ({ page, context }) => {
    await setPrefs(page, { theme: "light" });
    await chooseOnSettings(page, WHITE(), "a.png");
    expect(await backgroundRowCount(page)).toBe(1);
    const firstId = JSON.parse((await prefsRaw(page)) ?? "{}").state.background;
    await chooseOnSettings(page, BLACK(), "b.png");
    expect(await backgroundRowCount(page)).toBe(1);
    const secondId = JSON.parse((await prefsRaw(page)) ?? "{}").state.background;
    expect(secondId).not.toBe(firstId);

    await page.goto("/");
    await waitActive(page);
    await page.reload();
    await waitActive(page);
    const other = await context.newPage();
    await other.goto("/");
    await expect(other.locator('[data-background="active"]')).toHaveCount(1);
    await other.close();

    await page.goto("/settings");
    await page.getByRole("button", { name: "Remove background" }).click();
    await expect(statusLine(page)).toContainText("plain ground");
    expect(await backgroundRowCount(page)).toBe(0);
    expect(JSON.parse((await prefsRaw(page)) ?? "{}").state.background).toBeNull();
    await page.reload();
    expect(await backgroundRowCount(page)).toBe(0);
    await page.goto("/");
    await expect(page.locator("[data-background]")).toHaveCount(0);
  });
});

test.describe("criterion 7 and 11: a rejected pick writes nothing and leaves the previous state exactly as it was", () => {
  const rejections: [string, () => Buffer, string, string, RegExp][] = [
    ["oversize", () => Buffer.alloc(MAX_BYTES + 1, 0), "big.png", "image/png", /too large\. The limit is 5 MB/],
    ["text renamed .png", () => Buffer.from("not an image at all"), "notes.png", "image/png", /not supported/],
    ["SVG renamed .png", () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "vector.png", "image/png", /not supported/],
    ["junk JPEG (passes structure, will not decode)", junkJpeg, "junk.jpg", "image/jpeg", /could not be read as an image/],
    ["empty file", () => Buffer.alloc(0), "empty.png", "image/png", /empty/],
  ];

  for (const [label, make, name, mime, message] of rejections) {
    test(`${label}: message names the problem, row count and reference unchanged, focus stays on the picker`, async ({ page }) => {
      await setPrefs(page, { theme: "dark" });
      await chooseOnSettings(page, WHITE(), "keep.png");
      const rowsBefore = await backgroundRowCount(page);
      const prefBefore = await prefsRaw(page);
      await page.goto("/settings");
      await page.locator('input[type="file"]').focus();
      await pickImage(page, make(), name, mime);
      await expect(statusLine(page)).toHaveText(message);
      await expect(statusLine(page)).toHaveAttribute("role", "status");
      expect(await backgroundRowCount(page)).toBe(rowsBefore);
      expect(await prefsRaw(page)).toBe(prefBefore);
      await expect(page.locator('input[type="file"]')).toBeFocused();
    });
  }

  test("a rejection with no background set leaves zero rows and no reference", async ({ page }) => {
    await setPrefs(page, { theme: "system" });
    await chooseOnSettings(page, Buffer.from("nope"), "text.png");
    expect(await backgroundRowCount(page)).toBe(0);
    expect(JSON.parse((await prefsRaw(page)) ?? "{}").state.background).toBeNull();
  });
});

test.describe("criterion 9 and 10: one native picker, named, sized, focus-ringed; copy says what happens", () => {
  for (const [label, viewport] of [
    ["320 px", NARROW],
    ["1280 px", DESKTOP],
  ] as const) {
    test(`the picker is a real file input, at least 44x44, Tab-reachable in visual order at ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setPrefs(page, { theme: "light" });
      await page.goto("/settings");
      const input = page.getByLabel("Choose an image");
      await expect(input).toHaveAttribute("type", "file");
      await expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
      const label = page.locator('label:has(input[type="file"])');
      const box = await label.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Visual order: the picker follows the gauge radio group.
      const order = await page.evaluate(() => {
        const radios = document.querySelector('input[type="radio"]');
        const file = document.querySelector('input[type="file"]');
        return radios && file ? Boolean(radios.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
      });
      expect(order).toBe(true);
      // Keyboard: Tab walks to the picker.
      await page.locator("body").click({ position: { x: 1, y: 1 } });
      let reached = false;
      for (let i = 0; i < 60 && !reached; i += 1) {
        await page.keyboard.press("Tab");
        reached = await input.evaluate((el) => el === document.activeElement);
      }
      expect(reached).toBe(true);
      const ringOf = () =>
        label.locator("span").evaluate((el) => {
          const s = getComputedStyle(el);
          return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor };
        });
      await expect.poll(async () => (await ringOf()).color).toBe("rgb(180, 83, 9)");
      const ring = await ringOf();
      test.info().annotations.push({ type: "measure", description: `criterion 9 focus ring at ${label}: ${JSON.stringify(ring)}` });
      expect(ring.style).toBe("solid");
      expect(ring.width).toBe("2px");
      expect(ring.offset).toBe("2px");
      expect(ring.color).toBe("rgb(180, 83, 9)");
    });
  }

  test("the copy states type, limit, stays on this device, and the dim; there is no preview image", async ({ page }) => {
    await setPrefs(page, { theme: "light" });
    await page.goto("/settings");
    const help = (await page.locator("#background-help").textContent()) ?? "";
    expect(help).toContain("PNG, JPEG or WebP");
    expect(help).toContain("5 MB");
    expect(help).toContain("stays on this device and is never uploaded anywhere");
    expect(help).toContain("dimmed");
    const group = page.getByRole("group", { name: "Background image" });
    await expect(group.locator("img")).toHaveCount(0);
  });
});

test.describe("criterion 11 and 12: /settings holds no theme control; every control on it acts", () => {
  test("no input[name=theme] on /settings; every interactive element has an accessible name and none is disabled", async ({ page }) => {
    await setPrefs(page, { theme: "dark" });
    await chooseOnSettings(page, WHITE(), "a.png");
    await page.goto("/settings");
    await expect(page.locator('input[name="theme"]')).toHaveCount(0);
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [role]")].map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type"),
        name: (el.getAttribute("aria-label") ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "").trim().replace(/\s+/g, " "),
        disabled: (el as HTMLButtonElement).disabled === true,
      })),
    );
    test.info().annotations.push({ type: "measure", description: `criterion 12 interactive elements on /settings: ${JSON.stringify(controls)}` });
    expect(controls.filter((c) => c.disabled)).toEqual([]);
    expect(controls.filter((c) => c.name === "")).toEqual([]);
    expect(controls.some((c) => c.type === "file")).toBe(true);
  });

  test("forced colours: the checked gauge card gets a 3px edge and the unchecked stays 1px (008 R-1)", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await setPrefs(page, { theme: "light", gaugeStyle: "glyph" });
    await page.goto("/settings");
    const widths = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((input) => {
        const card = input.parentElement?.querySelector("span.rounded-lg") as HTMLElement | null;
        return { value: input.value, checked: input.checked, width: card ? getComputedStyle(card).borderTopWidth : null };
      }),
    );
    test.info().annotations.push({ type: "measure", description: `criterion 11 forced-colours card borders: ${JSON.stringify(widths)}` });
    const checked = widths.find((w) => w.checked);
    const unchecked = widths.find((w) => !w.checked);
    expect(checked?.width).toBe("3px");
    expect(unchecked?.width).toBe("1px");
  });
});

test.describe("criterion 29: nothing leaves the device, and the timer does not notice", () => {
  test("no request carries a body during pick, reload, remove, and the flow works with the network blocked after load", async ({ page, context }) => {
    await setPrefs(page, { theme: "light" });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    const requests: { method: string; url: string; body: string | null }[] = [];
    page.on("request", (req) => requests.push({ method: req.method(), url: req.url(), body: req.postData() }));
    await pickImage(page, WHITE(), "net.png");
    await expect(statusLine(page)).toContainText("is now your background");
    await page.goto("/");
    await waitActive(page);
    await page.reload();
    await waitActive(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Remove background" }).click();
    await expect(statusLine(page)).toContainText("plain ground");
    // blob: URLs are the page's own object URLs for the decoded image, resolved in memory, not network.
    const external = requests.filter((r) => !r.url.startsWith("blob:") && !r.url.startsWith("http://localhost:3000"));
    expect(external).toEqual([]);
    expect(requests.filter((r) => r.body !== null)).toEqual([]);
    expect(requests.filter((r) => r.method !== "GET" && r.method !== "HEAD")).toEqual([]);
    test.info().annotations.push({ type: "measure", description: `criterion 29: ${requests.length} same-origin requests during pick, reload and remove; none with a body` });

    // The network blocked after load: pick and remove still succeed (the reload is excluded, see the QA Report).
    await context.setOffline(true);
    await pickImage(page, BLACK(), "offline.png");
    await expect(statusLine(page)).toContainText("is now your background");
    await page.getByRole("button", { name: "Remove background" }).click();
    await expect(statusLine(page)).toContainText("plain ground");
    await context.setOffline(false);
  });

  for (const state of ["running", "paused"] as const) {
    test(`timer ${state}: persisted timer fields are byte-identical across pick and remove of a maximum-size image, and mm:ss tracks the end timestamp`, async ({ page }) => {
      await setPrefs(page, { theme: "dark" });
      await page.goto("/");
      const endTimestamp = Date.now() + 10 * 60 * 1000;
      const overrides =
        state === "running"
          ? { status: "running" as const, endTimestamp, pausedRemainingMs: null, runId: "qa-run-1", startedAt: Date.now() - 1000 }
          : { status: "paused" as const, endTimestamp: null, pausedRemainingMs: 7 * 60 * 1000, runId: "qa-run-2", startedAt: Date.now() - 1000 };
      await seedTimerState(page, overrides);
      await page.reload();
      const fields = async () => {
        const raw = JSON.parse((await timerRaw(page)) ?? "{}").state ?? {};
        return [raw.status, raw.endTimestamp, raw.pausedRemainingMs, raw.runId];
      };
      const before = await fields();
      await chooseOnSettings(page, maxSizePng(), "max.png");
      expect(await fields()).toEqual(before);
      await page.goto("/");
      await waitActive(page);
      await page.waitForTimeout(1200);
      const samples: { shown: string; stamp: number; end: number | null; remaining: number | null }[] = [];
      const readout = page.locator("p.tabular-nums").first();
      const stateNow = async () => JSON.parse((await timerRaw(page)) ?? "{}").state ?? {};
      for (let i = 0; i < 3; i += 1) {
        const shown = (await readout.textContent()) ?? "";
        const st = await stateNow();
        samples.push({ shown, stamp: Date.now(), end: st.endTimestamp ?? null, remaining: st.pausedRemainingMs ?? null });
        await page.waitForTimeout(1100);
      }
      const seconds = (text: string) => {
        const [m, s] = text.split(":").map(Number);
        return m * 60 + s;
      };
      if (state === "running") {
        const distinct = new Set(samples.map((s) => s.shown));
        expect(distinct.size).toBeGreaterThanOrEqual(2);
        for (const sample of samples) {
          const expected = Math.ceil(((sample.end ?? 0) - sample.stamp) / 1000);
          expect(Math.abs(seconds(sample.shown) - expected)).toBeLessThanOrEqual(2);
        }
      } else {
        for (const sample of samples) expect(seconds(sample.shown)).toBe(Math.round((sample.remaining ?? 0) / 1000));
      }
      await chooseOnSettings(page, WHITE(), "small.png");
      expect(await fields()).toEqual(before);
      await page.goto("/settings");
      await page.getByRole("button", { name: "Remove background" }).click();
      expect(await fields()).toEqual(before);
      test.info().annotations.push({ type: "measure", description: `criterion 29 ${state}: samples ${JSON.stringify(samples)}` });
      expect(MAX_BYTES).toBe(5242880);
    });
  }
});
