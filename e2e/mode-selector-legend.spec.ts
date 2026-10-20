import { test, expect } from "@playwright/test";

// Task 005 fix loop 1: ModeSelector regained `<legend className="sr-only">Timer mode</legend>`.
// These checks prove the legend names the group, stays visually hidden, and does not move the
// mode buttons, at the two viewports the acceptance criteria use.
const viewports = [
  { width: 320, height: 720 },
  { width: 1280, height: 800 },
];

for (const viewport of viewports) {
  test.describe(`mode selector legend at ${viewport.width} px`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(page.getByRole("radio", { name: "Focus" })).toBeAttached();
    });

    test("the fieldset is named Timer mode by its legend", async ({ page }) => {
      const group = page.getByRole("group", { name: "Timer mode", exact: true });
      await expect(group).toHaveCount(1);
      const shape = await group.evaluate((el) => ({
        tag: el.tagName,
        firstChild: el.firstElementChild?.tagName ?? "",
        legendText: el.querySelector("legend")?.textContent ?? "",
      }));
      expect(shape).toEqual({ tag: "FIELDSET", firstChild: "LEGEND", legendText: "Timer mode" });
    });

    test("the legend is visually hidden (sr-only geometry, not display none)", async ({ page }) => {
      const legend = page.locator("fieldset > legend");
      await expect(legend).toHaveCount(1);
      const style = await legend.evaluate((el) => {
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return { position: cs.position, overflow: cs.overflow, width: box.width, height: box.height, display: cs.display };
      });
      expect(style.display).not.toBe("none");
      expect(style.position).toBe("absolute");
      expect(style.overflow).toBe("hidden");
      expect(style.width).toBeLessThanOrEqual(1);
      expect(style.height).toBeLessThanOrEqual(1);
    });

    test("no visible Timer mode text is rendered", async ({ page }) => {
      const visible = await page.locator("legend", { hasText: "Timer mode" }).evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 1 && box.height > 1;
      });
      expect(visible).toBe(false);
    });

    test("the legend adds no layout: the group starts where its first mode button starts, and the buttons stay centred", async ({ page }) => {
      const group = page.getByRole("group", { name: "Timer mode", exact: true });
      const labels = group.locator("label");
      const groupBox = await group.boundingBox();
      const firstBox = await labels.first().boundingBox();
      const lastBox = await labels.last().boundingBox();
      expect(groupBox).not.toBeNull();
      expect(firstBox).not.toBeNull();
      expect(lastBox).not.toBeNull();
      // Top edge of the group equals the top edge of the first button: the legend takes no flow space.
      expect(Math.abs((groupBox?.y ?? 0) - (firstBox?.y ?? -100))).toBeLessThanOrEqual(1);
      // Buttons are centred in the group (justify-center): the legend does not push them off-centre.
      const groupCentre = (groupBox?.x ?? 0) + (groupBox?.width ?? 0) / 2;
      const rowCentre = ((firstBox?.x ?? 0) + ((lastBox?.x ?? 0) + (lastBox?.width ?? 0))) / 2;
      // 2 px tolerance covers subpixel rounding of the centred row; a legend in flow would shift it by far more.
      expect(Math.abs(groupCentre - rowCentre)).toBeLessThanOrEqual(2);
    });

    test("no horizontal page scroll with the legend in place", async ({ page }) => {
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });

    test("the mode radios still switch mode by click", async ({ page }) => {
      await page.getByRole("radio", { name: "Short break" }).check({ force: true });
      await expect(page.getByRole("radio", { name: "Short break" })).toBeChecked();
    });
  });
}
