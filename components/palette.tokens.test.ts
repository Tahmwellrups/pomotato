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
// Task 015 criterion 45: empty on purpose. The only entry was components/task-palette-colors.ts,
// the task swatch data, and that file is deleted with the colour dot. Any later exemption is added
// here in the same diff with a reason, where review can see it.
const ALLOWED_LITERALS: Record<string, string> = {};

const TASK_007_FILES = [
  "components/TaskChecklistRow.tsx",
  "components/TaskChecklist.tsx",
  "components/TaskPanelToggle.tsx",
  "widgets/TaskPanel.tsx",
  "components/StatsButton.tsx",
  "components/DurationField.tsx",
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
      "components/TaskChecklistRow.tsx",
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
  it("task 015 criterion 45: no file is exempt from the literal check", () => {
    expect(ALLOWED_LITERALS).toEqual({});
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

describe("task 007 inline style colour: no exemption survives task 015 (criterion 45)", () => {
  // Task 007 criterion 13 exempted one inline style (the swatch backgroundColor) by name. That file
  // is deleted, so the exemption has no file and is removed; the check now runs on every file.
  for (const file of FILES) {
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

// Task 010 criterion 31: every file the task adds is inside the palette guard's
// FILES walk, the allowlists are unchanged, and the break-and-restore of the
// guard itself is recorded in the task file's QA Report.
// lib/ is not in SCANNED_DIRS, so the lib/ files of task 010 are guarded by
// components/background.guards.test.ts instead, with the same regexes.
const TASK_010_FILES = ["components/BackgroundControl.tsx", "components/BackgroundLayer.tsx", "hooks/use-background-image.ts"];

describe("task 010 criterion 31: the new files are covered and the allowlists did not grow", () => {
  for (const file of TASK_010_FILES) {
    it(`${file} is inside FILES`, () => {
      expect(FILES).toContain(file);
    });
  }

  it("ALLOWED_RAW_UTILITIES is still empty", () => {
    expect(ALLOWED_RAW_UTILITIES).toEqual({});
  });

  it("ALLOWED_LITERALS is empty (task 015 criterion 45)", () => {
    expect(ALLOWED_LITERALS).toEqual({});
  });
});
