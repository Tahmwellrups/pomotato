import type { Locator, Page } from "@playwright/test";

// Task 007 QA. Painted-pixel measurement for colours that Chromium serialises in
// forms parseRgb() does not read (oklch(), lab(), color-mix(), color(srgb ...),
// alpha). Each colour is drawn onto a 1x1 canvas over its real ground and read
// back, so the number is what the user's screen composites, not arithmetic on
// token values (task 007 criterion 27).

export type Rgb = [number, number, number];

export interface PaintedReading {
  /** Text colour, composited over the ground behind the element. */
  color: Rgb;
  /** Ground behind the element: every opaque ancestor (and optionally the element's own fill), composited from the root down. */
  ground: Rgb;
  /** Own background, composited over the ground behind it. Equals `ground` when the element paints none. */
  fill: Rgb;
  /** Null when the border is not drawn (zero width, or a transparent colour). */
  borderColor: Rgb | null;
  borderWidths: [string, string, string, string];
  backgroundRaw: string;
  outlineColor: Rgb | null;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
  fontWeight: number;
  textDecorationLine: string;
  boxShadow: string;
  opacity: number;
  box: { x: number; y: number; width: number; height: number };
}

/** Composites `fg` (any CSS colour) over an opaque `ground` and returns the 8-bit sRGB result. */
export async function compositeOver(page: Page, fg: string, ground: string): Promise<Rgb> {
  return page.evaluate(
    ([f, g]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d canvas context");
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = f;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    },
    [fg, ground] as const,
  );
}

/** Reads the painted reading for an element. Pass includeSelf to composite the element's own fill into the ground. */
export async function readPainted(page: Page, locator: Locator): Promise<PaintedReading> {
  const raw = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    // Ancestors root-first. The element's own background is reported separately.
    const chain: string[] = [];
    let node: Element | null = el.parentElement;
    while (node) {
      chain.unshift(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    return {
      color: s.color,
      ownBackground: s.backgroundColor,
      chain,
      borderTop: s.borderTopColor,
      borderWidths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth] as [string, string, string, string],
      outlineColor: s.outlineColor,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineOffset: s.outlineOffset,
      fontWeight: Number(s.fontWeight),
      textDecorationLine: s.textDecorationLine,
      boxShadow: s.boxShadow,
      opacity: Number(s.opacity),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });

  const isTransparent = (c: string) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
  // Composite the ancestor chain from the root down, starting from white (the document canvas).
  let ground: Rgb = [255, 255, 255];
  for (const bg of raw.chain) {
    if (!isTransparent(bg)) ground = await compositeOver(page, bg, rgbString(ground));
  }
  const fill = isTransparent(raw.ownBackground)
    ? ground
    : await compositeOver(page, raw.ownBackground, rgbString(ground));
  const borderDrawn = raw.borderWidths.some((w) => w !== "0px") && raw.borderTop !== "rgba(0, 0, 0, 0)";
  const outlineDrawn = raw.outlineStyle !== "none" && raw.outlineWidth !== "0px";
  return {
    color: await compositeOver(page, raw.color, rgbString(fill)),
    ground,
    fill,
    borderColor: borderDrawn ? await compositeOver(page, raw.borderTop, rgbString(fill)) : null,
    borderWidths: raw.borderWidths,
    backgroundRaw: raw.ownBackground,
    outlineColor: outlineDrawn ? await compositeOver(page, raw.outlineColor, rgbString(ground)) : null,
    outlineStyle: raw.outlineStyle,
    outlineWidth: raw.outlineWidth,
    outlineOffset: raw.outlineOffset,
    fontWeight: raw.fontWeight,
    textDecorationLine: raw.textDecorationLine,
    boxShadow: raw.boxShadow,
    opacity: raw.opacity,
    box: raw.box,
  };
}

export function rgbString([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a CSS custom property to the painted colour it resolves to (composited over white). */
export async function tokenRgb(page: Page, cssVar: string): Promise<Rgb> {
  const value = await page.evaluate((v) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${v})`;
    document.body.appendChild(probe);
    const out = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return out;
  }, cssVar);
  return compositeOver(page, value, "rgb(255, 255, 255)");
}
