import { expect, test } from "@playwright/test";
import { DESKTOP, setPrefs } from "./helpers/background";
import { groundPixels } from "./helpers/surface-sampler";
import { compositeOver } from "./helpers/painted";
import { seedTimerState } from "./helpers/timer-hold";

// Regression guard for the sampler trap (task 013 round 2 ruling). A screenshot that passes
// animations: "disabled" cancels infinite animations to their initial keyframe, so a pulsing
// element reads its base colour, not the paint on screen. This pauses a live pulse mid-cycle,
// where the base colour and the paint differ, and requires the sampler to read the paint.
// Red-proof: adding animations: "disabled" to groundPixels turns this red (level: e2e, the
// only level where the screenshot exists).
test("groundPixels reads the paint of a paused infinite animation, not its base keyframe", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setPrefs(page, { theme: "light" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await seedTimerState(page, { status: "running", mode: "focus", focusMinutes: 5, endTimestamp: Date.now() + 600_000, startedAt: Date.now(), runId: "guard-sampler", pausedRemainingMs: null });
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Pause the first sizeable infinite animation at mid-cycle. Read its base colour (currentTime 0)
  // and its mid-cycle colour, then leave it paused there so both the screenshot and the reference
  // describe the same instant.
  const target = await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const inf = el.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity);
      if (inf.length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) continue;
      const anim = inf[0];
      anim.pause();
      anim.currentTime = 0;
      const base = getComputedStyle(el).backgroundColor;
      const half = Number(anim.effect?.getComputedTiming().duration ?? 0) / 2;
      anim.currentTime = half;
      const mid = getComputedStyle(el).backgroundColor;
      return { base, mid, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  });
  expect(target, "a live infinite animation is on the page (the pulse is running)").not.toBeNull();
  if (target === null) return;

  const rect = { x: Math.floor(target.x) - 1, y: Math.floor(target.y) - 1, w: 2, h: 2 };
  const reference = await compositeOver(page, target.mid, "rgb(0 0 0)");
  const base = await compositeOver(page, target.base, "rgb(0 0 0)");
  const [ground] = await groundPixels(page, [rect]);
  const read = [...ground.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);

  // Non-vacuous: the base keyframe and the mid-cycle paint must differ, or agreement proves nothing.
  const apart = Math.max(...[0, 1, 2].map((i) => Math.abs(reference[i] - base[i])));
  expect(apart, `base ${base.join(",")} and mid-cycle ${reference.join(",")} differ`).toBeGreaterThan(6);
  for (let i = 0; i < 3; i += 1) {
    expect(Math.abs(read[i] - reference[i]), `channel ${i}: read ${read.join(",")} vs computed ${reference.join(",")}`).toBeLessThanOrEqual(3);
  }
});
