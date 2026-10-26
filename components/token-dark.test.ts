/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 009 criteria 11, 12, 27 and 30: source-level guards for the .dark palette,
// the focus rule and the border/input fill ban. Browser measurements live in e2e/.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(ROOT, "app/globals.css"), "utf8");

/** Returns the body of the first top-level block whose selector matches. */
function blockBody(source: string, selector: RegExp): string {
  const match = selector.exec(source);
  if (!match) throw new Error(`no block matching ${selector}`);
  const open = source.indexOf("{", match.index);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated block for ${selector}`);
}

/** Declarations in a block as a map of property name to value, comments stripped. */
function declarations(body: string): Map<string, string> {
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const map = new Map<string, string>();
  for (const raw of stripped.split(";")) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const name = raw.slice(0, idx).trim();
    if (!name.startsWith("--") && name !== "color-scheme") continue;
    map.set(name, raw.slice(idx + 1).trim());
  }
  return map;
}

const ROOT_BLOCK = declarations(blockBody(css, /^:root\s*\{/m));
const DARK_BLOCK = declarations(blockBody(css, /^\.dark\s*\{/m));

describe("criterion 11: one .dark block, and the existing structure is unchanged", () => {
  it("app/globals.css has exactly one .dark block", () => {
    const count = css.match(/^\.dark\s*\{/gm)?.length ?? 0;
    expect(count).toBe(1);
  });

  it("the dark variant and both @theme inline blocks are still present", () => {
    expect(css).toContain("@custom-variant dark (&:is(.dark *));");
    expect(css.match(/@theme inline\s*\{/g)?.length ?? 0).toBe(2);
  });

  it("the .dark block sets color-scheme dark and :root sets color-scheme light (criterion 22)", () => {
    expect(ROOT_BLOCK.get("color-scheme")).toBe("light");
    expect(DARK_BLOCK.get("color-scheme")).toBe("dark");
  });
});

// Criterion 12: every token in the technical ground truth list.
const TOKENS_NEEDING_DARK = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--gauge-liquid",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--control-border",
  "--scrim",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  // Added by task 009 for surfaces the palette needed; each has its own :root value.
  "--dialog-edge",
  "--disabled-surface",
];

describe("criterion 12: every token has a dark value that differs from its light value", () => {
  for (const token of TOKENS_NEEDING_DARK) {
    it(`${token} is declared in :root and in .dark, with different values`, () => {
      const light = ROOT_BLOCK.get(token);
      const dark = DARK_BLOCK.get(token);
      expect(light, `${token} missing from :root`).toBeDefined();
      expect(dark, `${token} missing from .dark`).toBeDefined();
      expect(dark).not.toBe(light);
    });
  }

  it("the --sidebar-* group gets no literal values in .dark (it keeps aliasing)", () => {
    const sidebar = [...DARK_BLOCK.keys()].filter((name) => name.startsWith("--sidebar"));
    expect(sidebar).toEqual([]);
  });

  it("the :root block still aliases the sidebar group to the tokens above it", () => {
    expect(ROOT_BLOCK.get("--sidebar")).toBe("var(--background)");
    expect(ROOT_BLOCK.get("--sidebar-border")).toBe("var(--border)");
  });
});

describe("criterion 27: the focus ring flows through --ring", () => {
  const focusRule = blockBody(css, /:focus-visible\s*\{/);

  it("the :focus-visible rule uses var(--ring) and carries no raw hex", () => {
    expect(focusRule).toMatch(/outline:\s*2px solid var\(--ring\);/);
    expect(focusRule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("the rule is still 2px wide at a 2px offset", () => {
    expect(focusRule).toMatch(/outline-offset:\s*2px;/);
  });

  it("the rule is still unlayered: it sits at brace depth 0, outside any @layer block", () => {
    const index = css.search(/^:focus-visible\s*\{/m);
    expect(index).toBeGreaterThan(-1);
    const withoutComments = css.slice(0, index).replace(/\/\*[\s\S]*?\*\//g, "");
    const depth = [...withoutComments].reduce((d, ch) => (ch === "{" ? d + 1 : ch === "}" ? d - 1 : d), 0);
    expect(depth).toBe(0);
  });

  it("light --ring is still the same value as the old hard-coded focus colour (#b45309)", () => {
    expect(ROOT_BLOCK.get("--ring")).toBe("#b45309");
  });
});

// Criterion 30: --border and --input are boundary tokens only, so no fill utility
// derived from them survives in any shipped source directory.
const SCANNED = ["app", "components", "hooks", "widgets"];
const FILL_FROM_BOUNDARY = /(?:^|[\s"'`{}(,])(?:[a-z0-9-]+:)*(?:bg|fill|from|via|to)-(?:border|input)(?![\w-])/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(full));
    else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

describe("criterion 30: no fill utility derived from --border or --input", () => {
  const files = SCANNED.flatMap((dir) => walk(resolve(ROOT, dir)));

  it("the scan sees a realistic number of source files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  for (const file of files) {
    it(`${file.slice(ROOT.length + 1)} has no bg-border, bg-input or disabled:bg-border style utility`, () => {
      // Comments are documentation, not styling: button.tsx's header quotes the
      // banned utility it removed, and that must not count as a fill.
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source.match(FILL_FROM_BOUNDARY) ?? []).toEqual([]);
    });
  }

  it("the matcher itself catches the banned forms (not vacuous)", () => {
    for (const sample of ["bg-border", "disabled:bg-border", "bg-input/30", "dark:bg-input", "hover:bg-border/50"]) {
      expect(` ${sample} `.match(FILL_FROM_BOUNDARY), sample).not.toBeNull();
    }
    for (const sample of ["border-border", "border-input", "ring-ring", "bg-muted", "bg-dialog-edge", "bg-disabled-surface"]) {
      expect(` ${sample} `.match(FILL_FROM_BOUNDARY), sample).toBeNull();
    }
  });
});
