import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useTimerStore } from "@/lib/timer/store";
import type { TimerStatus } from "@/lib/timer/types";
import { TimerControls } from "./TimerControls";

const HINT = "Press and hold Reset to confirm.";
const ORIGINAL_RESET = useTimerStore.getState().reset;

// jsdom has no PointerEvent, ResizeObserver or matchMedia. Only the fields the
// hold button reads are provided here.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}

beforeAll(() => {
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
});

const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

function setStatus(status: TimerStatus) {
  const running = status === "running" || status === "paused";
  act(() => {
    useTimerStore.setState({
      status,
      endTimestamp: status === "running" ? Date.now() + 60_000 : null,
      pausedRemainingMs: status === "paused" ? 60_000 : null,
      runId: running ? "run-under-test" : null,
      startedAt: running ? Date.now() : null,
    });
  });
}

function resetButton() {
  return screen.getByRole("button", { name: "Reset" });
}

// Presses, waits for the real hold duration, then releases. Awaited explicitly:
// chaining .then() onto React's act() thenable does not wait for the hold.
async function pointerPress(button: HTMLElement, holdMs: number) {
  fireEvent.pointerDown(button, { button: 0, pointerId: 1, isPrimary: true });
  await wait(holdMs);
  fireEvent.pointerUp(button, { button: 0, pointerId: 1, isPrimary: true });
}

let reset: Mock<() => void>;

beforeEach(() => {
  reset = vi.fn<() => void>();
  act(() => {
    useTimerStore.setState({ reset });
  });
  setStatus("running");
  render(<TimerControls />);
});

afterEach(() => {
  cleanup();
  act(() => {
    useTimerStore.setState({ reset: ORIGINAL_RESET });
  });
  setStatus("idle");
});

describe("Reset is a hold-to-confirm control", () => {
  it("has the accessible name Reset and its visible text is Reset", () => {
    expect(resetButton()).toHaveAccessibleName("Reset");
    expect(resetButton()).toHaveTextContent("Reset");
  });

  it("does not reset on a press shorter than the hold time", async () => {
    await pointerPress(resetButton(), 500);
    await wait(900);
    expect(reset).not.toHaveBeenCalled();
  });

  it("resets exactly once on a press longer than the hold time", async () => {
    await pointerPress(resetButton(), 1200);
    await wait(700);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("a short tap does not reset and surfaces the hold hint in a polite live region", async () => {
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    await pointerPress(resetButton(), 100);
    await wait(50);
    expect(reset).not.toHaveBeenCalled();
    const hint = screen.getByText(HINT);
    expect(hint).toHaveAttribute("role", "status");
    expect(hint).toHaveAttribute("aria-live", "polite");
  });

  it("releasing the Space key before the hold time cancels", async () => {
    const button = resetButton();
    fireEvent.keyDown(button, { key: " " });
    await wait(300);
    fireEvent.keyUp(button, { key: " " });
    await wait(900);
    expect(reset).not.toHaveBeenCalled();
  });

  it("Escape during a Space hold cancels it", async () => {
    const button = resetButton();
    fireEvent.keyDown(button, { key: " " });
    await wait(300);
    fireEvent.keyDown(button, { key: "Escape" });
    await wait(900);
    fireEvent.keyUp(button, { key: " " });
    expect(reset).not.toHaveBeenCalled();
  });

  it("holding Enter for the hold time resets exactly once", async () => {
    const button = resetButton();
    fireEvent.keyDown(button, { key: "Enter" });
    await wait(1000);
    fireEvent.keyUp(button, { key: "Enter" });
    await wait(100);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("Reset availability", () => {
  const statuses: TimerStatus[] = ["idle", "running", "paused", "complete"];
  for (const status of statuses) {
    it(`is enabled and visible while the timer is ${status}`, () => {
      setStatus(status);
      expect(resetButton()).toBeEnabled();
      expect(resetButton()).toBeVisible();
    });
  }
});
