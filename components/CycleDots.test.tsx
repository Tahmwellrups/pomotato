import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimerStore } from "@/lib/timer/store";
import { usePreferencesStore } from "@/lib/preferences";
import { DEFAULT_FOCUS_MINUTES, MS_PER_MINUTE } from "@/lib/timer/constants";
import type { TimerMode, TimerStatus } from "@/lib/timer/types";
import { CycleDots } from "./CycleDots";

// Task 013 criteria 24, 25, 27, 31, 32, 33. Treatments are read from the
// data-treatment attribute, the same surface the e2e sweep reads.

function seed(mode: TimerMode, status: TimerStatus, cyclePosition: number, focusMinutes = 1) {
  // Task 017: the Focus length is a preference. Seeding it keeps the 1-minute runs these cases were written against.
  usePreferencesStore.setState({ focusMinutes });
  useTimerStore.setState({
    plannedDurationMs: status === "running" || status === "paused" ? focusMinutes * MS_PER_MINUTE : null,
    mode,
    status,
    cyclePosition,
    endTimestamp: status === "running" ? Date.now() + MS_PER_MINUTE : null,
    pausedRemainingMs: status === "paused" ? MS_PER_MINUTE : null,
    runId: status === "running" || status === "paused" ? "r-test" : null,
    startedAt: status === "running" || status === "paused" ? Date.now() : null,
  });
}

function treatments(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-treatment]")).map((el) => el.getAttribute("data-treatment") ?? "");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  seed("focus", "idle", 0, DEFAULT_FOCUS_MINUTES);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("criterion 24: four treatments, a fifth is a failure", () => {
  it("only the four named treatments are ever painted", () => {
    const allowed = new Set(["done", "pending", "active-running", "active-idle"]);
    const cases: [TimerMode, TimerStatus, number][] = [];
    for (const mode of ["focus", "shortBreak", "longBreak"] as const) {
      for (const status of ["idle", "running", "paused", "complete"] as const) {
        for (let p = 0; p <= 4; p += 1) cases.push([mode, status, p]);
      }
    }
    for (const [mode, status, p] of cases) {
      seed(mode, status, p);
      const { container, unmount } = render(<CycleDots />);
      const painted = treatments(container);
      expect(painted).toHaveLength(4);
      for (const treatment of painted) expect(allowed.has(treatment)).toBe(true);
      unmount();
    }
  });

  it("at position 4 all four dots are done and no dot is active, in Focus at every status", () => {
    for (const status of ["idle", "running", "paused", "complete"] as const) {
      seed("focus", status, 4);
      const { container, unmount } = render(<CycleDots />);
      expect(treatments(container)).toEqual(["done", "done", "done", "done"]);
      unmount();
    }
  });
});

describe("criterion 25: the pulse is scoped to a running Focus run; breaks show no active dot", () => {
  it.each([
    ["focus", "idle", 0, ["active-idle", "pending", "pending", "pending"]],
    ["focus", "running", 0, ["active-running", "pending", "pending", "pending"]],
    ["focus", "paused", 1, ["done", "active-idle", "pending", "pending"]],
    ["focus", "complete", 2, ["done", "done", "active-idle", "pending"]],
    ["shortBreak", "running", 1, ["done", "pending", "pending", "pending"]],
    ["shortBreak", "idle", 1, ["done", "pending", "pending", "pending"]],
    ["longBreak", "running", 4, ["done", "done", "done", "done"]],
  ] as const)("%s %s at position %i paints %j", (mode, status, p, expected) => {
    seed(mode, status, p);
    const { container } = render(<CycleDots />);
    expect(treatments(container)).toEqual(expected);
  });

  it("in a break mode no treatment is active-running or active-idle at any status", () => {
    for (const status of ["idle", "running", "paused", "complete"] as const) {
      seed("shortBreak", status, 2);
      const { container, unmount } = render(<CycleDots />);
      expect(treatments(container).some((t) => t.startsWith("active"))).toBe(false);
      unmount();
    }
  });
});

describe("criterion 27: the sequence with a 1-minute Focus length and a fake clock", () => {
  it("steps through the treatments the spec names, one assertion per step", () => {
    const { container } = render(<CycleDots />);
    const finish = () => act(() => useTimerStore.getState().completeIfExpired(useTimerStore.getState().endTimestamp!));
    expect(treatments(container)).toEqual(["active-idle", "pending", "pending", "pending"]);

    act(() => useTimerStore.getState().start());
    expect(treatments(container)).toEqual(["active-running", "pending", "pending", "pending"]);

    finish(); // Focus 1 done, short break running
    expect(useTimerStore.getState().mode).toBe("shortBreak");
    expect(treatments(container)).toEqual(["done", "pending", "pending", "pending"]);

    finish(); // short break done, Focus 2 running
    expect(treatments(container)).toEqual(["done", "active-running", "pending", "pending"]);
    finish(); // Focus 2 done
    expect(treatments(container)).toEqual(["done", "done", "pending", "pending"]);

    finish(); // short break done, Focus 3 running
    finish(); // Focus 3 done
    expect(treatments(container)).toEqual(["done", "done", "done", "pending"]);

    finish(); // short break done, Focus 4 running
    finish(); // Focus 4 done, long break running
    expect(useTimerStore.getState().mode).toBe("longBreak");
    expect(treatments(container)).toEqual(["done", "done", "done", "done"]);

    finish(); // long break done, Focus 1 running again
    expect(treatments(container)).toEqual(["active-running", "pending", "pending", "pending"]);

    act(() => useTimerStore.getState().pause());
    expect(treatments(container)).toEqual(["active-idle", "pending", "pending", "pending"]);
  });
});

describe("criterion 31: the dots are not interactive", () => {
  it("no focusable element, and clicking a dot changes no state", () => {
    seed("focus", "idle", 1);
    const { container } = render(<CycleDots />);
    expect(container.querySelectorAll("button,a[href],input,select,textarea,[tabindex],[role=button]")).toHaveLength(0);
    const before = useTimerStore.getState();
    for (const dot of Array.from(container.querySelectorAll("[data-treatment]"))) fireEvent.click(dot);
    const after = useTimerStore.getState();
    expect(after.mode).toBe(before.mode);
    expect(after.status).toBe(before.status);
    expect(after.cyclePosition).toBe(before.cyclePosition);
  });

  it("the dot group is aria-hidden", () => {
    const { container } = render(<CycleDots />);
    expect(container.querySelector('[aria-hidden="true"] [data-treatment]')).not.toBeNull();
  });
});

describe("criterion 32 and 33: one visually hidden sentence, no live region", () => {
  it("names the mode and the position, matches /\\b[0-4] of 4\\b/, and updates when the position changes", () => {
    seed("focus", "idle", 1);
    render(<CycleDots />);
    const sentence = screen.getByText(/Focus 2 of 4/);
    expect(sentence.textContent).toMatch(/\b[0-4] of 4\b/);
    expect(sentence).toHaveClass("sr-only");
    act(() => useTimerStore.setState({ cyclePosition: 2 }));
    expect(screen.getByText(/Focus 3 of 4/)).toBeInTheDocument();
  });

  it("a break names its mode and the focus runs done", () => {
    seed("shortBreak", "running", 2);
    render(<CycleDots />);
    expect(screen.getByText("Short break, 2 of 4 focus runs done").textContent).toMatch(/\b[0-4] of 4\b/);
  });

  it("Focus at position 4 says the long break is owed, and is not a live region", () => {
    seed("focus", "running", 4);
    const { container } = render(<CycleDots />);
    expect(screen.getByText(/long break owed/).textContent).toMatch(/\b4 of 4\b/);
    expect(container.querySelector('[aria-live],[role="status"],[role="alert"]')).toBeNull();
    expect(container.querySelector("p")?.getAttribute("aria-live")).toBeNull();
  });
});
