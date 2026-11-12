import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Task 019 ruling 3: palette expectations read the dark :root token from app/globals.css, so a
// later palette move changes the expectation with the token rather than with a pasted literal.

const ROOT_BLOCK = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").match(/:root\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

/** The hex value of a :root custom property, lower-cased. */
export function rootHex(name: string): string {
  const value = ROOT_BLOCK.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`))?.[1];
  if (!value) throw new Error(`no hex value for ${name} in :root`);
  return value.toLowerCase();
}

/** The computed-style string Chromium reports for a token, e.g. "rgb(240, 165, 80)". */
export function rootRgb(name: string): string {
  const hex = rootHex(name);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
