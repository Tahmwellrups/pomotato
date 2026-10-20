/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static guards for the surfaces added by task 005. They read source text, so
// they catch a hex literal, a raw palette utility or a new timer source being
// added to these files, whatever the runtime behaviour.
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
const RGB_LITERAL = /\b(?:rgba?|hsla?)\(/;
const RAW_PALETTE_UTILITY = /\b(?:amber|stone|red|yellow|green|blue|gray|slate|zinc|neutral|orange|rose|sky)-\d{2,3}\b/g;
const TIMER_SOURCE = /\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/;

// Files this task adds or fully owns. None may carry a colour literal.
const NEW_SURFACE_FILES = [
  "./TimerGauge.tsx",
  "./HoldButton.tsx",
  "./SloshGauge.tsx",
  "../hooks/use-resolved-tokens.ts",
];

// Files whose lines this task edits. The exact palette utilities allowed to
// remain are listed here; any other utility fails the test.
const EDITED_FILES: Record<string, string[]> = {
  // amber-700/800 belong to the untouched primary Start/Pause button and the focus ring.
  "./TimerControls.tsx": ["amber-700", "amber-800"],
  // fix loop 1: the mm:ss readout moved from text-stone-900 to text-foreground, so no
  // raw palette utility remains in this file. Empty pin means any reintroduction fails.
  "./TimerDisplay.tsx": [],
};

describe("task 005 colour tokens", () => {
  for (const file of NEW_SURFACE_FILES) {
    it(`${file} contains no hex or rgb() literal`, () => {
      const source = read(file);
      expect(source).not.toMatch(HEX_LITERAL);
      expect(source).not.toMatch(RGB_LITERAL);
    });

    it(`${file} contains no raw palette utility`, () => {
      expect(read(file).match(RAW_PALETTE_UTILITY) ?? []).toEqual([]);
    });
  }

  for (const [file, allowed] of Object.entries(EDITED_FILES)) {
    it(`${file} contains no hex or rgb() literal`, () => {
      const source = read(file);
      expect(source).not.toMatch(HEX_LITERAL);
      expect(source).not.toMatch(RGB_LITERAL);
    });

    it(`${file} carries only its pinned palette utilities (${allowed.join(", ")})`, () => {
      const found = [...new Set(read(file).match(RAW_PALETTE_UTILITY) ?? [])].sort();
      expect(found).toEqual([...allowed].sort());
    });
  }
});

describe("task 005 introduces no new time source", () => {
  for (const file of ["./TimerGauge.tsx", "./TimerDisplay.tsx", "./TimerControls.tsx", "../hooks/use-resolved-tokens.ts"]) {
    it(`${file} has no setInterval, setTimeout, requestAnimationFrame or performance.now`, () => {
      expect(read(file)).not.toMatch(TIMER_SOURCE);
    });
  }
});
