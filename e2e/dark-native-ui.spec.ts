import { expect, test, type Page } from "@playwright/test";
import { openTaskList, closeTaskList } from "./helpers/task-list-dialog";
import { DESKTOP, must, openThemed, pixelsAt, record, settle, type Preference } from "./helpers/dark";
import { contrast, readPainted, type Rgb } from "./helpers/painted";

// Task 009 criterion 22, native UA chrome. Kept in its own file because the scrollbar test needs
// `--hide-scrollbars` removed, and Playwright only accepts that at file top level.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

type Theme = "light" | "dark";
const THEMES: [Theme, Preference][] = [
  ["light", "light"],
  ["dark", "dark"],
];

function tag(theme: Theme, label: string) {
  return `[${theme}] ${label}`;
}

async function themed(page: Page, stored: Preference, path = "/") {
  await openThemed(page, { stored, osDark: false, viewport: DESKTOP, path });
  await settle(page);
}

// ---------------------------------------------------------------------------
// Criterion 22: the native UA chrome follows the theme. There are no number inputs in the app,
// so the spinner clause has nothing to paint; that is asserted, not assumed. Scrollbars are
// shown (Playwright's headless default hides them) and selection is painted.
// ---------------------------------------------------------------------------

test.describe("criterion 22: no number spinners exist; scrollbars and selection follow the theme", () => {
  for (const [theme, stored] of THEMES) {
    test(`[${theme}] no input[type=number] on /, the dialog, or /stats; color-scheme is ${theme}`, async ({ page }, testInfo) => {
      await themed(page, stored);
      const numberInputs = await page.locator('input[type="number"]').count();
      expect(numberInputs, "number inputs on /").toBe(0);
      await openTaskList(page);
      expect(await page.locator('input[type="number"]').count(), "number inputs in dialog").toBe(0);
      await closeTaskList(page);
      await page.goto("/stats");
      await settle(page);
      expect(await page.locator('input[type="number"]').count(), "number inputs on /stats").toBe(0);
      const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
      record(testInfo, tag(theme, `computed color-scheme on :root = ${scheme}`), 0, 0);
      expect(scheme).toBe(theme);
    });

    test(`[${theme}] a scrollbar on a scroll container paints with the theme (not a light smudge in dark)`, async ({ page }, testInfo) => {
      await themed(page, stored);
      await page.evaluate(() => {
        const box = document.createElement("div");
        box.id = "qa-scroll";
        box.style.cssText = "position:fixed;top:0;left:0;width:120px;height:120px;overflow:auto;z-index:2147483647;background:var(--background)";
        box.innerHTML = '<div style="height:600px;width:10px"></div>';
        document.body.appendChild(box);
      });
      await settle(page);
      const box = must(await page.locator("#qa-scroll").boundingBox(), "scroll box");
      // Track sits in the right-hand scrollbar gutter, inside the box.
      const [track] = await pixelsAt(page, [[Math.round(box.x + box.width - 6), Math.round(box.y + box.height / 2)]]);
      const [bg] = await pixelsAt(page, [[Math.round(box.x + 2), Math.round(box.y + box.height / 2)]]);
      const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      record(testInfo, tag(theme, `scrollbar track ${track.join(",")} vs scroll box ground ${bg.join(",")} (luminance ${lum(track).toFixed(0)} / ${lum(bg).toFixed(0)})`), 0, 0);
      if (theme === "dark") {
        expect(lum(track), "dark scrollbar track is dark").toBeLessThan(96);
      } else {
        expect(lum(track), "light scrollbar track is light").toBeGreaterThan(160);
      }
      await page.evaluate(() => document.getElementById("qa-scroll")?.remove());
    });

    test(`[${theme}] selected text: the highlight behind the selected text reaches 4.5:1 against that text`, async ({ page }, testInfo) => {
      await themed(page, stored);
      const span = page.locator("#qa-select");
      await page.evaluate(() => {
        const wrap = document.createElement("div");
        wrap.id = "qa-select-wrap";
        wrap.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647;background:var(--background);padding:8px;font-size:24px";
        wrap.innerHTML = '<span id="qa-select" style="white-space:pre;color:var(--foreground)">   Selected text</span>';
        document.body.appendChild(wrap);
        const range = document.createRange();
        range.selectNodeContents(document.getElementById("qa-select") as HTMLElement);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      await settle(page);
      const r = await readPainted(page, span);
      const box = must(await span.boundingBox(), "selected span box");
      // The first three cells are leading spaces inside the highlight; no glyph is drawn there.
      const [hl] = await pixelsAt(page, [[Math.round(box.x + 4), Math.round(box.y + box.height / 2)]]);
      const selRatio = contrast(r.color, hl);
      record(testInfo, tag(theme, `selection highlight ${hl.join(",")} vs selected text ${r.color.join(",")} (painted)`), selRatio, 4.5);
      expect(selRatio, "selected text is readable").toBeGreaterThanOrEqual(4.5);
      await page.evaluate(() => {
        window.getSelection()?.removeAllRanges();
        document.getElementById("qa-select-wrap")?.remove();
      });
    });
  }
});
