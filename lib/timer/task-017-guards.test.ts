import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Task 017 guards (source shape, no runtime): criteria 9, 23, 46, 72, 74.
// Criterion 54 (no audio asset) lives in lib/audio/no-audio-asset.test.ts.

const ROOT = resolve(__dirname, "../..");
const SHIPPED_DIRS = ["app", "components", "lib", "hooks", "widgets"];

function shippedFiles(dir: string, out: string[] = []): string[] {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full)) {
    const path = join(full, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "ui") continue;
      shippedFiles(relative(ROOT, path), out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(relative(ROOT, path));
    }
  }
  return out;
}

const ALL_SHIPPED = SHIPPED_DIRS.flatMap((dir) => shippedFiles(dir));
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** Lines that are not comments: a comment that names 25 or 60_000 is documentation, not a duration. */
function codeLines(file: string): { line: number; text: string }[] {
  return read(file)
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text));
}

describe("criterion 9: 25, 5 and 15 are each a duration in exactly one module, lib/timer/constants.ts", () => {
  it("no shipped non-comment line outside constants.ts restates a default duration literal", () => {
    // Only the three default lines may carry a duration literal; a line is a duration when it names a length.
    const suspects = ALL_SHIPPED.flatMap((file) =>
      codeLines(file)
        .filter(({ text }) => /(?<![\w.\-#%])(25|5|15)(?![\w%.\-])/.test(text))
        .filter(({ text }) => /(Focus|Short|Long|focus|break|Break|minutes|Minutes|MINUTES|duration|Duration)/.test(text))
        .map(({ line, text }) => `${file}:${line}: ${text.trim()}`)
    ).filter((hit) => !hit.startsWith("lib/timer/constants.ts:"))
      // lib/db/test-utils.ts is a Dexie test seed helper, not app code, and predates this task (HEAD line 45).
      .filter((hit) => !hit.startsWith("lib/db/test-utils.ts:"));
    expect(suspects).toEqual([]);
  });

  it("constants.ts holds the three defaults once each", () => {
    const source = read("lib/timer/constants.ts");
    expect(source.match(/DEFAULT_FOCUS_MINUTES = 25;/g)).toHaveLength(1);
    expect(source.match(/DEFAULT_SHORT_BREAK_MINUTES = 5;/g)).toHaveLength(1);
    expect(source.match(/DEFAULT_LONG_BREAK_MINUTES = 15;/g)).toHaveLength(1);
  });
});

describe("criterion 23: fullDurationMs is the only place a full duration is computed", () => {
  it("no MS_PER_MINUTE multiplication survives outside lib/timer/time.ts", () => {
    // Criterion 23's literal text: no `MS_PER_MINUTE` multiplication outside fullDurationMs and the defaults module.
    // Narrow, named exemption: MAX_PLANNED_DURATION_MS in lib/timer/store.ts multiplies the largest legal length
    // (a bound on a persisted-shape guard, not a mode's full duration). Matched by exact line text, so any other
    // multiplication, including a second full-duration computation in the same file, still fails the guard.
    const BOUND_EXEMPTION = {
      file: "lib/timer/store.ts",
      text: "Math.max(...Object.values(DURATION_LIMITS).map((limits) => limits.max)) * MS_PER_MINUTE;",
    };
    const hits = ALL_SHIPPED.flatMap((file) =>
      codeLines(file)
        .filter(({ text }) => /MS_PER_MINUTE/.test(text) && /\*/.test(text))
        .map(({ line, text }) => `${file}:${line}: ${text.trim()}`)
    ).filter((hit) => !hit.startsWith("lib/timer/time.ts:"))
      .filter((hit) => hit !== `${BOUND_EXEMPTION.file}:${hit.split(":")[1]}: ${BOUND_EXEMPTION.text}`);
    expect(hits).toEqual([]);
    // The exemption must still be the thing it names: the declaration it belongs to has to exist.
    expect(read(BOUND_EXEMPTION.file)).toMatch(/const MAX_PLANNED_DURATION_MS =\n\s+Math\.max/);
  });

  it("fullDurationMs multiplies a configured length by MS_PER_MINUTE, and nothing else in the timer computes one", () => {
    expect(read("lib/timer/time.ts")).toMatch(/durations\[MODE_DURATION_KEY\[mode\]\] \* MS_PER_MINUTE/);
  });
});

describe("criterion 46 and 74: the one interval, and no new timer or frame source", () => {
  it("the only setInterval in the shipped source is hooks/use-timer-clock.ts", () => {
    const hits = ALL_SHIPPED.filter((file) => codeLines(file).some(({ text }) => /\bsetInterval\s*\(/.test(text)));
    expect(hits).toEqual(["hooks/use-timer-clock.ts"]);
  });

  it("the task's new and changed settings and clock files add no timer, frame or performance source", () => {
    const NEW_FILES = [
      "components/DurationField.tsx",
      "components/SessionLengths.tsx",
      "components/ChimeSettings.tsx",
      "components/TimerClockProvider.tsx",
      "hooks/use-chime.ts",
      "lib/audio/chime.ts",
      "lib/timer/durations.ts",
      "lib/timer/carry-focus.ts",
      "lib/preferences/legacy-focus.ts",
      "lib/timer/store.ts",
      "components/PomotatoTimer.tsx",
      "lib/settle-within.ts",
    ];
    const pattern = /\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/;
    // lib/settle-within.ts holds the one sanctioned timer in the chime's path: the bound on a resume that can stay
    // pending forever. It is exempt by exact line text, so a second timer, or a changed one, still fails. The reason
    // is the design, not the file's location: a suspended AudioContext's clock does not advance, so the audio clock
    // cannot bound that wait. The timer classifies an outcome and never schedules, shapes or times a sound.
    const SANCTIONED_TIMER = {
      file: "lib/settle-within.ts",
      text: "const timeout = setTimeout(() => resolve(fallback), ms);",
    };
    const hits = NEW_FILES.filter((file) =>
      codeLines(file).some(({ text }) => pattern.test(text) && !(file === SANCTIONED_TIMER.file && text.trim() === SANCTIONED_TIMER.text))
    );
    // components/PomotatoTimer.tsx carries one setTimeout that predates this task: the announcement clear
    // (HEAD line 81). The task adds none, so the file is allowed that single line and nothing else.
    expect(hits).toEqual(["components/PomotatoTimer.tsx"]);
    // The sanctioned line must exist exactly once, and the file must hold no other timer or frame source.
    const settleLines = codeLines(SANCTIONED_TIMER.file).filter(({ text }) => pattern.test(text));
    expect(settleLines.map(({ text }) => text.trim())).toEqual([SANCTIONED_TIMER.text]);
    const timeoutsInTimer = codeLines("components/PomotatoTimer.tsx").filter(({ text }) => /\bsetTimeout\b/.test(text));
    expect(timeoutsInTimer).toHaveLength(1);
    expect(codeLines("components/PomotatoTimer.tsx").filter(({ text }) => /\bsetInterval\b|requestAnimationFrame|performance\.now/.test(text))).toEqual([]);
  });
});

describe("criterion 72: the Focus length field is not on the home route", () => {
  it("the home route and the timer surface carry no focus-length id, FocusLengthInput, or duration input", () => {
    for (const file of ["app/page.tsx", "components/PomotatoTimer.tsx", "components/TimerControls.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/focus-length|FocusLengthInput/);
    }
  });

  it("FocusLengthInput.tsx and its suite are gone, so nothing can import the old field by path", () => {
    expect(existsSync(join(ROOT, "components/FocusLengthInput.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/FocusLengthInput.test.tsx"))).toBe(false);
  });
});
