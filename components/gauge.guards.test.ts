import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Task 022 criteria 3, 4, 26 (source-level guards). These read the gauge source
// files and assert structural facts about their imports; each has a real
// expectation that fails if the rule is broken.

const ROOT = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");

const GAUGE_FILES = ["components/Gauge.tsx", "components/GaugePreview.tsx", "components/GaugeSettings.tsx", "components/TimerGauge.tsx"];

// Anything that reaches the timer logic, its store, or its hooks.
const TIMER_IMPORT = /from\s+["'][^"']*(lib\/timer|use-timer|timer\/store|timer-store|useTimerStore)[^"']*["']/;

describe("criterion 4: the preview imports nothing from the timer logic", () => {
  it("GaugePreview.tsx has no import from lib/timer, a timer hook, or the timer store", () => {
    const source = read("components/GaugePreview.tsx");
    expect(source).toMatch(/from\s+["']\.\/Gauge["']/);
    expect(source).not.toMatch(TIMER_IMPORT);
  });

  it("the shared Gauge (which the preview renders) imports no timer code either", () => {
    expect(read("components/Gauge.tsx")).not.toMatch(TIMER_IMPORT);
  });
});

describe("criterion 3: the preview is the live component, with no image asset or lookalike", () => {
  it("GaugePreview renders the shared Gauge and contains no image or asset reference", () => {
    const source = read("components/GaugePreview.tsx");
    expect(source).toMatch(/<Gauge\b/);
    expect(source).not.toMatch(/<img\b|next\/image|\.png|\.jpe?g|\.webp|\.gif/i);
  });
});

describe("criterion 26: no gauge code path writes to the timer store", () => {
  for (const file of GAUGE_FILES) {
    it(`${file} does not import the timer store or call its setters`, () => {
      const source = read(file);
      expect(source).not.toMatch(TIMER_IMPORT);
      expect(source).not.toMatch(/useTimerStore|setState\(|\.getState\(\)\.(start|pause|reset|skip|setRemaining|setDuration)/);
    });
  }
});
