import { describe, expect, it } from "vitest";
import { DEFAULT_LEVEL, LEVEL_MAX, LEVEL_MIN, MAX_LAYER_GAIN, levelToGain } from "./gain";

// Task 011 criterion 18: the level-to-gain mapping is a pure exported function,
// tested with no AudioContext. Monotonic, 0 at the minimum, MAX_LAYER_GAIN at the
// maximum, and defined for every value the control can take.

describe("criterion 18: levelToGain is a pure, total, monotonic mapping", () => {
  it("is 0 at the minimum and MAX_LAYER_GAIN at the maximum", () => {
    expect(levelToGain(LEVEL_MIN)).toBe(0);
    expect(levelToGain(LEVEL_MAX)).toBe(MAX_LAYER_GAIN);
  });

  it("is defined and finite for every integer the control can take", () => {
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level += 1) {
      const gain = levelToGain(level);
      expect(Number.isFinite(gain), `level ${level}`).toBe(true);
      expect(gain, `level ${level}`).toBeGreaterThanOrEqual(0);
      expect(gain, `level ${level}`).toBeLessThanOrEqual(MAX_LAYER_GAIN);
    }
  });

  it("is strictly increasing across the control's range", () => {
    let previous = levelToGain(LEVEL_MIN);
    for (let level = LEVEL_MIN + 1; level <= LEVEL_MAX; level += 1) {
      const gain = levelToGain(level);
      expect(gain, `level ${level} vs ${level - 1}`).toBeGreaterThan(previous);
      previous = gain;
    }
  });

  it("clamps out-of-range and non-finite inputs instead of throwing or going negative", () => {
    expect(levelToGain(-1)).toBe(0);
    expect(levelToGain(-Infinity)).toBe(0);
    expect(levelToGain(LEVEL_MAX + 1)).toBe(MAX_LAYER_GAIN);
    expect(levelToGain(Infinity)).toBe(0);
    expect(levelToGain(NaN)).toBe(0);
  });

  it("is a pure function: the same input always gives the same output", () => {
    expect(levelToGain(DEFAULT_LEVEL)).toBe(levelToGain(DEFAULT_LEVEL));
    expect(levelToGain(DEFAULT_LEVEL)).toBeGreaterThan(0);
    expect(levelToGain(DEFAULT_LEVEL)).toBeLessThan(MAX_LAYER_GAIN);
  });
});
