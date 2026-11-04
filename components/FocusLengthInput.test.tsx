import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTimerStore } from "@/lib/timer/store";
import { DEFAULT_FOCUS_MINUTES, MS_PER_MINUTE } from "@/lib/timer/constants";
import { ModeSelector } from "./ModeSelector";
import { FocusLengthInput } from "./FocusLengthInput";

// Task 013 criteria 7-10 (the field), and criterion 1-2 and 49 (the chip row).

function seed(patch: Partial<ReturnType<typeof useTimerStore.getState>>) {
  useTimerStore.setState({
    mode: "focus",
    focusMinutes: DEFAULT_FOCUS_MINUTES,
    cyclePosition: 0,
    status: "idle",
    endTimestamp: null,
    pausedRemainingMs: null,
    runId: null,
    startedAt: null,
    ...patch,
  });
}

const field = () => screen.getByLabelText("Focus length (minutes)") as HTMLInputElement;

beforeEach(() => seed({}));
afterEach(() => cleanup());

describe("criterion 7: present in every mode, disabled only while a Focus run counts or is frozen", () => {
  it("has the label Focus length (minutes), never Custom", () => {
    render(<FocusLengthInput />);
    expect(field()).toHaveAttribute("id", "focus-length");
    expect(document.body.textContent).not.toMatch(/custom/i);
  });

  it.each([
    ["focus idle", { mode: "focus", status: "idle" }, false],
    ["short break running", { mode: "shortBreak", status: "running", endTimestamp: Date.now() + MS_PER_MINUTE }, false],
    ["long break running", { mode: "longBreak", status: "running", endTimestamp: Date.now() + MS_PER_MINUTE }, false],
    ["short break paused", { mode: "shortBreak", status: "paused", pausedRemainingMs: MS_PER_MINUTE }, false],
    ["focus running", { mode: "focus", status: "running", endTimestamp: Date.now() + MS_PER_MINUTE }, true],
    ["focus paused", { mode: "focus", status: "paused", pausedRemainingMs: MS_PER_MINUTE }, true],
  ] as const)("%s: disabled is %s", (_label, patch, disabled) => {
    seed(patch);
    render(<FocusLengthInput />);
    expect(field().disabled).toBe(disabled);
  });

  it("a write during a break lands in the store and does not alter the break's own end", () => {
    const end = Date.now() + 5 * MS_PER_MINUTE;
    seed({ mode: "shortBreak", status: "running", endTimestamp: end });
    render(<FocusLengthInput />);
    fireEvent.change(field(), { target: { value: "50" } });
    expect(useTimerStore.getState().focusMinutes).toBe(50);
    expect(useTimerStore.getState().endTimestamp).toBe(end);
    expect(useTimerStore.getState().mode).toBe("shortBreak");
  });
});

describe("criterion 8: accepted values are integers 1-180; the rest are rejected with the error still wired", () => {
  it("starts at 25", () => {
    render(<FocusLengthInput />);
    expect(field().value).toBe("25");
  });

  it.each(["", "0", "-3", "2.5", "181", "abc"])("rejects %j, keeps the last valid length, and wires aria-invalid and aria-describedby", (raw) => {
    render(<FocusLengthInput />);
    fireEvent.change(field(), { target: { value: "40" } });
    fireEvent.change(field(), { target: { value: raw } });
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAttribute("aria-describedby", "focus-length-error");
    expect(document.getElementById("focus-length-error")).toHaveTextContent(/.+/);
    expect(useTimerStore.getState().focusMinutes).toBe(40);
  });

  it("accepts the 1 and 180 bounds", () => {
    render(<FocusLengthInput />);
    fireEvent.change(field(), { target: { value: "1" } });
    expect(useTimerStore.getState().focusMinutes).toBe(1);
    fireEvent.change(field(), { target: { value: "180" } });
    expect(useTimerStore.getState().focusMinutes).toBe(180);
    expect(field()).toHaveAttribute("aria-invalid", "false");
  });
});

describe("criterion 9 and 10: a valid change updates the store; a Focus run's length never changes", () => {
  it("entering 50 while idle sets the store to 50", () => {
    render(<FocusLengthInput />);
    fireEvent.change(field(), { target: { value: "50" } });
    expect(useTimerStore.getState().focusMinutes).toBe(50);
  });

  it("setFocusMinutes is a no-op while a Focus run is running", () => {
    seed({ mode: "focus", status: "running", endTimestamp: Date.now() + MS_PER_MINUTE, focusMinutes: 25 });
    act(() => useTimerStore.getState().setFocusMinutes(50));
    expect(useTimerStore.getState().focusMinutes).toBe(25);
  });
});

describe("criteria 1, 2 and 49: three chips, Focus, Short break and Long break; the native radios survive", () => {
  it("renders exactly three radios labelled Focus, Short break and Long break, with no Custom", () => {
    render(<ModeSelector />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["focus", "shortBreak", "longBreak"]);
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Short break")).toBeInTheDocument();
    expect(screen.getByText("Long break")).toBeInTheDocument();
    expect(screen.queryByText(/custom/i)).toBeNull();
  });

  it("the legend and the native checked state carry the selection", () => {
    render(<ModeSelector />);
    expect(screen.getByText("Timer mode").tagName).toBe("LEGEND");
    expect((screen.getByRole("radio", { name: "Focus" }) as HTMLInputElement).checked).toBe(true);
  });
});
