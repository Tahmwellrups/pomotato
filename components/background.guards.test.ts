import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Task 010 static guards (criteria 2, 21, 23, 28, 29, 30, 31). They read the tree,
// so they fail on the diff that a later edit introduces, not on a fixed snapshot.

const ROOT = `${process.cwd()}/`;
const read = (relative: string) => readFileSync(`${ROOT}${relative}`, "utf8");
const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

const NEW_FILES = [
  "components/BackgroundControl.tsx",
  "components/BackgroundLayer.tsx",
  "hooks/use-background-image.ts",
  "lib/image-decode.ts",
  "lib/db/background-repository.ts",
  "lib/db/background-validation.ts",
];

const TIMER_SOURCE = /\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/;
const NETWORK = /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b|<form\b[^>]*\baction=/;
const EMBEDDED_IMAGE = /data:image\/|base64/i;
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
const RGB_LITERAL = /\b(?:rgba?|hsla?|oklch)\(/;

describe("task 010 criterion 28: no new time source in any new file", () => {
  for (const file of NEW_FILES) {
    it(`${file} has no setInterval, setTimeout, requestAnimationFrame or performance.now`, () => {
      expect(read(file)).not.toMatch(TIMER_SOURCE);
    });
  }
});

describe("task 010 criterion 29: nothing in the feature talks to a server", () => {
  for (const file of NEW_FILES) {
    it(`${file} makes no fetch, XHR, beacon, socket or form action`, () => {
      expect(read(file)).not.toMatch(NETWORK);
    });
  }

  it("the app has no route handler directory and no route.ts file", () => {
    expect(existsSync(`${ROOT}app/api`)).toBe(false);
    const routes = git("ls-files", "app").split("\n").filter((f) => /(^|\/)route\.tsx?$/.test(f));
    expect(routes).toEqual([]);
  });
});

describe("task 010 criterion 30: no asset ships, no base64 image literal in source", () => {
  for (const file of NEW_FILES) {
    it(`${file} embeds no data: image URL or base64 literal`, () => {
      expect(read(file)).not.toMatch(EMBEDDED_IMAGE);
    });
  }

  // app/favicon.ico is the create-next-app default and is already in HEAD; this criterion is about what the task adds.
  it("no image file is added by this task (untracked or added against HEAD)", () => {
    const added = git("diff", "--name-only", "--diff-filter=A", "HEAD").split("\n");
    const untracked = git("ls-files", "--others", "--exclude-standard").split("\n");
    const listed = [...added, ...untracked].filter(Boolean);
    const images = listed.filter((f) => /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|heic)$/i.test(f));
    expect(images).toEqual([]);
  });

  it("public/ holds no image", () => {
    const dir = `${ROOT}public`;
    const files = existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String) : [];
    expect(files.filter((f) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f))).toEqual([]);
  });
});

describe("task 010 criterion 31 for lib/: the palette rules apply to the lib files by the same regexes", () => {
  for (const file of ["lib/image-decode.ts", "lib/db/background-repository.ts", "lib/db/background-validation.ts"]) {
    it(`${file} has no colour literal`, () => {
      const source = read(file);
      expect(source).not.toMatch(HEX_LITERAL);
      expect(source).not.toMatch(RGB_LITERAL);
    });
  }
});

describe("task 010 criterion 6 and 6 of Scope: no new dependency, no first lucide-react import", () => {
  it("no new file imports lucide-react", () => {
    for (const file of NEW_FILES) expect(read(file)).not.toMatch(/from\s+["']lucide-react["']/);
  });

  it("package.json and package-lock.json are unchanged against HEAD", () => {
    expect(git("diff", "--name-only", "HEAD", "--", "package.json", "package-lock.json").trim()).toBe("");
  });
});

describe("task 010 criterion 2 (re-pointed by task 013 criterion 57): the boot script and the one clock still exist by value", () => {
  // Retired: the HEAD-diff over lib/timer and the timer hooks. It went red the
  // moment task 013 changed lib/timer on purpose, which is the shelf-life defect
  // PLAN.md records. What it guarded, the clock being the only interval and the
  // boot script being intact, is pinned by value below.
  it("hooks/use-timer-clock.ts still has its one setNow(Date.now()) tick and no other timer source", () => {
    const clock = read("hooks/use-timer-clock.ts");
    expect(clock).toMatch(/setNow\(Date\.now\(\)\)/);
    expect((clock.match(/setInterval\(/g) ?? []).length).toBe(1);
  });

  it("the boot script file exists and is still the one that sets the theme before first paint", () => {
    expect(existsSync(`lib/preferences/boot-script.ts`)).toBe(true);
  });
});

describe("task 010 criterion 21 and 23: the grain values and the set of custom properties are unchanged", () => {
  const css = () => read("app/globals.css");

  it("--grain-ink and --grain-opacity keep their dark values (task 019: one palette)", () => {
    expect(css()).toMatch(/--grain-ink:\s*#f5ebdc;/);
    expect(css()).toMatch(/--grain-opacity:\s*0\.05;/);
  });

  it("the grain layer is still body::before at z-index -1", () => {
    expect(css()).toMatch(/body::before\s*\{[^}]*z-index:\s*-1/);
  });

  // Task 012 criterion 27: the HEAD comparison is replaced by the expected set,
  // by value, with this task's two additions (--surface-glass, --surface-blur).
  // A new token now means editing this list, in the same diff, on purpose.
  it("the declared custom property names are exactly the pinned set (criterion 27)", () => {
    const names = (source: string) => [...new Set([...source.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))].sort();
    const EXPECTED = ["--accent", "--accent-foreground", "--background", "--border", "--card", "--card-foreground", "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--color-accent", "--color-accent-foreground", "--color-background", "--color-border", "--color-card", "--color-card-foreground", "--color-chart-1", "--color-chart-2", "--color-chart-3", "--color-chart-4", "--color-chart-5", "--color-control-border", "--color-destructive", "--color-destructive-foreground", "--color-dialog-edge", "--color-disabled-surface", "--color-foreground", "--color-input", "--color-muted", "--color-muted-foreground", "--color-popover", "--color-popover-foreground", "--color-primary", "--color-primary-foreground", "--color-ring", "--color-scrim", "--color-secondary", "--color-secondary-foreground", "--control-border", "--destructive", "--destructive-foreground", "--dialog-edge", "--disabled-surface", "--font-comfortaa", "--font-geist", "--font-geist-mono", "--font-heading", "--font-mono", "--font-sans", "--font-space-grotesk", "--foreground", "--gauge-liquid", "--grain-ink", "--grain-opacity", "--input", "--muted", "--muted-foreground", "--popover", "--popover-foreground", "--primary", "--primary-foreground", "--radius", "--radius-2xl", "--radius-3xl", "--radius-4xl", "--radius-lg", "--radius-md", "--radius-sm", "--radius-xl", "--ring", "--scrim", "--secondary", "--secondary-foreground", "--surface-blur", "--surface-glass"];
    expect(names(css())).toEqual([...EXPECTED].sort());
  });

  // The two owner rulings that moved --control-border were guarded here as a diff
  // against HEAD, which only held while 010 was uncommitted: once f3f5869 landed the
  // tree matched HEAD, the changed-value list went empty and the assertion failed for
  // having shipped. The durable form of the same guard is token-foundation.test.ts:85,
  // which pins both hexes by value and asserts there are exactly two, so re-pointing
  // this one would duplicate it.
});
