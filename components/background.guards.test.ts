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

describe("task 010 criterion 2: the timer, stats and boot script are untouched against HEAD", () => {
  it("lib/timer, lib/stats, the two timer hooks and the boot script have an empty diff", () => {
    const paths = ["lib/timer", "lib/stats", "hooks/use-timer-clock.ts", "hooks/use-hydrate-timer-store.ts", "lib/preferences/boot-script.ts", "lib/preferences/boot-script.test.ts"];
    expect(git("diff", "--name-only", "HEAD", "--", ...paths).trim()).toBe("");
  });
});

describe("task 010 criterion 21 and 23: the grain values and the set of custom properties are unchanged", () => {
  const css = () => read("app/globals.css");

  it("--grain-ink and --grain-opacity keep their values in both themes", () => {
    expect(css()).toMatch(/--grain-ink:\s*#2b2017;/);
    expect(css()).toMatch(/--grain-opacity:\s*0\.07;/);
    expect(css()).toMatch(/--grain-ink:\s*#f5ebdc;/);
    expect(css()).toMatch(/--grain-opacity:\s*0\.05;/);
  });

  it("the grain layer is still body::before at z-index -1", () => {
    expect(css()).toMatch(/body::before\s*\{[^}]*z-index:\s*-1/);
  });

  it("the set of declared custom property names is identical to HEAD (no new token)", () => {
    const names = (source: string) => [...new Set([...source.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))].sort();
    expect(names(css())).toEqual(names(git("show", "HEAD:app/globals.css")));
  });

  // The two owner rulings that moved --control-border were guarded here as a diff
  // against HEAD, which only held while 010 was uncommitted: once f3f5869 landed the
  // tree matched HEAD, the changed-value list went empty and the assertion failed for
  // having shipped. The durable form of the same guard is token-foundation.test.ts:85,
  // which pins both hexes by value and asserts there are exactly two, so re-pointing
  // this one would duplicate it.
});
