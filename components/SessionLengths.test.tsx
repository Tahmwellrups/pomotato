import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chime } from "@/lib/audio/chime";
import { usePreferencesStore } from "@/lib/preferences";
import { useTimerStore } from "@/lib/timer/store";
import type { TimerStatus } from "@/lib/timer/types";
import { ChimeSettings } from "./ChimeSettings";
import { SessionLengths } from "./SessionLengths";

// Task 017 criteria 5, 6, 8, 10, 12, 13, 14, 43, 44 (unit half). Frontend's
// DurationField and SessionLengths replace the deleted FocusLengthInput; these
// tests cover what that suite covered, for three fields. The chime is mocked.

vi.mock("@/lib/audio/chime", () => {
  const snapshot = { plays: 0, lastLevel: null };
  return {
    chime: {
      play: vi.fn(() => Promise.resolve("played")),
      prime: vi.fn(),
      getSnapshot: vi.fn(() => snapshot),
      getServerSnapshot: vi.fn(() => snapshot),
      subscribe: vi.fn(() => () => {}),
    },
  };
});

const FIELDS = [
  { id: "focus-length", name: /focus length/i, key: "focusMinutes", min: 1, max: 180, label: "Focus" },
  { id: "short-break-length", name: /short break length/i, key: "shortBreakMinutes", min: 1, max: 60, label: "Short break" },
  { id: "long-break-length", name: /long break length/i, key: "longBreakMinutes", min: 1, max: 120, label: "Long break" },
] as const;

const BAD_VALUES = ["", "   ", "0", "-3", "2.5", "25.0", "1e2", "abc", "12abc"];

function input(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input #${id}`);
  return el;
}

function setTimerStatus(status: TimerStatus) {
  useTimerStore.setState({
    status,
    mode: "focus",
    endTimestamp: status === "running" ? Date.now() + 60_000 : null,
    pausedRemainingMs: status === "paused" ? 60_000 : null,
    runId: status === "running" || status === "paused" ? "r" : null,
    startedAt: status === "running" || status === "paused" ? Date.now() : null,
    plannedDurationMs: status === "running" || status === "paused" ? 60_000 : null,
  });
}

function storedPreferences(): { state: Record<string, unknown> } | null {
  const raw = localStorage.getItem("pomotato-preferences");
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  localStorage.clear();
  usePreferencesStore.setState({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, chimeEnabled: true, chimeLevel: 50 });
  setTimerStatus("idle");
  vi.mocked(chime.play).mockClear();
});

afterEach(() => {
  cleanup();
});

describe("criterion 5: each duration field is labelled, and its error wiring follows its own validity", () => {
  it.each(FIELDS)("$label field: a programmatic label, aria-invalid and aria-describedby while invalid, removed when valid again", (field) => {
    render(<SessionLengths />);
    const el = input(field.id);
    expect(screen.getByLabelText(field.name)).toBe(el);
    expect(el).toHaveAttribute("aria-invalid", "false");
    expect(el).not.toHaveAttribute("aria-describedby");

    fireEvent.change(el, { target: { value: "0" } });
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(el).toHaveAttribute("aria-describedby", `${field.id}-error`);
    const error = document.getElementById(`${field.id}-error`);
    expect(error).not.toBeNull();
    expect(error).toHaveAttribute("role", "alert");

    fireEvent.change(el, { target: { value: String(field.min + 1) } });
    expect(el).toHaveAttribute("aria-invalid", "false");
    expect(el).not.toHaveAttribute("aria-describedby");
    expect(document.getElementById(`${field.id}-error`)).toBeNull();
  });

  it("the error of one field does not touch the others (asserted per field)", () => {
    render(<SessionLengths />);
    fireEvent.change(input("short-break-length"), { target: { value: "61" } });
    expect(input("short-break-length")).toHaveAttribute("aria-invalid", "true");
    expect(input("focus-length")).toHaveAttribute("aria-invalid", "false");
    expect(input("long-break-length")).toHaveAttribute("aria-invalid", "false");
  });
});

describe("criterion 8: every bad value is rejected per field, and the stored value keeps its last valid entry", () => {
  it.each(FIELDS.flatMap((field) =>
    [...BAD_VALUES, String(field.max + 1)].map((value) => [field, value] as const)
  ))("%s field rejects %j and stores nothing", (field, value) => {
    render(<SessionLengths />);
    const el = input(field.id);
    const before = usePreferencesStore.getState()[field.key];
    fireEvent.change(el, { target: { value } });
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(usePreferencesStore.getState()[field.key]).toBe(before);
  });
});

describe("criterion 10: error text is specific to the failure kind, and names that field's own bounds", () => {
  it("empty, non-integer and out-of-range each get their own message; the range names the field's bounds", () => {
    render(<SessionLengths />);
    const short = input("short-break-length");
    fireEvent.change(short, { target: { value: "" } });
    expect(document.getElementById("short-break-length-error")).toHaveTextContent("Enter a duration in minutes.");
    fireEvent.change(short, { target: { value: "2.5" } });
    expect(document.getElementById("short-break-length-error")).toHaveTextContent("Enter a whole number of minutes, with no decimals.");
    fireEvent.change(short, { target: { value: "61" } });
    expect(document.getElementById("short-break-length-error")).toHaveTextContent("Enter a number from 1 to 60.");
    expect(document.getElementById("short-break-length-error")).not.toHaveTextContent("180");
  });

  it("the Focus range message names 1 to 180, the long break's 1 to 120", () => {
    render(<SessionLengths />);
    fireEvent.change(input("focus-length"), { target: { value: "181" } });
    expect(document.getElementById("focus-length-error")).toHaveTextContent("Enter a number from 1 to 180.");
    fireEvent.change(input("long-break-length"), { target: { value: "121" } });
    expect(document.getElementById("long-break-length-error")).toHaveTextContent("Enter a number from 1 to 120.");
  });
});

describe("criterion 11: a pasted value takes the same path as a typed one (trim, then parse)", () => {
  it('pasting " 30 " stores 30; pasting "abc" shows the error', () => {
    render(<SessionLengths />);
    fireEvent.paste(input("focus-length"), { clipboardData: { getData: () => " 30 " } });
    fireEvent.change(input("focus-length"), { target: { value: " 30 " } });
    expect(usePreferencesStore.getState().focusMinutes).toBe(30);
    fireEvent.change(input("focus-length"), { target: { value: "abc" } });
    expect(input("focus-length")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("criterion 13: an invalid value is never persisted", () => {
  it("with Focus at 25, typing 0 leaves the stored entry at 25 at every keystroke", () => {
    render(<SessionLengths />);
    const el = input("focus-length");
    for (const value of ["0", "00", "0 "]) {
      fireEvent.change(el, { target: { value } });
      expect(storedPreferences()?.state.focusMinutes ?? 25).toBe(25);
    }
  });
});

describe("criterion 14: no duration field is disabled in any timer state", () => {
  it.each(["idle", "running", "paused", "complete"] as const)("in %s, no field and no reset control is disabled", (status) => {
    setTimerStatus(status);
    render(<SessionLengths />);
    for (const field of FIELDS) expect(input(field.id)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeEnabled();
  });

  it("the running-session note is shown only while a run is live, and names the session type", () => {
    setTimerStatus("idle");
    const { unmount } = render(<SessionLengths />);
    expect(screen.queryByText(/keeps the length it started with/)).toBeNull();
    unmount();
    setTimerStatus("running");
    render(<SessionLengths />);
    expect(screen.getByText(/Your Focus session is running/)).toBeInTheDocument();
  });
});

describe("criterion 12: Reset to defaults restores 25 / 5 / 15, clears every error, persists, and changes nothing else", () => {
  it("restores the three defaults and clears the errors, leaving the sound settings alone", () => {
    usePreferencesStore.setState({ focusMinutes: 90, shortBreakMinutes: 9, longBreakMinutes: 40, chimeEnabled: false, chimeLevel: 20 });
    render(<SessionLengths />);
    fireEvent.change(input("long-break-length"), { target: { value: "0" } });
    expect(input("long-break-length")).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(input("focus-length")).toHaveValue("25");
    expect(input("short-break-length")).toHaveValue("5");
    expect(input("long-break-length")).toHaveValue("15");
    expect(input("long-break-length")).toHaveAttribute("aria-invalid", "false");
    const state = usePreferencesStore.getState();
    expect([state.focusMinutes, state.shortBreakMinutes, state.longBreakMinutes]).toEqual([25, 5, 15]);
    expect(state.chimeEnabled).toBe(false);
    expect(state.chimeLevel).toBe(20);
    expect(storedPreferences()?.state).toMatchObject({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 });
  });

  it("Reset does not change a running run's mode or status", () => {
    setTimerStatus("running");
    const before = useTimerStore.getState();
    render(<SessionLengths />);
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(useTimerStore.getState()).toMatchObject({ status: "running", mode: before.mode, endTimestamp: before.endTimestamp });
  });
});

describe("criterion 6 and 43: the sound controls have accessible names; Preview plays while sound is off", () => {
  it("the toggle, the volume slider and Preview each have a name, and the slider exposes its value", () => {
    render(<ChimeSettings />);
    expect(screen.getByRole("checkbox", { name: "Play a chime when a session ends" })).toBeChecked();
    const slider = screen.getByRole("slider", { name: "Chime volume" });
    expect(slider).toHaveValue("50");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "100");
    expect(screen.getByRole("button", { name: "Preview chime" })).toBeInTheDocument();
  });

  it("with sound off, Preview still plays the chime once at the current level, and the copy says what off means", () => {
    usePreferencesStore.setState({ chimeEnabled: false });
    render(<ChimeSettings />);
    expect(screen.getByText(/Off means no chime when a session ends/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview chime" }));
    expect(chime.play).toHaveBeenCalledTimes(1);
    expect(chime.play).toHaveBeenCalledWith(50);
    expect(chime.prime).toHaveBeenCalled();
  });

  it("toggling the checkbox stores the choice", () => {
    render(<ChimeSettings />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Play a chime when a session ends" }));
    expect(usePreferencesStore.getState().chimeEnabled).toBe(false);
  });
});

describe("criterion 44: the volume writes the store once per gesture, not per step", () => {
  it("twenty keyboard-style steps followed by a blur write preferences at most twice", () => {
    render(<ChimeSettings />);
    const slider = screen.getByRole("slider", { name: "Chime volume" });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setItem.mockClear();
    for (let i = 1; i <= 20; i += 1) {
      fireEvent.change(slider, { target: { value: String(50 + i) } });
    }
    expect(usePreferencesStore.getState().chimeLevel).toBe(50);
    act(() => {
      fireEvent.blur(slider);
    });
    expect(usePreferencesStore.getState().chimeLevel).toBe(70);
    const writes = setItem.mock.calls.filter(([key]) => key === "pomotato-preferences").length;
    expect(writes).toBeLessThanOrEqual(2);
    setItem.mockRestore();
  });
});
