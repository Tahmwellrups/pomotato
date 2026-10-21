/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 006: the timer surface draws colour only from semantic tokens, so the
// milestone 4 .dark block can theme it without a second restyle. Source-text
// guards, in the shape of TimerGauge.tokens.test.ts.
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const PALETTE =
  "stone|amber|red|orange|yellow|green|emerald|teal|sky|blue|indigo|violet|purple|pink|rose|slate|gray|zinc|neutral";

// Unlike the task 005 pattern, this one also sees `white` and `black`, with or
// without a /NN opacity suffix, and any colour-bearing utility prefix:
//   bg-white   text-white   border-black/10   ring-offset-white   from-amber-200/50
//   bg-amber-200   hover:border-stone-400   peer-focus-visible:outline-amber-700
// Forms it deliberately leaves to the hex/rgb guards: arbitrary values such as
// bg-[#fff] or bg-[rgb(0,0,0)]. A bare `white`/`black` that is not a utility
// suffix (e.g. a prose word) is not matched.
const COLOR_UTILITY_PREFIX =
  "(?:bg|text|border|outline|ring(?:-offset)?|from|to|via|divide|placeholder|caret|accent|decoration|shadow|fill|stroke)";
const RAW_PALETTE_UTILITY = new RegExp(
  `\\b${COLOR_UTILITY_PREFIX}-(?:(?:${PALETTE})(?:-\\d{2,3})?|white|black)(?![\\w-])(?:/\\d+)?|\\b(?:${PALETTE})-\\d{2,3}\\b`,
  "g",
);
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
// QA addition: this project's Tailwind v4 palette is OKLCH, so an oklch()/oklab()/
// lab()/lch()/hwb()/color() literal is a raw colour too, not just rgb()/hsl().
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/;
const INLINE_STYLE_COLOR = /style=\{\{[^}]*(?:color|background|border|outline|fill|stroke)/i;
const TIMER_SOURCE = /\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/;

// Pinned allowed raw utilities per file. Empty everywhere: any reintroduction fails.
const FILES: Record<string, string[]> = {
  "./ModeSelector.tsx": [],
  "./TimerControls.tsx": [],
  "./CustomDurationInput.tsx": [],
  "./ui/mode-chip.tsx": [],
};

describe("task 006 timer surface uses semantic tokens only", () => {
  for (const [file, allowed] of Object.entries(FILES)) {
    it(`${file} carries only its pinned raw palette utilities (${allowed.length === 0 ? "none" : allowed.join(", ")})`, () => {
      const found = [...new Set(read(file).match(RAW_PALETTE_UTILITY) ?? [])].sort();
      expect(found).toEqual([...allowed].sort());
    });

    it(`${file} has no hex, rgb()/hsl() literal or inline colour style`, () => {
      const source = read(file);
      expect(source).not.toMatch(HEX_LITERAL);
      expect(source).not.toMatch(COLOR_FUNCTION);
      expect(source).not.toMatch(INLINE_STYLE_COLOR);
    });
  }

  it("app/page.tsx has no raw palette utility outside its commented-out block", () => {
    const live = read("../app/page.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(live.match(RAW_PALETTE_UTILITY) ?? []).toEqual([]);
  });
});

describe("task 006 guard pattern sees the forms the task 005 pattern missed", () => {
  const cases = [
    "bg-white",
    "text-white",
    "border-black/10",
    "bg-black",
    "text-black/80",
    "ring-offset-white",
    "hover:bg-white/50",
    "bg-amber-200",
    "peer-focus-visible:outline-amber-700",
    "hover:border-stone-400",
    "from-amber-200/50",
    "text-red-700",
  ];
  for (const sample of cases) {
    it(`matches ${sample}`, () => {
      expect(`class="${sample}"`.match(RAW_PALETTE_UTILITY)).not.toBeNull();
    });
  }

  for (const sample of ["bg-primary", "text-primary-foreground", "bg-popover", "border-border", "outline-ring", "text-accent-foreground", "bg-[color-mix(in_srgb,var(--primary),var(--foreground)_30%)]"]) {
    it(`does not match the token utility ${sample}`, () => {
      expect(`class="${sample}"`.match(RAW_PALETTE_UTILITY)).toBeNull();
    });
  }
});

describe("task 006 introduces no time source", () => {
  for (const file of ["./ModeSelector.tsx", "./CustomDurationInput.tsx", "./TimerControls.tsx", "./ui/mode-chip.tsx"]) {
    it(`${file} has no setInterval, setTimeout, requestAnimationFrame or performance.now`, () => {
      expect(read(file)).not.toMatch(TIMER_SOURCE);
    });
  }
});

describe("task 006 literal guards see arbitrary-value colours the palette pattern leaves alone", () => {
  for (const sample of ["bg-[#fff]", "text-[#b45309]", "bg-[rgb(0,0,0)]", "bg-[oklch(55.5%_0.163_48.998)]", "bg-[hsl(0_0%_0%)]"]) {
    it(`flags ${sample} through the hex, rgb or oklch check`, () => {
      const hit = HEX_LITERAL.test(sample) || COLOR_FUNCTION.test(sample);
      expect(hit).toBe(true);
    });
  }

  it("does not flag the token utilities or color-mix() through the literal checks", () => {
    const sample = "bg-primary text-primary-foreground hover:border-[color-mix(in_srgb,var(--border),var(--foreground)_30%)]";
    expect(HEX_LITERAL.test(sample)).toBe(false);
    expect(COLOR_FUNCTION.test(sample)).toBe(false);
  });
});
