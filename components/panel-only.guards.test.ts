/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 015 grep-level guards: criteria 3, 5, 11, 16, 18 and 42. Each is pinned by value (no diff
// against HEAD, criterion 46). Behaviour lives in e2e/task-panel.spec.ts.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const APP_CODE = ["app", "components", "widgets", "hooks", "lib"].flatMap((dir) => walk(dir));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("task 015 criterion 11: the dialog and its two components are gone and nothing imports them", () => {
  for (const gone of ["components/TaskListDialog.tsx", "components/TaskList.tsx", "components/TaskRow.tsx"]) {
    it(`${gone} is absent`, () => {
      expect(existsSync(join(ROOT, gone))).toBe(false);
    });
  }

  it("no app code imports the three deleted modules", () => {
    const offenders = APP_CODE.filter((rel) => /from\s+["'][^"']*\/(TaskListDialog|TaskList|TaskRow)["']/.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it("no task-flow component renders role=\"dialog\"", () => {
    for (const rel of ["widgets/TaskPanel.tsx", "components/TaskChecklist.tsx", "components/TaskChecklistRow.tsx", "components/TaskPanelToggle.tsx"]) {
      expect(read(rel)).not.toMatch(/role=["']dialog["']/);
    }
  });
});

describe("task 015 criterion 16: exactly one DndContext in the app, and it is the panel's", () => {
  it("the only DndContext in app, components and widgets is in the checklist", () => {
    const hits = ["app", "components", "widgets"]
      .flatMap((dir) => walk(dir))
      .filter((rel) => /<DndContext\b/.test(read(rel)));
    expect(hits).toEqual(["components/TaskChecklist.tsx"]);
  });
});

describe("task 015 criterion 3: no new dependency is imported and nothing reaches into the timer, stats or audio code", () => {
  it("no file imports lucide-react", () => {
    expect(APP_CODE.filter((rel) => /from\s+["']lucide-react["']/.test(read(rel)))).toEqual([]);
  });

  it("the panel's preference key is not referenced under lib/timer, lib/stats or lib/audio, or in the stats page", () => {
    const scanned = [...walk("lib/timer"), ...walk("lib/stats"), ...walk("lib/audio"), ...walk("app/stats")];
    expect(scanned.filter((rel) => /taskPanelVisible|TASK_PANEL_ATTRIBUTE|setTaskPanelVisible/.test(read(rel)))).toEqual([]);
  });
});

describe("task 015 criterion 5: the type carries no palette name and the emoji/colour validators are gone", () => {
  it("lib/db/index.ts exports no palette name", () => {
    expect(read("lib/db/index.ts")).not.toMatch(/PALETTE|PaletteColorId|isPaletteColorId|DEFAULT_PALETTE_COLOR_ID/);
  });

  it("the palette module and the two validators are deleted from lib/db", () => {
    expect(existsSync(join(ROOT, "lib/db/palette.ts"))).toBe(false);
    expect(read("lib/db/validation.ts")).not.toMatch(/validateEmoji|validateColorId|isEmojiGraphemeCluster/);
  });

  it("ValidationIssue's field is exactly title or eta", () => {
    expect(read("lib/db/types.ts")).toMatch(/field:\s*"title"\s*\|\s*"eta"/);
  });
});

describe("task 015 criterion 18: no rendered copy names the tasks button or says pin", () => {
  it("the panel's empty line no longer names a control that does not exist", () => {
    for (const rel of APP_CODE) {
      expect(read(rel), rel).not.toMatch(/Add one with the tasks button|tasks button/);
    }
  });

  it("no rendered copy in the task flow says pin", () => {
    for (const rel of ["widgets/TaskPanel.tsx", "components/TaskChecklist.tsx", "components/TaskChecklistRow.tsx", "components/TaskForm.tsx"]) {
      expect(read(rel), rel).not.toMatch(/>[^<]*\bpin\b[^<]*</i);
    }
  });
});

describe("task 015 criterion 42: no timer or frame source in the files this task adds or changes", () => {
  const TOUCHED = [
    "widgets/TaskPanel.tsx",
    "components/TaskChecklist.tsx",
    "components/TaskChecklistRow.tsx",
    "components/TaskPanelToggle.tsx",
    "components/TaskForm.tsx",
    "widgets/BottomControls.tsx",
  ];
  for (const rel of TOUCHED) {
    it(`${rel} has no setInterval, setTimeout or requestAnimationFrame`, () => {
      expect(read(rel)).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    });
  }
});

describe("file hygiene for the deleted colour dot", () => {
  it("no file in app code still imports TaskColorDot or task-palette-colors", () => {
    expect(APP_CODE.filter((rel) => /TaskColorDot|task-palette-colors/.test(read(rel)))).toEqual([]);
    expect(statSync(ROOT).isDirectory()).toBe(true);
  });
});
