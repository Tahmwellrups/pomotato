import { describe, it, expect } from "vitest";
import {
  fullDurationMs,
  getRemainingMs,
  formatRemaining,
  parseMinutes,
  isDurationMinutes,
  type Durations,
} from "./time";
import {
  DEFAULT_FOCUS_MINUTES,
  DEFAULT_SHORT_BREAK_MINUTES,
  DEFAULT_LONG_BREAK_MINUTES,
  MS_PER_MINUTE,
} from "./constants";

// Task 017: every duration is read from one settings record. These are the defaults.
const D: Durations = {
  focusMinutes: DEFAULT_FOCUS_MINUTES,
  shortBreakMinutes: DEFAULT_SHORT_BREAK_MINUTES,
  longBreakMinutes: DEFAULT_LONG_BREAK_MINUTES,
};

describe("time.ts", () => {
  describe("fullDurationMs", () => {
    it("returns the configured Focus length in ms, at the 1 and 180 minute bounds", () => {
      expect(fullDurationMs("focus", { ...D, focusMinutes: 25 })).toBe(25 * MS_PER_MINUTE);
      expect(fullDurationMs("focus", { ...D, focusMinutes: 1 })).toBe(MS_PER_MINUTE);
      expect(fullDurationMs("focus", { ...D, focusMinutes: 180 })).toBe(180 * MS_PER_MINUTE);
    });

    it("returns the configured short break length, not a fixed constant (task 017 criterion 23)", () => {
      expect(fullDurationMs("shortBreak", { ...D, shortBreakMinutes: 9 })).toBe(9 * MS_PER_MINUTE);
      expect(fullDurationMs("shortBreak", { ...D, shortBreakMinutes: 60 })).toBe(60 * MS_PER_MINUTE);
    });

    it("returns the configured long break length, not a fixed constant (task 017 criterion 23)", () => {
      expect(fullDurationMs("longBreak", { ...D, longBreakMinutes: 1 })).toBe(MS_PER_MINUTE);
      expect(fullDurationMs("longBreak", { ...D, longBreakMinutes: 120 })).toBe(120 * MS_PER_MINUTE);
    });

    it("every duration is independent of the other two (criterion 23)", () => {
      const changedFocus = { ...D, focusMinutes: 50 };
      expect(fullDurationMs("shortBreak", changedFocus)).toBe(D.shortBreakMinutes * MS_PER_MINUTE);
      expect(fullDurationMs("longBreak", changedFocus)).toBe(D.longBreakMinutes * MS_PER_MINUTE);
      const changedShort = { ...D, shortBreakMinutes: 9 };
      expect(fullDurationMs("focus", changedShort)).toBe(D.focusMinutes * MS_PER_MINUTE);
      expect(fullDurationMs("longBreak", changedShort)).toBe(D.longBreakMinutes * MS_PER_MINUTE);
    });

    it("the defaults are 25, 5 and 15 minutes", () => {
      expect(D).toEqual({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 });
    });
  });

  describe("isDurationMinutes (one validator for every length)", () => {
    it("accepts whole minutes inside each field's own bounds", () => {
      expect(isDurationMinutes("focusMinutes", 180)).toBe(true);
      expect(isDurationMinutes("shortBreakMinutes", 60)).toBe(true);
      expect(isDurationMinutes("longBreakMinutes", 120)).toBe(true);
    });

    it("rejects the first out-of-range integer of each field", () => {
      expect(isDurationMinutes("focusMinutes", 181)).toBe(false);
      expect(isDurationMinutes("shortBreakMinutes", 61)).toBe(false);
      expect(isDurationMinutes("longBreakMinutes", 121)).toBe(false);
      expect(isDurationMinutes("shortBreakMinutes", 0)).toBe(false);
    });

    it("rejects fractions and non-numbers", () => {
      expect(isDurationMinutes("focusMinutes", 2.5)).toBe(false);
      expect(isDurationMinutes("focusMinutes", "25")).toBe(false);
      expect(isDurationMinutes("focusMinutes", null)).toBe(false);
    });
  });

  describe("getRemainingMs", () => {
    const fullMs = 25 * MS_PER_MINUTE;
    const now = 1000000;

    it("returns full duration when idle", () => {
      expect(getRemainingMs("idle", null, null, fullMs, now)).toBe(fullMs);
    });

    it("returns 0 when complete", () => {
      expect(getRemainingMs("complete", null, null, fullMs, now)).toBe(0);
    });

    it("returns clamped remaining time when running and end timestamp is in the future", () => {
      const endTimestamp = now + 10 * MS_PER_MINUTE;
      expect(getRemainingMs("running", endTimestamp, null, fullMs, now)).toBe(
        10 * MS_PER_MINUTE
      );
    });

    it("returns 0 when running but end timestamp has passed", () => {
      const endTimestamp = now - 1000;
      expect(getRemainingMs("running", endTimestamp, null, fullMs, now)).toBe(0);
    });

    it("clamps to fullMs when running and end timestamp is in the far future", () => {
      const endTimestamp = now + 30 * MS_PER_MINUTE; // more than fullMs
      expect(getRemainingMs("running", endTimestamp, null, fullMs, now)).toBe(fullMs);
    });

    it("returns null endTimestamp as full when running", () => {
      expect(getRemainingMs("running", null, null, fullMs, now)).toBe(fullMs);
    });

    it("returns frozen remaining when paused", () => {
      const pausedRemainingMs = 10 * MS_PER_MINUTE;
      expect(getRemainingMs("paused", null, pausedRemainingMs, fullMs, now)).toBe(
        pausedRemainingMs
      );
    });

    it("clamps paused remaining to [0, fullMs]", () => {
      expect(getRemainingMs("paused", null, -100, fullMs, now)).toBe(0);
      expect(getRemainingMs("paused", null, 30 * MS_PER_MINUTE, fullMs, now)).toBe(fullMs);
    });

    it("returns full when paused with null pausedRemainingMs", () => {
      expect(getRemainingMs("paused", null, null, fullMs, now)).toBe(fullMs);
    });
  });

  describe("formatRemaining", () => {
    it("formats 25 minutes as 25:00", () => {
      expect(formatRemaining(1500000)).toBe("25:00");
    });

    it("rounds up partial seconds for display", () => {
      // 1499200ms = 1499.2s, should round up to 1500s = 25:00
      expect(formatRemaining(1499200)).toBe("25:00");
      // 1500000ms = 1500s = 25:00
      expect(formatRemaining(1500000)).toBe("25:00");
    });

    it("shows 00:01 for 400ms remaining", () => {
      expect(formatRemaining(400)).toBe("00:01");
    });

    it("shows 00:00 only when remainingMs is 0 or negative", () => {
      expect(formatRemaining(0)).toBe("00:00");
      expect(formatRemaining(-1000)).toBe("00:00");
    });

    it("handles minutes over 59 without hours (e.g., 120:00)", () => {
      expect(formatRemaining(120 * MS_PER_MINUTE)).toBe("120:00");
      expect(formatRemaining(180 * MS_PER_MINUTE)).toBe("180:00");
    });

    it("zero-pads seconds to two digits", () => {
      // 1 second
      expect(formatRemaining(1000)).toBe("00:01");
      // 30 seconds
      expect(formatRemaining(30 * 1000)).toBe("00:30");
      // 1 minute 5 seconds
      expect(formatRemaining(65 * 1000)).toBe("01:05");
    });

    it("zero-pads minutes to at least two digits", () => {
      expect(formatRemaining(60 * 1000)).toBe("01:00");
      expect(formatRemaining(10 * 60 * 1000)).toBe("10:00");
    });

    it("rounds up properly at boundaries", () => {
      // 1ms: should round up to 1s = 00:01
      expect(formatRemaining(1)).toBe("00:01");
      // 999ms: should round up to 1s = 00:01
      expect(formatRemaining(999)).toBe("00:01");
      // 1000ms: exactly 1s = 00:01
      expect(formatRemaining(1000)).toBe("00:01");
      // 1001ms: should round up to 2s = 00:02
      expect(formatRemaining(1001)).toBe("00:02");
    });
  });

  describe("parseMinutes (focusMinutes)", () => {
    it("accepts valid integers from 1 to 180", () => {
      expect(parseMinutes("focusMinutes", "1")).toEqual({ ok: true, value: 1 });
      expect(parseMinutes("focusMinutes", "25")).toEqual({ ok: true, value: 25 });
      expect(parseMinutes("focusMinutes", "180")).toEqual({ ok: true, value: 180 });
      expect(parseMinutes("focusMinutes", "60")).toEqual({ ok: true, value: 60 });
    });

    it("rejects empty input", () => {
      const result = parseMinutes("focusMinutes", "");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Enter a duration in minutes.");
    });

    it("rejects whitespace-only input", () => {
      const result = parseMinutes("focusMinutes", "   ");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Enter a duration in minutes.");
    });

    it("rejects decimal values", () => {
      const result = parseMinutes("focusMinutes", "2.5");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("rejects negative numbers", () => {
      const result = parseMinutes("focusMinutes", "-5");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("rejects zero", () => {
      const result = parseMinutes("focusMinutes", "0");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Enter a number from");
    });

    it("rejects values above 180", () => {
      const result = parseMinutes("focusMinutes", "181");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Enter a number from");
    });

    it("rejects non-numeric text", () => {
      const result = parseMinutes("focusMinutes", "abc");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("rejects mixed alphanumeric", () => {
      const result = parseMinutes("focusMinutes", "25m");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("trims whitespace before validation", () => {
      expect(parseMinutes("focusMinutes", "  25  ")).toEqual({ ok: true, value: 25 });
    });
  });
});
