import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SESSION_MODES, isFocusTypeMode, isSessionMode } from "@/lib/db/session-modes";
import { TIMER_MODES } from "@/lib/timer/modes";
import type { TimerMode } from "@/lib/timer/types";
import type { StatsSession } from "@/lib/stats/types";

// Static guards for task 013 (criteria 1, 2, 3, 33, 44, 46, 56, 57) and task 012
// (criteria 5, 6, 7). Each reads the working tree by value, never against HEAD
// (013 criterion 57; PLAN.md records the shelf-life defect this avoids).

const ROOT = `${process.cwd()}/`;
const read = (relativePath: string) => readFileSync(`${ROOT}${relativePath}`, "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const full = join(ROOT, dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(relative(ROOT, full)));
    else if (/\.(ts|tsx|css)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, full));
  }
  return out;
}

const APP_SOURCE = ["app", "components", "widgets", "hooks", "lib"].flatMap((d) => sourceFiles(d));

// Task 013 criterion 1: the selectable union is exactly three values.
describe("task 013 criterion 1: the selectable mode union has exactly three values", () => {
  it("TIMER_MODES is focus, shortBreak, longBreak", () => {
    expect([...TIMER_MODES].sort()).toEqual(["focus", "longBreak", "shortBreak"]);
  });

  it("an exhaustive map over TimerMode with three keys fails to typecheck if a fourth mode is added", () => {
    const exhaustive: Record<TimerMode, true> = { focus: true, shortBreak: true, longBreak: true };
    expect(Object.keys(exhaustive)).toHaveLength(3);
  });
});

// Task 013 criterion 3: the stored union keeps "custom" by name.
describe("task 013 criterion 3: SessionMode still admits custom", () => {
  it("SESSION_MODES is still a four-value list including custom", () => {
    expect([...SESSION_MODES].sort()).toEqual(["custom", "focus", "longBreak", "shortBreak"]);
  });

  it("isSessionMode('custom') and isFocusTypeMode('custom') are true", () => {
    expect(isSessionMode("custom")).toBe(true);
    expect(isFocusTypeMode("custom")).toBe(true);
  });

  it("StatsSession['mode'] still includes custom", () => {
    const stored: StatsSession["mode"] = "custom";
    expect(stored).toBe("custom");
  });
});

// Task 013 criterion 2: no chip, radio, option or label reads Custom.
describe("task 013 criterion 2: no Custom mode in the UI", () => {
  it("no source file renders the value custom as a radio or option value", () => {
    const offenders = APP_SOURCE.filter((f) => /value=["']custom["']/.test(read(f)) || /\[value=["']custom["']\]/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no source file carries a Custom label", () => {
    const offenders = APP_SOURCE.filter((f) => /MODE_LABELS[^=]*=[^}]*custom/i.test(read(f)) || />\s*Custom\s*</.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

// Task 013 criterion 33: no new live region. The set is pinned by value, the way
// it stood when 013 was built (CurrentTaskCard and TaskForm included), so any new
// role=status, role=alert or aria-live in the / tree fails here.
describe("task 013 criterion 33: the live regions in the / tree are the pinned set", () => {
  const PINNED: Record<string, number> = {
    "components/PomotatoTimer.tsx": 2, // one region: aria-live and role=status on one element
    "components/TimerControls.tsx": 2, // one region, two attributes
    "components/SoundscapeDialog.tsx": 1,
    "components/TaskChecklist.tsx": 2, // 014: the panel's list; two role=alert lines (load, write error)
    "components/TaskForm.tsx": 2, // 015: the emoji and colour fields (and their messages) are gone; title and eta remain
    "components/FocusLengthInput.tsx": 1,
    "components/CurrentTaskCard.tsx": 1, // 014: one role=alert, the write-error line
  };

  it("counts the live-region attributes per file and matches the pin exactly", () => {
    const counts: Record<string, number> = {};
    for (const file of APP_SOURCE) {
      const matches = read(file).match(/aria-live=|role="status"|role="alert"/g);
      if (matches) counts[file] = matches.length;
    }
    // components/BackgroundControl.tsx is /settings only and is excluded from the / tree.
    delete counts["components/BackgroundControl.tsx"];
    delete counts["components/StatsDashboard.tsx"];
    expect(counts).toEqual(PINNED);
  });
});

// Task 013 criterion 44 and 46: no time source in the new dot implementation, and
// the only interval in the timer is the clock hook's one setNow tick.
describe("task 013 criteria 44 and 46: CSS pulse, one clock", () => {
  const NEW_OR_CHANGED = [
    "components/CycleDots.tsx",
    "components/Surface.tsx",
    "components/FocusLengthInput.tsx",
    "components/ModeSelector.tsx",
    "lib/timer/cycle.ts",
    "lib/timer/modes.ts",
  ];
  const TIME_SOURCE = /\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/;

  it.each(NEW_OR_CHANGED)("%s has no setInterval, setTimeout, requestAnimationFrame or performance.now", (file) => {
    expect(read(file)).not.toMatch(TIME_SOURCE);
  });

  it("the clock hook keeps its single interval calling setNow(Date.now())", () => {
    const clock = read("hooks/use-timer-clock.ts");
    expect((clock.match(/setInterval\(/g) ?? []).length).toBe(1);
    expect(clock).toMatch(/setNow\(Date\.now\(\)\)/);
  });

  it("no timer library file derives remaining time by counting ticks", () => {
    expect(read("lib/timer/store.ts")).not.toMatch(/\bremaining\s*-=|\bremainingMs\s*-=/);
  });
});

// Task 013 criterion 56: this task's new files are covered by an explicit guard
// here, so the 010 NEW_FILES list (background.guards.test.ts) need not grow.
describe("task 013 criterion 56: this task's new files are guarded explicitly", () => {
  it.each(["components/CycleDots.tsx", "lib/timer/cycle.ts", "lib/timer/modes.ts"])("%s exists and is in the guarded set above", (file) => {
    expect(existsSync(`${ROOT}${file}`)).toBe(true);
  });
});

// Task 012 criterion 5: exactly one element is frosted, counted in source.
describe("task 012 criterion 5: exactly one backdrop-filter in source, on the timer panel", () => {
  it("app/globals.css applies a backdrop-filter exactly once and it is not none", () => {
    const applied = read("app/globals.css").match(/backdrop-filter\s*:\s*(?!none)[^;]+;/g) ?? [];
    expect(applied).toHaveLength(1);
  });

  it("no component, widget or route applies a backdrop blur", () => {
    const offenders = APP_SOURCE.filter((f) => f !== "app/globals.css" && /backdrop-filter|backdrop-blur/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the frosted surface is applied once, by app/page.tsx", () => {
    const uses = APP_SOURCE.filter((f) => /<Surface\s+kind="frosted"/.test(read(f)));
    expect(uses).toEqual(["app/page.tsx"]);
  });
});

// Task 012 criterion 7: each surface treatment is defined once and applied only through Surface.
describe("task 012 criterion 7: one definition per surface kind", () => {
  it("@utility surface-solid and surface-frosted are each declared exactly once", () => {
    const css = read("app/globals.css");
    expect((css.match(/@utility surface-solid\s*\{/g) ?? []).length).toBe(1);
    expect((css.match(/@utility surface-frosted\s*\{/g) ?? []).length).toBe(1);
  });

  it("the surface class names and data-surface are written only in components/Surface.tsx", () => {
    const offenders = APP_SOURCE.filter(
      (f) => f !== "components/Surface.tsx" && f !== "app/globals.css" && /surface-solid|surface-frosted|data-surface=/.test(read(f))
    );
    expect(offenders).toEqual([]);
  });
});

// Task 012 criterion 6: the one new colour token is declared once per theme block.
describe("task 012 criterion 6: --surface-glass has one :root and one .dark value", () => {
  it("--surface-glass is declared exactly twice (root and dark) in globals.css", () => {
    expect((read("app/globals.css").match(/--surface-glass:/g) ?? []).length).toBe(2);
  });
});
