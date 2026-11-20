import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GAUGE_STYLE_VALUES, type GaugeStylePreference } from "@/lib/preferences/schema";
import { Gauge } from "./Gauge";
import { GaugePreview, PREVIEW_PROGRESS } from "./GaugePreview";

// Task 022 criteria 1, 3, 6 and 50 (component half). The typed style list is the
// single source. For each id, the settings preview and the live timer must both
// paint that style's own layer. A new id with no entry here fails the first test.

// The element that only the named style paints. Vessel is the SloshGauge liquid
// (labelled "Time remaining"); glyph paints the digits through its overlay span.
const STYLE_MARKER: Record<GaugeStylePreference, string> = {
  vessel: '[aria-label="Time remaining"]',
  glyph: "span[data-time]",
};

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
  cleanup();
});

describe("criterion 1, 2: every id in the typed style list has a marker entry, a preview and a live renderer", () => {
  it("the marker map covers exactly the typed list, so a new id without a renderer fails here", () => {
    expect(Object.keys(STYLE_MARKER).sort()).toEqual([...GAUGE_STYLE_VALUES].sort());
    expect([...GAUGE_STYLE_VALUES]).toEqual(["vessel", "glyph"]);
  });

  for (const id of GAUGE_STYLE_VALUES) {
    it(`"${id}" has a preview card that paints its own layer`, () => {
      const { container, unmount } = render(<GaugePreview variant={id} />);
      const preview = container.querySelector(`[data-testid="gauge-preview-${id}"][data-gauge-style="${id}"]`);
      expect(preview).not.toBeNull();
      expect(container.querySelector(STYLE_MARKER[id])).not.toBeNull();
      unmount();
    });

    it(`"${id}" has a live renderer on the timer that paints its own layer`, () => {
      const { container, unmount } = render(<Gauge variant={id} progress={PREVIEW_PROGRESS} digits="15:00" />);
      const live = container.querySelector(`[data-testid="timer-gauge"][data-gauge-style="${id}"]`);
      expect(live).not.toBeNull();
      expect(container.querySelector(STYLE_MARKER[id])).not.toBeNull();
      unmount();
    });
  }
});

describe("criterion 6, 7: progress direction is the live convention, and the preview samples it at 60% remaining", () => {
  it("the preview sample is 0.6 and paints level 60 (remaining, not elapsed)", () => {
    expect(PREVIEW_PROGRESS).toBe(0.6);
    const { container } = render(<GaugePreview variant="vessel" />);
    const level = container.querySelector('[data-testid="gauge-preview-vessel"]')?.getAttribute("data-gauge-level");
    expect(level).toBe("60");
  });

  it("the live gauge at progress 0.6 paints the same level as the preview, not its inverse (40)", () => {
    const { container } = render(<Gauge variant="vessel" progress={0.6} digits="15:00" />);
    const level = container.querySelector('[data-testid="timer-gauge"]')?.getAttribute("data-gauge-level");
    expect(level).toBe("60");
  });

  it("the live gauge at the start of a session (progress 1) is full, and empty at progress 0", () => {
    const full = render(<Gauge variant="vessel" progress={1} digits="25:00" />);
    expect(full.container.querySelector('[data-testid="timer-gauge"]')?.getAttribute("data-gauge-level")).toBe("100");
    full.unmount();
    const empty = render(<Gauge variant="vessel" progress={0} digits="00:00" />);
    expect(empty.container.querySelector('[data-testid="timer-gauge"]')?.getAttribute("data-gauge-level")).toBe("0");
  });
});

describe("review F6: a non-finite progress never reaches the renderer", () => {
  it("NaN progress paints level 0 and never serialises NaN", () => {
    const { container } = render(<Gauge variant="vessel" progress={Number.NaN} digits="00:00" />);
    const level = container.querySelector('[data-testid="timer-gauge"]')?.getAttribute("data-gauge-level");
    expect(level).toBe("0");
    expect(level).not.toContain("NaN");
  });
});

