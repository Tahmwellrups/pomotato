import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// Task 011 criterion 7, amended 2026-10-27 after the owner ruled that rain ships as
// a licensed recording (DECISIONS 2026-10-27). The criterion was "no audio asset
// exists"; it is now "exactly the licensed asset exists, and only files.ts decodes".
// Loosening it to "any audio file is fine" would have thrown away the guard, so the
// allowed set is enumerated: a second asset, an unlicensed one, or a decode call
// anywhere but the loader still fails. The search runs over git's own file list
// (tracked plus untracked, minus ignored), so it covers public/ and anything else.
// Source rules apply to code files only: prose in docs/ names these APIs on purpose.
// The search is proven live: it runs against a scratch directory seeded with one
// dummy match per rule, and every rule must catch its dummy.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDIO_EXTENSION = /\.(?:wav|mp3|ogg|oga|flac|webm|m4a|aac|opus|aiff|mid)$/i;
// The one asset the owner licensed. Provenance is in docs/DECISIONS.md. Any other
// audio file in the repo is a failure, including an unused leftover in public/.
const ALLOWED_AUDIO_ASSETS = ["public/sounds/rain-865572.m4a"];

// decodeAudioData is how a file-backed layer exists at all, so it is permitted in
// the loader and nowhere else.
const DECODE_EXEMPT_FILE = "lib/audio/files.ts";

const SOURCE_RULES: [string, RegExp][] = [
  ["an <audio> element", new RegExp(["<", "audio[\\s>]"].join(""))],
  ["new Audio(", new RegExp(["new\\s+Audio", "\\("].join(""))],
  ["createMediaElementSource", /createMediaElementSource/],
  ["decodeAudioData", /decodeAudioData/],
  ["an audio data URI", /data:audio\//],
  ["a base64 audio literal", /(?:UklGR|SUQz|T2dn)[A-Za-z0-9+/=]{20,}/],
];

function listFiles(root: string): string[] {
  return execSync("git ls-files -co --exclude-standard", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((line) => line.length > 0);
}

interface Finding {
  file: string;
  rule: string;
}

function scan(root: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (AUDIO_EXTENSION.test(file)) findings.push({ file, rule: "audio file extension" });
    if (!/\.(?:ts|tsx|js|jsx|mjs|html)$/.test(file)) continue;
    // Test files name the forbidden APIs to assert on them, and do not ship. Only shipped source is searched.
    if (/\.test\.tsx?$/.test(file)) continue;
    const text = readFileSync(join(root, file), "utf8");
    for (const [rule, pattern] of SOURCE_RULES) if (pattern.test(text)) findings.push({ file, rule });
  }
  return findings;
}

const scratch = mkdtempSync(join(tmpdir(), "pomotato-011-scan-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("criterion 7: the repo holds no audio asset and no audio element, fetch or decode path", () => {
  it("the only audio file in the repo is the one licensed asset", () => {
    const found = scan(ROOT, listFiles(ROOT))
      .filter((f) => f.rule === "audio file extension")
      .map((f) => f.file)
      .sort();
    expect(found).toEqual([...ALLOWED_AUDIO_ASSETS].sort());
  });

  it("no source file carries an audio element, a media source node or an audio data URI, and only the loader decodes", () => {
    const findings = scan(ROOT, listFiles(ROOT))
      .filter((f) => f.rule !== "audio file extension")
      .filter((f) => !(f.rule === "decodeAudioData" && f.file === DECODE_EXEMPT_FILE));
    expect(findings).toEqual([]);
  });

  it("the decode exemption is narrow: it names one file, and that file exists", () => {
    expect(listFiles(ROOT)).toContain(DECODE_EXEMPT_FILE);
    const decodes = scan(ROOT, listFiles(ROOT)).filter((f) => f.rule === "decodeAudioData");
    expect(decodes.map((f) => f.file)).toEqual([DECODE_EXEMPT_FILE]);
  });

  it("the search is live: a dummy match for every rule in a scratch tree is caught", () => {
    mkdirSync(join(scratch, "public"), { recursive: true });
    writeFileSync(join(scratch, "public", "dummy-rain.wav"), "");
    writeFileSync(join(scratch, "a.ts"), `const el = new Audio("x");`);
    writeFileSync(join(scratch, "b.tsx"), `const c = ctx.createMediaElementSource(el);`);
    writeFileSync(join(scratch, "c.ts"), `ctx.decodeAudioData(buf);`);
    writeFileSync(join(scratch, "d.tsx"), "<audio src=\"x\" />");
    writeFileSync(join(scratch, "e.ts"), `const u = "data:audio/wav;base64,AAAA";`);
    writeFileSync(join(scratch, "f.ts"), `const b = "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";`);
    const files = ["public/dummy-rain.wav", "a.ts", "b.tsx", "c.ts", "d.tsx", "e.ts", "f.ts"];
    const caught = new Set(scan(scratch, files).map((f) => f.rule));
    expect([...caught].sort()).toEqual(
      ["an <audio> element", "new Audio(", "createMediaElementSource", "decodeAudioData", "an audio data URI", "a base64 audio literal", "audio file extension"].sort(),
    );
  });

  it("the feature's own files are in the scanned set", () => {
    const files = listFiles(ROOT);
    for (const file of ["lib/audio/engine.ts", "lib/audio/sources.ts", "components/SoundscapeDialog.tsx", "hooks/use-soundscape.ts"]) {
      expect(files).toContain(file);
    }
  });
});
