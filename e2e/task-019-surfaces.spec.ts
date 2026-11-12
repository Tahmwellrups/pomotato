import { expect, test } from "@playwright/test";
import { DESKTOP, ratio } from "./helpers/dark";
import { hex, sampleRegions, type Box } from "./helpers/task-019-sampler";
import type { Rgb } from "./helpers/painted";

// Task 019 surface sweep (ruling 6, corrected 2026-11-12). Plain page only (no uploaded image; the image
// ground belongs to task 020). Per route: ONE screenshot with every glyph hidden, then the pixels each
// text run covers are sampled from that PNG.
//
// Method correction: the first version sampled each element's whole bounding box. That box includes
// the element's own border and padding, so a bordered control's border (a token, not the ground behind
// the glyphs) became the "worst pixel" and produced five withdrawn figures (see the QA log). This version
// samples only the text-run rectangles from Range.getClientRects(), so the sampled pixels are the ones
// the glyphs sit on. Each ratio is the foreground computed colour against the worst of those pixels.
// Dark is the only palette, stated once here.

const ROUTES = ["/", "/stats", "/settings"] as const;
const FLOOR = 4.5;

// Known findings, recorded not fixed. Empty after the method correction: no plain-page text miss survives
// sampling behind the glyphs. The spec fails on any new miss, so a later regression cannot pass silently.
// Text|ratio pairs, sorted by text.
const KNOWN_MISSES: Record<string, string[]> = {
  "/": [],
  "/stats": [],
  "/settings": [],
};

interface RunEl {
  text: string;
  color: string;
  runs: { x: number; y: number; width: number; height: number }[];
}

function parseRgb(css: string): Rgb {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not an rgb colour: ${css}`);
  const parts = m[1].split(",").map((v) => Number(v.trim()));
  return [parts[0], parts[1], parts[2]];
}

test.describe("task 019 surface sweep (plain page, dark only, sampled behind the glyphs)", () => {
  for (const route of ROUTES) {
    test(`${route}: every visible text run clears 4.5:1 against the pixels behind its glyphs`, async ({ page }, testInfo) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      const els: RunEl[] = await page.evaluate(() => {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const out: RunEl[] = [];
        const candidates = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,span,label,button,a,li,td,th,dt,dd,legend,summary,output,small,strong,em"));
        for (const el of candidates) {
          if (out.length >= 150) break;
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent ?? "")
            .join("")
            .trim();
          if (!own || el.closest(".sr-only")) continue;
          const s = getComputedStyle(el);
          if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) continue;
          // An ancestor can hide the text too (opacity, clip, visibility): only text a sighted user can see counts.
          if (typeof el.checkVisibility === "function" && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
          // The rectangles the text itself covers: one per text node line, not the element's box.
          const range = document.createRange();
          range.selectNodeContents(el);
          const runs = Array.from(range.getClientRects())
            .filter((r) => r.width >= 1 && r.height >= 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw)
            .filter((r) => {
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !!hit && (hit === el || el.contains(hit));
            })
            .map((r) => ({ x: r.left, y: r.top, width: r.width, height: r.height }));
          if (runs.length === 0) continue;
          out.push({ text: own.slice(0, 40), color: s.color, runs });
        }
        return out;
      });

      // Hide every glyph in one pass so the single screenshot holds only the ground.
      await page.addStyleTag({ content: "* { color: transparent !important; caret-color: transparent !important; } input, textarea { color: transparent !important; }" });
      await page.waitForTimeout(100);

      const boxes: Record<string, Box> = {};
      els.forEach((el, i) => el.runs.forEach((run, j) => (boxes[`${i}.${j}`] = run)));
      const reading = await sampleRegions(page, boxes);

      const rows = els.map((el, i) => {
        const fg = parseRgb(el.color);
        let worst = { ratio: Infinity, pixel: "", at: "" };
        el.runs.forEach((_, j) => {
          const r = reading[`${i}.${j}`];
          for (const pick of [r.brightest, r.darkest]) {
            const value = ratio(fg, pick.rgb);
            if (value < worst.ratio) worst = { ratio: value, pixel: hex(pick.rgb), at: `(${pick.x},${pick.y})` };
          }
        });
        return { text: el.text, fg: hex(fg), ratio: Number(worst.ratio.toFixed(3)), pixel: worst.pixel, at: worst.at };
      });
      const misses = rows.filter((r) => r.ratio < FLOOR);
      testInfo.annotations.push({
        type: "figure",
        description: `${route}: ${rows.length} text elements; minimum ${Math.min(...rows.map((r) => r.ratio))}; misses ${misses.length}: ${misses.map((m) => `"${m.text}" ${m.fg} vs ${m.pixel} ${m.at} = ${m.ratio}`).join(" | ") || "none"}`,
      });
      expect(rows.length).toBeGreaterThan(3);
      const found = misses.map((m) => `${m.text}|${m.ratio}`).sort();
      expect(found).toEqual([...KNOWN_MISSES[route]].sort());
    });
  }
});
