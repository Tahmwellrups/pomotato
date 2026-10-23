import { test, expect, type Locator, type Page } from "@playwright/test";
import { readPainted, contrast, tokenRgb, type Rgb } from "./helpers/painted";

// Task 007 QA, Part 1 (criteria 1-8): the mode chip's selection cue.
// The cue must be a computed, non-colour property. The chips stay flat text.

const MODES = ["focus", "shortBreak", "longBreak", "custom"] as const;
type Mode = (typeof MODES)[number];

const viewports = [
  { width: 320, height: 720 },
  { width: 1280, height: 800 },
];

function radio(page: Page, mode: Mode): Locator {
  return page.locator(`input[name="timer-mode"][value="${mode}"]`);
}

/** The painted chip is the <span> that follows the sr-only radio. */
function chip(page: Page, mode: Mode): Locator {
  return radio(page, mode).locator("xpath=following-sibling::span[1]");
}

async function select(page: Page, mode: Mode) {
  await page.locator(`label:has(input[value="${mode}"])`).click();
  await expect(radio(page, mode)).toBeChecked();
  // The weight and colour transitions are short; wait them out before reading painted values.
  await page.waitForTimeout(400);
}

/** Reads computed weight and decoration for all four chips in the current state. */
async function chipCues(page: Page) {
  const out: Record<Mode, { weight: number; decoration: string; color: string }> = {} as never;
  for (const mode of MODES) {
    const reading = await readPainted(page, chip(page, mode));
    out[mode] = {
      weight: reading.fontWeight,
      decoration: reading.textDecorationLine,
      color: reading.color.join(","),
    };
  }
  return out;
}

async function greyLuma([r, g, b]: Rgb): Promise<number> {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

test.describe("task 007 criteria 1-4: the chip cue is non-colour and the flat text stays flat", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(radio(page, "focus")).toBeAttached();
  });

  for (const selected of MODES) {
    test(`criterion 1: checked ${selected} differs from every unchecked chip by font-weight >= 300`, async ({ page }) => {
      await select(page, selected);
      const cues = await chipCues(page);
      // Default rendering: the non-colour property itself.
      for (const other of MODES) {
        if (other === selected) continue;
        const delta = cues[selected].weight - cues[other].weight;
        expect(delta, `font-weight delta checked ${selected} vs ${other}`).toBeGreaterThanOrEqual(300);
      }
      // The colour difference exists too, so the weight assertion above is the one that carries the cue.
      expect(cues[selected].color).not.toEqual(cues[MODES.find((m) => m !== selected)!].color);
    });
  }

  test("criterion 1 control: the chip label colours alone differ only slightly (1.13:1), so colour cannot be the cue", async ({ page }) => {
    await select(page, "focus");
    const checked = await readPainted(page, chip(page, "focus"));
    const unchecked = await readPainted(page, chip(page, "shortBreak"));
    expect(contrast(checked.color, unchecked.color)).toBeLessThan(1.5);
  });

  for (const condition of ["default", "forced-colors", "greyscale"] as const) {
    test(`criterion 2 (${condition}): the weight cue survives, paired with default rendering`, async ({ page }) => {
      if (condition === "forced-colors") await page.emulateMedia({ forcedColors: "active" });
      if (condition === "greyscale") {
        await page.evaluate(() => {
          document.documentElement.style.filter = "grayscale(1)";
        });
      }
      await select(page, "focus");
      await page.waitForTimeout(300);
      const cues = await chipCues(page);
      expect(cues.focus.weight - cues.shortBreak.weight, `${condition}: checked focus vs unchecked shortBreak`).toBeGreaterThanOrEqual(300);
      expect(cues.focus.weight - cues.longBreak.weight, `${condition}: checked focus vs unchecked longBreak`).toBeGreaterThanOrEqual(300);
      expect(cues.focus.weight - cues.custom.weight, `${condition}: checked focus vs unchecked custom`).toBeGreaterThanOrEqual(300);

      if (condition === "greyscale") {
        // Recorded control: in greyscale the two label colours collapse to nearly the same grey, so weight is the carrier.
        const a = await greyLuma((await readPainted(page, chip(page, "focus"))).color);
        const b = await greyLuma((await readPainted(page, chip(page, "shortBreak"))).color);
        expect(Math.abs(a - b)).toBeLessThan(10);
      }
    });
  }

  test("criterion 2 pairing: under forced-colors the default-rendering weight delta is identical (no vacuous pass)", async ({ page }) => {
    await select(page, "longBreak");
    const before = await chipCues(page);
    await page.emulateMedia({ forcedColors: "active" });
    await page.waitForTimeout(200);
    const after = await chipCues(page);
    expect(after.longBreak.weight).toBe(before.longBreak.weight);
    expect(after.focus.weight).toBe(before.focus.weight);
    expect(before.longBreak.weight - before.focus.weight).toBeGreaterThanOrEqual(300);
  });

  test("criterion 3: all four chips paint no fill, no border and no radius in both the checked and unchecked states", async ({ page }) => {
    for (const selected of MODES) {
      await select(page, selected);
      for (const mode of MODES) {
        const reading = await readPainted(page, chip(page, mode));
        const state = `${mode} when ${selected} is checked`;
        expect(reading.backgroundRaw, `${state} background-color`).toBe("rgba(0, 0, 0, 0)");
        expect(reading.borderWidths, `${state} border widths`).toEqual(["0px", "0px", "0px", "0px"]);
        expect(reading.borderColor, `${state} border drawn`).toBeNull();
        const radius = await chip(page, mode).evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
        expect(radius, `${state} border radius`).toBe("0px");
      }
    }
  });

  test("criterion 4: the checked and unchecked labels each reach 4.5:1 against the painted page", async ({ page }) => {
    for (const selected of ["focus", "custom"] as const) {
      await select(page, selected);
      for (const mode of MODES) {
        const reading = await readPainted(page, chip(page, mode));
        expect(contrast(reading.color, reading.ground), `${mode} label when ${selected} is checked`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("criterion 4 token check: checked label uses --accent-foreground, unchecked uses --secondary-foreground", async ({ page }) => {
    await select(page, "focus");
    const checked = await readPainted(page, chip(page, "focus"));
    const unchecked = await readPainted(page, chip(page, "shortBreak"));
    expect(checked.color).toEqual(await tokenRgb(page, "--accent-foreground"));
    expect(unchecked.color).toEqual(await tokenRgb(page, "--secondary-foreground"));
  });
});

test.describe("task 007 criterion 6: the chip row at 320 and 1280 px", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(radio(page, "focus")).toBeAttached();
  });

  for (const viewport of viewports) {
    test(`at ${viewport.width} px: no horizontal scroll, every chip in view, every chip at least 44 px, for each selected mode`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(200);
      const widthDeltas: string[] = [];
      for (const selected of MODES) {
        await select(page, selected);
        const scroll = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scroll.scrollWidth, `scrollWidth with ${selected} selected at ${viewport.width}`).toBeLessThanOrEqual(scroll.clientWidth);
        for (const mode of MODES) {
          const box = await chip(page, mode).boundingBox();
          expect(box, `${mode} chip box`).not.toBeNull();
          expect(box!.x, `${mode} chip left edge in view`).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width, `${mode} chip right edge in view with ${selected} selected`).toBeLessThanOrEqual(scroll.innerWidth);
          expect(box!.height, `${mode} chip height`).toBeGreaterThanOrEqual(44);
          expect(box!.width, `${mode} chip width`).toBeGreaterThanOrEqual(44);
        }
      }
      // Recorded per-chip width delta (checked vs unchecked), for Implementation Notes.
      for (const mode of MODES) {
        const other = MODES.find((m) => m !== mode)!;
        await select(page, mode);
        const checkedWidth = (await chip(page, mode).boundingBox())!.width;
        await select(page, other);
        const uncheckedWidth = (await chip(page, mode).boundingBox())!.width;
        widthDeltas.push(`${mode}: checked ${checkedWidth.toFixed(1)} unchecked ${uncheckedWidth.toFixed(1)} delta ${(checkedWidth - uncheckedWidth).toFixed(1)}`);
      }
      test.info().annotations.push({ type: "chip-width-delta", description: `${viewport.width}px ${widthDeltas.join(" | ")}` });
    });
  }
});

test.describe("task 007 criterion 7 and 8: native radio semantics and chip keyboard focus", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(radio(page, "focus")).toBeAttached();
  });

  test("criterion 7: radios are native and carry no role or aria attribute; the fieldset and legend are unchanged", async ({ page }) => {
    const markup = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="timer-mode"]'));
      const fieldset = radios[0]?.closest("fieldset");
      const legend = fieldset?.querySelector("legend");
      return {
        count: radios.length,
        types: radios.map((r) => r.type),
        classes: radios.map((r) => r.className),
        roles: radios.map((r) => r.getAttribute("role")),
        ariaAttrs: radios.map((r) => Array.from(r.attributes).filter((a) => a.name.startsWith("aria-")).map((a) => a.name)),
        fieldsetTag: fieldset?.tagName ?? null,
        legendText: legend?.textContent ?? null,
        legendClass: legend?.className ?? null,
        legendAria: legend ? Array.from(legend.attributes).filter((a) => a.name.startsWith("aria-")).map((a) => a.name) : null,
        fieldsetAria: fieldset ? Array.from(fieldset.attributes).filter((a) => a.name.startsWith("aria-") || a.name === "role").map((a) => a.name) : null,
      };
    });
    expect(markup.count).toBe(4);
    expect(markup.types.every((t) => t === "radio")).toBe(true);
    expect(markup.classes.every((c) => c.includes("peer") && c.includes("sr-only"))).toBe(true);
    expect(markup.roles.every((r) => r === null)).toBe(true);
    expect(markup.ariaAttrs.every((a) => a.length === 0)).toBe(true);
    expect(markup.fieldsetTag).toBe("FIELDSET");
    expect(markup.legendText).toBe("Timer mode");
    expect(markup.legendClass).toContain("sr-only");
    expect(markup.legendAria).toEqual([]);
    expect(markup.fieldsetAria).toEqual([]);
    await expect(page.getByRole("group", { name: "Timer mode", exact: true })).toBeVisible();
  });

  test("criterion 7: clicking a chip label selects its radio", async ({ page }) => {
    await page.locator('label:has(input[value="longBreak"])').click();
    await expect(radio(page, "longBreak")).toBeChecked();
  });

  for (const selected of ["focus", "shortBreak"] as const) {
    test(`criterion 8: keyboard focus on a ${selected === "focus" ? "checked" : "unchecked"} chip is a 2 px outline at 2 px offset in --ring, >= 3:1 against the page`, async ({ page }) => {
      await select(page, "focus");
      // Keyboard modality, so :focus-visible applies to the programmatic focus that follows.
      await page.keyboard.press("Tab");
      for (let i = 0; i < 12; i++) {
        const onRadio = await page.evaluate(() => {
          const a = document.activeElement as HTMLInputElement | null;
          return a?.type === "radio" && a.name === "timer-mode";
        });
        if (onRadio) break;
        await page.keyboard.press("Tab");
      }
      await page.evaluate((value) => {
        (document.querySelector(`input[name="timer-mode"][value="${value}"]`) as HTMLInputElement).focus();
      }, selected);
      await expect(radio(page, selected)).toBeFocused();
      await page.waitForTimeout(400);
      const reading = await readPainted(page, chip(page, selected));
      expect(reading.outlineStyle).toBe("solid");
      expect(reading.outlineWidth).toBe("2px");
      expect(reading.outlineOffset).toBe("2px");
      const ring = await tokenRgb(page, "--ring");
      expect(reading.outlineColor).toEqual(ring);
      expect(contrast(ring, reading.ground)).toBeGreaterThanOrEqual(3);
    });
  }
});
