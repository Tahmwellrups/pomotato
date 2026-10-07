import { describe, it, expect } from "vitest";
import {
  fullDurationMs,
  getRemainingMs,
  formatRemaining,
  parseCustomMinutes,
} from "./time";
import {
  FOCUS_MINUTES,
  SHORT_BREAK_MINUTES,
  LONG_BREAK_MINUTES,
  MS_PER_MINUTE,
} from "./constants";

describe("time.ts", () => {
  describe("fullDurationMs", () => {
    it("returns focus duration in ms", () => {
      expect(fullDurationMs("focus", 25)).toBe(FOCUS_MINUTES * MS_PER_MINUTE);
      expect(fullDurationMs("focus", 25)).toBe(25 * 60_000);
    });

    it("returns short break duration in ms", () => {
      expect(fullDurationMs("shortBreak", 25)).toBe(SHORT_BREAK_MINUTES * MS_PER_MINUTE);
      expect(fullDurationMs("shortBreak", 25)).toBe(5 * 60_000);
    });

    it("returns long break duration in ms", () => {
      expect(fullDurationMs("longBreak", 25)).toBe(LONG_BREAK_MINUTES * MS_PER_MINUTE);
      expect(fullDurationMs("longBreak", 25)).toBe(15 * 60_000);
    });

    it("returns custom duration based on customMinutes parameter", () => {
      expect(fullDurationMs("custom", 30)).toBe(30 * MS_PER_MINUTE);
      expect(fullDurationMs("custom", 1)).toBe(1 * MS_PER_MINUTE);
      expect(fullDurationMs("custom", 180)).toBe(180 * MS_PER_MINUTE);
    });

    it("ignores customMinutes for non-custom modes", () => {
      expect(fullDurationMs("focus", 100)).toBe(FOCUS_MINUTES * MS_PER_MINUTE);
      expect(fullDurationMs("shortBreak", 200)).toBe(SHORT_BREAK_MINUTES * MS_PER_MINUTE);
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

  describe("parseCustomMinutes", () => {
    it("accepts valid integers from 1 to 180", () => {
      expect(parseCustomMinutes("1")).toEqual({ ok: true, value: 1 });
      expect(parseCustomMinutes("25")).toEqual({ ok: true, value: 25 });
      expect(parseCustomMinutes("180")).toEqual({ ok: true, value: 180 });
      expect(parseCustomMinutes("60")).toEqual({ ok: true, value: 60 });
    });

    it("rejects empty input", () => {
      const result = parseCustomMinutes("");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Enter a duration in minutes.");
    });

    it("rejects whitespace-only input", () => {
      const result = parseCustomMinutes("   ");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Enter a duration in minutes.");
    });

    it("rejects decimal values", () => {
      const result = parseCustomMinutes("2.5");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("rejects negative numbers", () => {
      const result = parseCustomMinutes("-5");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("rejects zero", () => {
      const result = parseCustomMinutes("0");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Enter a number from");
    });

    it("rejects values above 180", () => {
      const result = parseCustomMinutes("181");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Enter a number from");
    });

    it("rejects non-numeric text", () => {
      const result = parseCustomMinutes("abc");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("rejects mixed alphanumeric", () => {
      const result = parseCustomMinutes("25m");
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("Enter a whole number of minutes, with no decimals.");
    });

    it("trims whitespace before validation", () => {
      expect(parseCustomMinutes("  25  ")).toEqual({ ok: true, value: 25 });
    });
  });
});
