import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { TimerGauge, gaugeLevel } from "./TimerGauge";

// jsdom provides neither matchMedia nor ResizeObserver; the vendored gauge reads both.
beforeAll(() => {
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
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

const FULL_MS = 1_500_000;

describe("gaugeLevel", () => {
  it("maps full, half and empty remaining time to 100, 50 and 0", () => {
    expect(gaugeLevel(FULL_MS, FULL_MS)).toBe(100);
    expect(gaugeLevel(FULL_MS / 2, FULL_MS)).toBe(50);
    expect(gaugeLevel(0, FULL_MS)).toBe(0);
  });

  it("clamps out-of-range remaining time and a zero-length session", () => {
    expect(gaugeLevel(FULL_MS * 2, FULL_MS)).toBe(100);
    expect(gaugeLevel(-5, FULL_MS)).toBe(0);
    expect(gaugeLevel(10, 0)).toBe(0);
  });
});

describe("TimerGauge", () => {
  it("carries no level before the timer has hydrated", () => {
    render(<TimerGauge remainingMs={FULL_MS} fullMs={FULL_MS} ready={false} />);
    const gauge = screen.getByTestId("timer-gauge");
    expect(gauge).toHaveAttribute("data-gauge-ready", "false");
    expect(gauge).not.toHaveAttribute("data-gauge-level");
  });

  it("reports the rounded level derived from the same remaining and full durations", () => {
    render(<TimerGauge remainingMs={1_450_000} fullMs={FULL_MS} ready />);
    expect(screen.getByTestId("timer-gauge")).toHaveAttribute("data-gauge-level", "97");
  });

  it("re-derives the level on every render, including a new full duration", () => {
    const { rerender } = render(<TimerGauge remainingMs={FULL_MS} fullMs={FULL_MS} ready />);
    const gauge = screen.getByTestId("timer-gauge");
    expect(gauge).toHaveAttribute("data-gauge-level", "100");

    rerender(<TimerGauge remainingMs={FULL_MS / 2} fullMs={FULL_MS} ready />);
    expect(gauge).toHaveAttribute("data-gauge-level", "50");

    rerender(<TimerGauge remainingMs={0} fullMs={FULL_MS} ready />);
    expect(gauge).toHaveAttribute("data-gauge-level", "0");

    // A fresh custom session reads full against its own duration, not the old fraction.
    rerender(<TimerGauge remainingMs={600_000} fullMs={600_000} ready />);
    expect(gauge).toHaveAttribute("data-gauge-level", "100");
  });

  it("is hidden from assistive tech, holds no text and is not focusable", () => {
    render(<TimerGauge remainingMs={FULL_MS} fullMs={FULL_MS} ready />);
    const gauge = screen.getByTestId("timer-gauge");
    expect(gauge).toHaveAttribute("aria-hidden", "true");
    expect(gauge.textContent?.trim()).toBe("");
    expect(gauge.querySelectorAll("[tabindex], button, input, a")).toHaveLength(0);
  });

  it("exposes the liquid and glass colours it resolved from the tokens", () => {
    document.documentElement.style.setProperty("--gauge-liquid", "#123456");
    document.documentElement.style.setProperty("--popover", "#fedcba");
    render(<TimerGauge remainingMs={FULL_MS} fullMs={FULL_MS} ready />);
    const gauge = screen.getByTestId("timer-gauge");
    expect(gauge).toHaveAttribute("data-liquid-color", "#123456");
    expect(gauge).toHaveAttribute("data-glass-color", "#fedcba");
  });
});
