/**
 * The fixed task color palette. Tasks store one of these ids, never a raw
 * color value, so a future theme (milestone 4) can remap each id to a
 * different swatch without touching stored tasks.
 *
 * Backend owns identity and validation (the id/name pairs below). The CSS
 * value each id renders as, and its contrast handling, belongs to the UI
 * layer — frontend maps `PaletteColorId` to an actual color.
 */
export const PALETTE = [
  { id: "potato", name: "Potato brown" },
  { id: "tomato", name: "Tomato red" },
  { id: "mint", name: "Mint green" },
  { id: "sky", name: "Sky blue" },
  { id: "lavender", name: "Lavender purple" },
  { id: "sunflower", name: "Sunflower yellow" },
  { id: "blush", name: "Blush pink" },
  { id: "slate", name: "Slate gray" },
] as const satisfies readonly { id: string; name: string }[];

export type PaletteColorId = (typeof PALETTE)[number]["id"];

export const DEFAULT_PALETTE_COLOR_ID: PaletteColorId = PALETTE[0].id;

const PALETTE_IDS: ReadonlySet<string> = new Set(PALETTE.map((entry) => entry.id));

export function isPaletteColorId(value: unknown): value is PaletteColorId {
  return typeof value === "string" && PALETTE_IDS.has(value);
}
