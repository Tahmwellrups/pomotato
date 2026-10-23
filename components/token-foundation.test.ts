/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TASK_COLOR_HEX } from "./task-palette-colors";
import { modeChipVariants } from "./ui/mode-chip";

// Task 007 QA: source-level checks for criteria that a browser run does not reach
// directly. Browser measurements live in e2e/token-chip-cue.spec.ts and
// e2e/token-task-surface.spec.ts; these check the code and CSS text.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative: string) => readFileSync(resolve(ROOT, relative), "utf8");

describe("task 007 criterion 5: the mode chip carries no dead hover utility", () => {
  it("mode-chip.tsx contains no hover: utility", () => {
    expect(read("components/ui/mode-chip.tsx")).not.toMatch(/hover:/);
  });

  it("the chip variants carry no fill, border or radius (flat text, criterion 3)", () => {
    const checked = modeChipVariants({ checked: true });
    const unchecked = modeChipVariants({ checked: false });
    for (const classes of [checked, unchecked]) {
      expect(classes).not.toMatch(/\bbg-/);
      expect(classes).not.toMatch(/\bborder(?:-|\s|$)/);
      expect(classes).not.toMatch(/\brounded/);
    }
  });

  it("the non-colour cue is weight: bold when checked, normal when not (criterion 1)", () => {
    expect(modeChipVariants({ checked: true })).toMatch(/\bfont-bold\b/);
    expect(modeChipVariants({ checked: false })).toMatch(/\bfont-normal\b/);
    expect(modeChipVariants({ checked: false })).not.toMatch(/\bfont-bold\b/);
  });
});

describe("task 007 criterion 22 and ModeSelector: the cue moved off the container", () => {
  it("ModeSelector no longer puts font-bold on the container, so unchecked chips are not forced bold", () => {
    const source = read("components/ModeSelector.tsx");
    const container = source.match(/<div className="([^"]*)"/);
    expect(container).not.toBeNull();
    expect(container![1]).not.toMatch(/\bfont-bold\b/);
  });

  it("StatsButton keeps its named export and has no default export", () => {
    const source = read("components/StatsButton.tsx");
    expect(source).toMatch(/export function StatsButton\(/);
    expect(source).not.toMatch(/export default/);
    expect(source).toContain('aria-label="Focus stats"');
    expect(source).toContain('href="/stats"');
  });
});

describe("task 007 criterion 16: the swatch values and their comment", () => {
  // Pinned from d7d1bec. Owner palette decision: changing a value is a finding, not an edit.
  const PINNED: Record<string, string> = {
    potato: "#8a5a2b",
    tomato: "#c23b22",
    mint: "#3f9b6c",
    sky: "#2f7fb8",
    lavender: "#7a5fb0",
    sunflower: "#8f6508",
    blush: "#c05a74",
    slate: "#5b6672",
  };

  it("every TASK_COLOR_HEX value is unchanged from d7d1bec", () => {
    expect(TASK_COLOR_HEX).toEqual(PINNED);
  });

  it("the docstring names --card as the ground the swatches are measured against, not white", () => {
    const source = read("components/task-palette-colors.ts");
    expect(source).toContain("--card");
    expect(source).not.toMatch(/white, `#ffffff`/);
    expect(source).toContain("mint 3.14");
  });
});

describe("task 007 criteria 18 and 19: the interactive-boundary token and its comment", () => {
  const css = () => read("app/globals.css");

  it("defines --control-border once, as #88837e, in the root block", () => {
    const matches = css().match(/--control-border:\s*[^;]+;/g) ?? [];
    expect(matches).toEqual(["--control-border: #88837e;"]);
  });

  it("maps --color-control-border inside the existing @theme inline block", () => {
    expect(css()).toMatch(/--color-control-border:\s*var\(--control-border\);/);
  });

  it("carries the three parts: the role, why --border does not fit, and the milestone 4 dark obligation", () => {
    const block = css().match(/\/\*((?:(?!\*\/)[\s\S])*?)\*\/\s*--control-border:/);
    expect(block).not.toBeNull();
    const comment = block![0];
    expect(comment).toMatch(/identifies a control|boundary of a control/i);
    expect(comment).toMatch(/1\.36:1/);
    expect(comment).toMatch(/1\.43:1/);
    expect(comment).toMatch(/shared\s+app-wide/);
    expect(comment).toMatch(/Milestone 4 MUST give this a value in the \.dark block/);
  });

  it("--border and --input keep their original value #d6d3d1", () => {
    expect(css()).toMatch(/--border:\s*#d6d3d1;/);
    expect(css()).toMatch(/--input:\s*#d6d3d1;/);
  });
});

describe("task 007 criterion 44: no any in the changed code", () => {
  const CHANGED = [
    "components/TaskForm.tsx",
    "components/TaskRow.tsx",
    "components/TaskList.tsx",
    "components/TaskListDialog.tsx",
    "components/TaskColorDot.tsx",
    "components/StatsButton.tsx",
    "components/CustomDurationInput.tsx",
    "components/ModeSelector.tsx",
    "components/ui/mode-chip.tsx",
    "components/task-palette-colors.ts",
  ];

  for (const file of CHANGED) {
    it(`${file} has no any type`, () => {
      expect(read(file)).not.toMatch(/:\s*any\b|<any>|\bas any\b/);
    });
  }
});
