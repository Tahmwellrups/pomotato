/// <reference types="node" />
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 019 static guards (criteria 1, 5, 6, 8, 9, 14, 16, 44, 48, 50). Source-level only;
// the rendered behaviour lives in e2e/task-019-*.spec.ts.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** Every .ts/.tsx file under the given top-level directories, excluding test files. */
function sourceFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  for (const d of dirs) walk(resolve(ROOT, d));
  return out;
}

const APP_DIRS = ["app", "components", "widgets", "hooks", "lib"];

describe("task 019 criterion 1, 6: the theme selector and theme-lock files are gone", () => {
  it.each([
    "components/ThemeControl.tsx",
    "components/ThemeSync.tsx",
    "components/ThemeLockAnnouncer.tsx",
    "hooks/use-theme-sync.ts",
    "hooks/use-theme-lock.ts",
  ])("%s no longer exists", (file) => {
    expect(existsSync(resolve(ROOT, file))).toBe(false);
  });

  it("app/layout.tsx imports none of the deleted theme modules", () => {
    expect(read("app/layout.tsx")).not.toMatch(/ThemeSync|ThemeLockAnnouncer|use-theme-lock|use-theme-sync|ThemeControl/);
  });

  it("widgets/HeaderNav.tsx renders no theme control", () => {
    expect(read("widgets/HeaderNav.tsx")).not.toMatch(/ThemeControl|theme/i);
  });
});

describe("task 019 criterion 5: the preference store exposes no theme and the theme helpers are deleted", () => {
  it.each([
    "ThemePreference",
    "ResolvedTheme",
    "THEME_VALUES",
    "DEFAULT_THEME",
    "resolveTheme",
    "effectiveTheme",
    "isThemeSelectorShown",
    "applyResolvedTheme",
    "setTheme",
  ])("%s is not declared in lib/preferences", (name) => {
    expect(sourceFiles(["lib"]).some((f) => readFileSync(f, "utf8").includes(name))).toBe(false);
  });

  it("the store file declares no theme state field", () => {
    expect(read("lib/preferences/store.ts")).not.toMatch(/\btheme\b\s*:/);
  });
});

describe("task 019 criterion 8: no media query selects a palette", () => {
  it("prefers-color-scheme appears in no app source file", () => {
    const hits = sourceFiles(APP_DIRS).filter((f) => readFileSync(f, "utf8").includes("prefers-color-scheme"));
    expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});

describe("task 019 criterion 9: no theme code is commented out rather than deleted", () => {
  it("no commented dark: utility, theme branch or removal placeholder in app source", () => {
    const pattern = /\/\/\s*(removed|dark:|theme\b)|\/\*\s*(removed|dark:)/i;
    const hits = sourceFiles(APP_DIRS).filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});

describe("task 019 criterion 14, 16: dark is server-rendered on <html>", () => {
  const layout = () => read("app/layout.tsx");

  it("the html element carries data-theme=\"dark\" statically", () => {
    expect(layout()).toMatch(/<html[^>]*data-theme="dark"/);
  });

  it("suppressHydrationWarning on <html> is kept for the task-panel attribute the boot script sets, not for a theme class", () => {
    expect(layout()).toMatch(/suppressHydrationWarning/);
    expect(layout()).toMatch(/data-task-panel/);
  });
});

describe("task 019 criterion 44: the background overlay opacity is unchanged", () => {
  it("BackgroundLayer paints opacity-50 when active and opacity-0 when pending, byte-for-byte", () => {
    expect(read("components/BackgroundLayer.tsx")).toContain('${shown ? "opacity-50" : "opacity-0"}');
  });
});

describe("task 019 criterion 48, 50: dark-only tokens and variants are gone from app/globals.css", () => {
  const css = () => read("app/globals.css");

  it("no .dark block and no dark custom variant remain", () => {
    expect(css()).not.toMatch(/^\s*\.dark\b/m);
    expect(css()).not.toMatch(/@custom-variant\s+dark/);
  });

  it("no --sidebar-* token remains in globals.css", () => {
    expect(css()).not.toMatch(/--(color-)?sidebar/);
  });

  it("the :root block declares color-scheme: dark", () => {
    expect(css()).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark;/);
  });

  it("no dark: utility variant remains in app code", () => {
    const hits = sourceFiles(APP_DIRS).filter((f) => /(^|[\s"'`{])dark:[a-z\[]/.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});

// Carried forward from the deleted token-dark.test.ts (task 009 criteria 27 and 30); the
// .dark-block half of that file went with the block.
describe("task 009 criterion 27 (carried forward): the focus ring flows through --ring", () => {
  const focusRule = (read("app/globals.css").match(/:focus-visible\s*\{([^}]*)\}/) ?? [])[1] ?? "";

  it("the :focus-visible rule uses var(--ring) and carries no raw hex", () => {
    expect(focusRule).toMatch(/outline:\s*2px solid var\(--ring\);/);
    expect(focusRule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("the rule is still 2px wide at a 2px offset", () => {
    expect(focusRule).toMatch(/outline-offset:\s*2px;/);
  });
});

describe("task 009 criterion 30 (carried forward): no fill utility derived from --border or --input", () => {
  const FILL_FROM_BOUNDARY = /(?:^|[\s"'`{}(,])(?:[a-z0-9-]+:)*(?:bg|fill|from|via|to)-(?:border|input)(?![\w-])/g;
  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("the scan sees a realistic number of source files", () => {
    expect(sourceFiles(["app", "components", "hooks", "widgets"]).length).toBeGreaterThan(30);
  });

  it("no source file carries a bg-border, bg-input or disabled:bg-border style utility", () => {
    const hits = sourceFiles(["app", "components", "hooks", "widgets"]).filter((f) => (stripComments(readFileSync(f, "utf8")).match(FILL_FROM_BOUNDARY) ?? []).length > 0);
    expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });

  it("the matcher itself catches the banned forms (not vacuous)", () => {
    for (const sample of ["bg-border", "disabled:bg-border", "bg-input/30", "dark:bg-input", "hover:bg-border/50"]) {
      expect(` ${sample} `.match(FILL_FROM_BOUNDARY), sample).not.toBeNull();
    }
    for (const sample of ["border-border", "border-input", "ring-ring", "bg-muted", "bg-dialog-edge", "bg-disabled-surface"]) {
      expect(` ${sample} `.match(FILL_FROM_BOUNDARY), sample).toBeNull();
    }
  });
});
