/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 007, criterion 11: the foundation assertion. Every colour painted by
// app/, components/, hooks/ and widgets/ resolves through a semantic token or a
// color-mix() of tokens, so milestone 4 can add one .dark block. Files are
// discovered by walking the directories, not listed by hand, so a file added
// later is covered without anyone remembering to register it.
//
// This file replaces the task 005 pattern that lived in
// TaskListDialog.tokens.test.ts. That pattern only matched <palette>-<NN>, so
// it passed for two tasks over `text-white` and `hover:text-white`.

const ROOT = `${resolve(dirname(fileURLToPath(import.meta.url)), "..")}/`;
const SCANNED_DIRS = ["app", "components", "hooks", "widgets"];

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const FILES = SCANNED_DIRS.flatMap((dir) => walk(`${ROOT}${dir}`)).map((full) => full.slice(ROOT.length)).sort();

function read(relative: string): string {
  return readFileSync(`${ROOT}${relative}`, "utf8");
}

const PALETTE =
  "stone|amber|red|orange|yellow|green|emerald|teal|sky|blue|indigo|violet|purple|pink|rose|slate|gray|zinc|neutral|lime|cyan|fuchsia|mauve|olive|mist|taupe";

// Any colour-bearing utility prefix, including the per-side border forms and the
// inset variants, followed by a palette name (with or without a step), `white` or
// `black`, with an optional /NN or /[value] opacity suffix. Variants are matched
// because \b sits between ':' and the prefix (hover:text-white, dark:bg-black).
const COLOR_UTILITY_PREFIX =
  "(?:bg|text-shadow|text|border(?:-[trblxyse])?|outline|ring(?:-offset)?|inset-ring|inset-shadow|drop-shadow|from|to|via|divide|placeholder|caret|accent|decoration|shadow|fill|stroke)";
const RAW_PALETTE_UTILITY = new RegExp(
  `\\b${COLOR_UTILITY_PREFIX}-(?:(?:${PALETTE})(?:-\\d{2,3})?|white|black)(?![\\w-])(?:/(?:\\d+|\\[[^\\]]+\\]))?|\\b(?:${PALETTE})-\\d{2,3}\\b`,
  "g",
);

const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
// color-mix() does not match: the name has to be followed directly by "(".
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/;
const INLINE_STYLE_COLOR = /style=\{\{[^}]*(?:color|background|border|outline|fill|stroke)/i;

// Allow-list of raw palette utilities, pinned per file. It is empty on purpose and
// has to stay empty: a later task that needs one adds the file here with a reason
// in the same diff, where review can see it.
const ALLOWED_RAW_UTILITIES: Record<string, string[]> = {};

// Colour literals (hex and colour functions) that are data or probes, not theme.
// Each entry carries the reason it is exempt.
const ALLOWED_LITERALS: Record<string, string> = {
  "components/task-palette-colors.ts":
    "TASK_COLOR_HEX: the eight task swatch values, owner palette decisions measured at 3:1 as data. milestone 4 remaps them per theme.",
};

// Task 007 criterion 13: the one inline style colour in the swept files. The
// swatch value comes from TASK_COLOR_HEX, contrast-checked data rather than
// theme, so it is exempted here by name and by exact expression, not left to
// pass by accident. The exemption is for the inline style, not for the file:
// every other check in this file still runs on TaskColorDot.tsx.
const INLINE_STYLE_EXEMPTION = {
  file: "components/TaskColorDot.tsx",
  expression: "style={{ backgroundColor: TASK_COLOR_HEX[colorId] }}",
  reason: "swatch colour is contrast-checked data from TASK_COLOR_HEX, not theme",
};

const TASK_007_FILES = [
  "components/TaskForm.tsx",
  "components/TaskRow.tsx",
  "components/TaskList.tsx",
  "components/TaskListDialog.tsx",
  "components/TaskColorDot.tsx",
  "components/StatsButton.tsx",
  "components/CustomDurationInput.tsx",
  "components/ModeSelector.tsx",
  "components/ui/mode-chip.tsx",
  "components/ui/dialog.tsx",
  "components/ui/button.tsx",
  "widgets/HeaderNav.tsx",
  "widgets/BottomControls.tsx",
];

function matches(source: string): string[] {
  return [...new Set(source.match(RAW_PALETTE_UTILITY) ?? [])].sort();
}

// Task 009 R-8: a new top-level directory with components must be scanned, not skipped silently.
describe("task 009 R-8: SCANNED_DIRS is exactly the top-level directories containing .tsx files", () => {
  it("matches the repo's top-level directories that hold .tsx files", () => {
    const SKIP = new Set(["node_modules", ".next", ".git", ".claude", "docs", "public", "playwright-report", "test-results", "coverage"]);
    const withTsx = readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIP.has(entry.name) && !entry.name.startsWith("."))
      .filter((entry) => walkTsx(`${ROOT}${entry.name}`).length > 0)
      .map((entry) => entry.name)
      .sort();
    expect([...SCANNED_DIRS].sort()).toEqual(withTsx);
  });
});

// Task 009 R-9: the four files the deleted TimerGauge.tokens.test.ts check guarded
// must still be covered by this guard's discovered FILES set.
describe("task 009 R-9: the files the deleted raw-palette check covered are still in FILES", () => {
  for (const file of [
    "components/TimerGauge.tsx",
    "components/HoldButton.tsx",
    "components/SloshGauge.tsx",
    "hooks/use-resolved-tokens.ts",
    "components/TimerControls.tsx",
    "components/TimerDisplay.tsx",
  ]) {
    it(`${file} is covered by the palette guard`, () => {
      expect(FILES).toContain(file);
    });
  }
});

function walkTsx(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walkTsx(full));
    else if (/\.tsx$/.test(entry.name)) found.push(full);
  }
  return found;
}

describe("task 007 file discovery is live", () => {
  it("walks all four directories and sees known files from each", () => {
    for (const known of [
      "app/page.tsx",
      "app/layout.tsx",
      "app/stats/page.tsx",
      "components/TaskRow.tsx",
      "components/ui/mode-chip.tsx",
      "hooks/use-tasks.ts",
      "widgets/HeaderNav.tsx",
    ]) {
      expect(FILES).toContain(known);
    }
    expect(FILES.length).toBeGreaterThan(30);
  });

  it("skips test files", () => {
    expect(FILES.filter((file) => /\.test\.tsx?$/.test(file))).toEqual([]);
  });

  it("every swept file is in the discovered set", () => {
    for (const file of TASK_007_FILES) expect(FILES).toContain(file);
  });
});

describe("task 007 no raw palette utility anywhere in app code", () => {
  it("the allow-list is empty", () => {
    expect(ALLOWED_RAW_UTILITIES).toEqual({});
  });

  for (const file of FILES) {
    it(`${file} has no raw palette utility`, () => {
      expect(matches(read(file))).toEqual([...(ALLOWED_RAW_UTILITIES[file] ?? [])].sort());
    });
  }
});

describe("task 007 no colour literal in app code outside the pinned data and probe files", () => {
  it("the exempt files are exactly the pinned two, each with a reason", () => {
    expect(Object.keys(ALLOWED_LITERALS).sort()).toEqual(["components/task-palette-colors.ts"]);
    for (const reason of Object.values(ALLOWED_LITERALS)) expect(reason.length).toBeGreaterThan(20);
  });

  for (const file of FILES) {
    if (file in ALLOWED_LITERALS) continue;
    it(`${file} has no hex literal or colour function`, () => {
      const source = read(file);
      expect(source).not.toMatch(HEX_LITERAL);
      expect(source).not.toMatch(COLOR_FUNCTION);
    });
  }
});

describe("task 007 inline style colour is exempt only for the swatch", () => {
  it("the exemption names its file, exact expression and reason", () => {
    expect(INLINE_STYLE_EXEMPTION.reason).toMatch(/TASK_COLOR_HEX/);
    expect(read(INLINE_STYLE_EXEMPTION.file)).toContain(INLINE_STYLE_EXEMPTION.expression);
  });

  it("TaskColorDot.tsx has no inline colour style beyond the exempt expression", () => {
    const rest = read(INLINE_STYLE_EXEMPTION.file).replace(INLINE_STYLE_EXEMPTION.expression, "");
    expect(rest).not.toMatch(INLINE_STYLE_COLOR);
  });

  // Task 009 R-8: iterates every discovered file (FILES), not the hand-kept TASK_007_FILES list.
  for (const file of FILES) {
    if (file === INLINE_STYLE_EXEMPTION.file) continue;
    it(`${file} has no inline colour style`, () => {
      expect(read(file)).not.toMatch(INLINE_STYLE_COLOR);
    });
  }
});

describe("task 007 the guard patterns see what the task 005 pattern missed", () => {
  const hits = [
    "bg-white",
    "text-white",
    "hover:text-white",
    "bg-black",
    "border-black/10",
    "text-black/80",
    "bg-white/[0.5]",
    "ring-offset-white",
    "ring-offset-black/20",
    "border-t-white",
    "border-x-stone-300",
    "dark:bg-black",
    "hover:bg-white/50",
    "bg-amber-200",
    "bg-amber-200/50",
    "peer-focus-visible:outline-amber-700",
    "hover:border-stone-400",
    "from-amber-200/50",
    "inset-ring-white",
    "text-red-700",
    "disabled:bg-stone-300",
  ];
  for (const sample of hits) {
    it(`matches ${sample}`, () => {
      expect(`class="${sample}"`.match(RAW_PALETTE_UTILITY)).not.toBeNull();
    });
  }

  const clean = [
    "bg-primary",
    "bg-primary/80",
    "text-primary-foreground",
    "bg-popover",
    "bg-card",
    "border-border",
    "border-control-border",
    "outline-ring",
    "ring-offset-card",
    "text-accent-foreground",
    "bg-scrim",
    "text-destructive-foreground",
    "bg-[color-mix(in_srgb,var(--primary),var(--foreground)_20%)]",
    "border-[color-mix(in_srgb,var(--foreground)_12%,transparent)]",
    "border-t-border",
  ];
  for (const sample of clean) {
    it(`does not match the token utility ${sample}`, () => {
      expect(`class="${sample}"`.match(RAW_PALETTE_UTILITY)).toBeNull();
    });
  }

  for (const sample of ["oklch(55.5% 0.163 48.998)", "oklab(0 0 0 / 0.1)", "lab(9 1 2)", "lch(9 1 2)", "hwb(0 0% 0%)", "color(srgb 1 0 0)", "rgb(0, 0, 0)", "rgba(0,0,0,.1)", "hsl(0 0% 0%)", "hsla(0 0% 0% / 1)"]) {
    it(`flags the colour function ${sample}`, () => {
      expect(COLOR_FUNCTION.test(`bg-[${sample}]`)).toBe(true);
    });
  }

  for (const sample of ["#fff", "#b45309", "#b4530980"]) {
    it(`flags the hex literal ${sample}`, () => {
      expect(HEX_LITERAL.test(`bg-[${sample}]`)).toBe(true);
    });
  }

  it("does not flag color-mix() through the literal checks", () => {
    const sample = "bg-[color-mix(in_srgb,var(--primary),var(--foreground)_20%)]";
    expect(COLOR_FUNCTION.test(sample)).toBe(false);
    expect(HEX_LITERAL.test(sample)).toBe(false);
  });

  it("flags an inline style colour", () => {
    expect(INLINE_STYLE_COLOR.test('style={{ backgroundColor: "red" }}')).toBe(true);
    expect(INLINE_STYLE_COLOR.test("style={{ transform: t }}")).toBe(false);
  });
});
