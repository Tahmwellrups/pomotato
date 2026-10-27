import { expect, test, type Page } from "@playwright/test";
import {
  ADVERSARIAL,
  chooseOnSettings,
  fmt,
  mergeColours,
  paintedColours,
  setPrefs,
  waitActive,
  worstAgainst,
  type Rect,
} from "./helpers/background";
import { compositeOver, tokenRgb } from "./helpers/painted";
import { openTaskList } from "./helpers/task-list-dialog";
import { seedTimerState } from "./helpers/timer-hold";

// Task 010, QA pass 2 (job 2). The task dialog's edge (--dialog-edge) against the
// scrimmed page under an image, and against the dialog fill, plus the flat
// surfaces against --control-border (pass 2, job 1). Every figure is a worst
// painted pixel from a real screenshot, the same method as criterion 15.
//   ground: the 6 px ring left and right of the dialog (the scrimmed page; the
//           dialog's own drop shadow is inside this ring, as it is for a user).
//   fill:   a strip inside the dialog's left padding (the popover fill).
//   edge:   the computed border colour (opaque).
// Floor 3:1 (WCAG 1.4.11). Light's edge is a pre-existing sub-floor hairline;
// the owner deferred it out of 010 on 2026-10-27 (docs/PLAN.md), so the light
// test below pins the sub-floor as the current state rather than asserting a
// floor it is known to miss.

type Theme = "light" | "dark";
const RING = 6;
const FILL_INSET = 3;
const FILL_WIDTH = 6;
const IMAGES = ["none", "white", "black"] as const;
const FLAT_TOKENS = ["--card", "--popover", "--muted", "--secondary"] as const;

async function measureDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Your tasks", exact: true });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  if (!box) throw new Error("task dialog has no bounding box");
  const styles = await dialog.evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderLeftColor, borderWidth: s.borderLeftWidth, fill: s.backgroundColor };
  });
  const edge = await compositeOver(page, styles.border, "rgb(0, 0, 0)");
  const fillToken = await compositeOver(page, styles.fill, "rgb(0, 0, 0)");

  const rects: Rect[] = [
    { x: box.x - RING, y: box.y, w: RING, h: box.height },
    { x: box.x + box.width, y: box.y, w: RING, h: box.height },
    { x: box.x + FILL_INSET, y: box.y + 24, w: FILL_WIDTH, h: box.height - 48 },
  ];
  const [leftG, rightG, fillPx] = await paintedColours(page, rects);
  const ground = worstAgainst(mergeColours([leftG, rightG]), edge);
  const fill = worstAgainst(fillPx, edge);
  return { edge, edgeWidth: styles.borderWidth, fillToken, ground, fill };
}

async function flatRatiosAgainstControlBorder(page: Page): Promise<Record<string, number>> {
  const control = await tokenRgb(page, "--control-border");
  const out: Record<string, number> = {};
  for (const token of FLAT_TOKENS) {
    const colour = await tokenRgb(page, token);
    out[token] = worstAgainst(new Map([[fmt(colour), 1]]), control).ratio;
  }
  return out;
}

test.describe.configure({ timeout: 180_000 });

async function measureTheme(page: Page, theme: Theme) {
  await setPrefs(page, { theme });
  await seedTimerState(page, { mode: "custom", customMinutes: 25, status: "idle" });
  const lines: string[] = [];
  const results: Record<string, Awaited<ReturnType<typeof measureDialog>>> = {};
  for (const name of IMAGES) {
    if (name === "none") {
      await page.goto("/");
    } else {
      await chooseOnSettings(page, ADVERSARIAL[name](), `${name}.png`);
      await page.goto("/");
      await waitActive(page);
    }
    await page.waitForLoadState("networkidle");
    await openTaskList(page);
    const m = await measureDialog(page);
    results[name] = m;
    lines.push(
      `[${theme}] ${name}: edge ${fmt(m.edge)} (${m.edgeWidth}) | scrimmed ground worst ${m.ground.ratio.toFixed(3)} at ${fmt(m.ground.pixel)} | fill ${fmt(m.fillToken)} worst ${m.fill.ratio.toFixed(3)} at ${fmt(m.fill.pixel)}`,
    );
    if (name === "none") {
      lines.push(`[${theme}] flat surfaces vs --control-border: ${JSON.stringify(await flatRatiosAgainstControlBorder(page))}`);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Your tasks", exact: true })).toHaveCount(0);
  }
  return { results, lines };
}

test("dark: task dialog edge holds 3:1 over the scrimmed page and the fill, over no image, white and black", async ({ page }) => {
  const { results, lines } = await measureTheme(page, "dark");
  test.info().annotations.push({ type: "measure", description: lines.join("\n") });
  expect(Object.keys(results), "every image measured, so the loop below is not vacuous").toHaveLength(IMAGES.length);
  for (const [name, m] of Object.entries(results)) {
    expect(m.ground.ratio, `dark ${name}: dialog edge vs scrimmed page`).toBeGreaterThanOrEqual(3);
    expect(m.fill.ratio, `dark ${name}: dialog edge vs dialog fill`).toBeGreaterThanOrEqual(3);
  }
});

// Known and pre-existing: light --dialog-edge is --border (#d6d3d1), unchanged since HEAD,
// and it is a 1.4:1 hairline against the popover by design. Not a 010 acceptance criterion;
// the owner deferred the fix out of 010 and it is filed in docs/PLAN.md.
//
// This pins the sub-floor as measured instead of using test.fail on the whole test. test.fail
// would report a timeout, a dialog that never opened, or a broken sampler as "expected" too,
// so the one path that is known to be red would be the one path that can rot unnoticed. The
// bounds below go red in both directions that matter: if the edge is lifted (the fix landing,
// and then these assertions are what tells you to retire this test) or if the measurement
// stops producing real numbers.
test("light: task dialog edge is a known sub-floor, pre-existing and not a 010 criterion", async ({ page }) => {
  const { results, lines } = await measureTheme(page, "light");
  test.info().annotations.push({ type: "measure", description: lines.join("\n") });
  expect(Object.keys(results), "every image measured, so the loop below is not vacuous").toHaveLength(IMAGES.length);
  for (const [name, m] of Object.entries(results)) {
    expect(m.ground.ratio, `light ${name}: dialog edge vs scrimmed page, recorded 2.00-2.11`).toBeGreaterThan(1.5);
    expect(m.ground.ratio, `light ${name}: dialog edge vs scrimmed page is BELOW the 3:1 floor by design of the deferral; if this fails the edge was fixed, so delete this test and restore the floor assertion`).toBeLessThan(3);
    expect(m.fill.ratio, `light ${name}: dialog edge vs dialog fill, recorded 1.43`).toBeGreaterThan(1.1);
    expect(m.fill.ratio, `light ${name}: dialog edge vs dialog fill is BELOW the 3:1 floor by design of the deferral; see above`).toBeLessThan(3);
  }
});
