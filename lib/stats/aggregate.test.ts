import { describe, it, expect } from "vitest";
import { aggregateStats, getStatsRange, daysInMonth } from "./aggregate";
import type { StatsSession } from "./types";

describe("stats: aggregateStats", () => {
  // Helper to create test sessions
  function session(
    endedAt: number,
    mode: "focus" | "shortBreak" | "longBreak" | "custom" = "focus",
    plannedDurationMs: number = 25 * 60 * 1000,
    taskId: string | null = null,
    taskTitle: string | null = null
  ): StatsSession {
    return { mode, endedAt, plannedDurationMs, taskId, taskTitle };
  }

  describe("day view", () => {
    it("returns 24 buckets keyed by local hour", () => {
      // Use a fixed time on 2026-10-09 at noon UTC, in US/Eastern (UTC-4)
      const nowMs = new Date("2026-10-09T12:00:00Z").getTime();

      const result = aggregateStats("day", { sessions: [], nowMs, timeZone: "US/Eastern" });

      expect(result.buckets).toHaveLength(24);
      expect(result.buckets[0].key).toBe("00");
      expect(result.buckets[12].key).toBe("12");
      expect(result.buckets[23].key).toBe("23");
    });

    it("buckets sessions by local hour of endedAt", () => {
      // 2026-10-09 in US/Eastern: UTC-4
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime(); // 00:00 EDT
      const hour5 = dayStart + 5 * 3600000; // 05:00 EDT
      const hour14 = dayStart + 14 * 3600000; // 14:00 EDT

      const sessions: StatsSession[] = [
        session(hour5, "focus", 25 * 60 * 1000),
        session(hour14, "focus", 30 * 60 * 1000),
      ];

      const result = aggregateStats("day", {
        sessions,
        nowMs: dayStart + 12 * 3600000, // 12:00 EDT on that day
        timeZone: "US/Eastern"
      });

      expect(result.buckets[5].focusMs).toBe(25 * 60 * 1000);
      expect(result.buckets[5].sessionCount).toBe(1);
      expect(result.buckets[14].focusMs).toBe(30 * 60 * 1000);
      expect(result.buckets[14].sessionCount).toBe(1);
    });

    it("totals focus time and session count across all buckets", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000),
        session(dayStart + 2 * 3600000, "focus", 15 * 60 * 1000),
        session(dayStart + 3 * 3600000, "focus", 20 * 60 * 1000),
      ];

      const result = aggregateStats("day", {
        sessions,
        nowMs: dayStart,
        timeZone: "US/Eastern"
      });

      expect(result.totalFocusMs).toBe((25 + 15 + 20) * 60 * 1000);
      expect(result.totalSessionCount).toBe(3);
    });
  });

  describe("week view", () => {
    it("returns 7 buckets, Monday through Sunday", () => {
      // 2026-10-09 is a Friday
      const fridayNoon = new Date("2026-10-09T12:00:00Z").getTime();

      const result = aggregateStats("week", { sessions: [], nowMs: fridayNoon, timeZone: "US/Eastern" });

      expect(result.buckets).toHaveLength(7);
      expect(result.buckets[0].label).toBe("Mon");
      expect(result.buckets[4].label).toBe("Fri");
      expect(result.buckets[6].label).toBe("Sun");
    });

    it("includes Monday as the week start", () => {
      // 2026-10-09 is a Friday; the week starts 2026-10-05 (Monday) in US/Eastern
      const fridayNoon = new Date("2026-10-09T12:00:00Z").getTime();

      // Session on the Thursday (2026-10-08, key will be "2026-10-08")
      const thursdayStart = new Date("2026-10-08T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(thursdayStart + 12 * 3600000, "focus", 25 * 60 * 1000),
      ];

      const result = aggregateStats("week", { sessions, nowMs: fridayNoon, timeZone: "US/Eastern" });

      // Thursday is index 3 (Mon=0, Tue=1, Wed=2, Thu=3)
      expect(result.buckets[3].focusMs).toBe(25 * 60 * 1000);
    });

    it("Sunday session belongs to the week whose Monday precedes it", () => {
      // 2026-10-11 is a Sunday at midnight EDT (04:00 UTC)
      const sundayStart = new Date("2026-10-11T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(sundayStart + 12 * 3600000, "focus", 25 * 60 * 1000),
      ];

      // Ask for the week containing this Sunday
      const result = aggregateStats("week", { sessions, nowMs: sundayStart, timeZone: "US/Eastern" });

      // Sunday is index 6 in this week (which started Monday 2026-10-05)
      expect(result.buckets[6].sessionCount).toBe(1);
    });
  });

  describe("month view", () => {
    it("returns one bucket per local day of the current month", () => {
      // October 2026 has 31 days
      const oct15 = new Date("2026-10-15T12:00:00Z").getTime();

      const result = aggregateStats("month", { sessions: [], nowMs: oct15, timeZone: "US/Eastern" });

      expect(result.buckets).toHaveLength(31);
      expect(result.buckets[0].label).toBe("1");
      expect(result.buckets[14].label).toBe("15");
      expect(result.buckets[30].label).toBe("31");
    });

    it("handles 28-day February (non-leap year)", () => {
      // February 2027 is not a leap year
      const feb15 = new Date("2027-02-15T12:00:00Z").getTime();

      const result = aggregateStats("month", { sessions: [], nowMs: feb15, timeZone: "UTC" });

      expect(result.buckets).toHaveLength(28);
    });

    it("handles 29-day February (leap year)", () => {
      // February 2028 is a leap year
      const feb15 = new Date("2028-02-15T12:00:00Z").getTime();

      const result = aggregateStats("month", { sessions: [], nowMs: feb15, timeZone: "UTC" });

      expect(result.buckets).toHaveLength(29);
    });

    it("handles 30-day months", () => {
      // April 2026 has 30 days
      const apr15 = new Date("2026-04-15T12:00:00Z").getTime();

      const result = aggregateStats("month", { sessions: [], nowMs: apr15, timeZone: "UTC" });

      expect(result.buckets).toHaveLength(30);
    });
  });

  describe("DST transitions", () => {
    it("handles DST-change day in US/Eastern (spring forward, 23h)", () => {
      // 2026-03-08 in US/Eastern: DST starts, day is 23 hours (02:00 EST becomes 03:00 EDT)
      const dstSpringDay = new Date("2026-03-08T05:00:00Z").getTime(); // Noon EDT (05:00 UTC)

      const result = aggregateStats("day", { sessions: [], nowMs: dstSpringDay, timeZone: "US/Eastern" });

      // Still 24 buckets (the skipped 02:00 is just an empty bucket)
      expect(result.buckets).toHaveLength(24);
    });

    it("handles DST-change day in US/Eastern (fall back, 25h)", () => {
      // 2026-11-01 in US/Eastern: DST ends, day is 25 hours (02:00 EDT becomes 01:00 EST)
      const dstFallDay = new Date("2026-11-01T05:00:00Z").getTime(); // Noon EST (05:00 UTC)

      const result = aggregateStats("day", { sessions: [], nowMs: dstFallDay, timeZone: "US/Eastern" });

      // Still 24 buckets (the repeated 01:00 merges into one)
      expect(result.buckets).toHaveLength(24);
    });
  });

  describe("session placement", () => {
    it("places entire session in the local day of endedAt (never split)", () => {
      // Session from 23:50 EDT to 00:10 EDT next day should land entirely in next day
      const day1Start = new Date("2026-10-09T04:00:00Z").getTime(); // 00:00 EDT
      const session235pm = day1Start + 23.833 * 3600000; // 23:50 EDT (ends at 23:50 on day 1)

      const sessions: StatsSession[] = [
        session(session235pm, "focus", 25 * 60 * 1000),
      ];

      // Ask for day 1
      const result1 = aggregateStats("day", {
        sessions,
        nowMs: day1Start + 12 * 3600000,
        timeZone: "US/Eastern"
      });

      // Session ends at 23:50, so it's in hour bucket 23
      expect(result1.buckets[23].sessionCount).toBe(1);
      expect(result1.totalSessionCount).toBe(1);

      // Session should NOT appear in day 2
      const day2Start = day1Start + 24 * 3600000;
      const result2 = aggregateStats("day", {
        sessions,
        nowMs: day2Start + 12 * 3600000,
        timeZone: "US/Eastern"
      });

      expect(result2.totalSessionCount).toBe(0);
    });
  });

  describe("break-type filtering", () => {
    it("excludes shortBreak sessions", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000),
        session(dayStart + 2 * 3600000, "shortBreak", 5 * 60 * 1000),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.totalSessionCount).toBe(1); // Only the focus session
      expect(result.totalFocusMs).toBe(25 * 60 * 1000);
    });

    it("excludes longBreak sessions", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000),
        session(dayStart + 2 * 3600000, "longBreak", 15 * 60 * 1000),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.totalSessionCount).toBe(1);
      expect(result.totalFocusMs).toBe(25 * 60 * 1000);
    });

    it("includes custom mode as focus-type", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "custom", 10 * 60 * 1000),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.totalSessionCount).toBe(1);
      expect(result.totalFocusMs).toBe(10 * 60 * 1000);
    });
  });

  describe("per-task breakdown", () => {
    it("groups sessions by taskId", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000, "task-a", "Task A"),
        session(dayStart + 2 * 3600000, "focus", 15 * 60 * 1000, "task-a", "Task A"),
        session(dayStart + 3 * 3600000, "focus", 20 * 60 * 1000, "task-b", "Task B"),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.breakdown).toHaveLength(2);
      const taskA = result.breakdown.find((b) => b.taskId === "task-a");
      const taskB = result.breakdown.find((b) => b.taskId === "task-b");

      expect(taskA?.focusMs).toBe(40 * 60 * 1000);
      expect(taskA?.sessionCount).toBe(2);
      expect(taskB?.focusMs).toBe(20 * 60 * 1000);
      expect(taskB?.sessionCount).toBe(1);
    });

    it("groups untagged sessions under 'No task'", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000, null, null),
        session(dayStart + 2 * 3600000, "focus", 15 * 60 * 1000, null, null),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].label).toBe("No task");
      expect(result.breakdown[0].focusMs).toBe(40 * 60 * 1000);
      expect(result.breakdown[0].sessionCount).toBe(2);
    });

    it("sorts breakdown by focusMs descending, then label ascending", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 10 * 60 * 1000, "task-b", "Zebra"), // 10m
        session(dayStart + 2 * 3600000, "focus", 20 * 60 * 1000, "task-a", "Apple"), // 20m
        session(dayStart + 3 * 3600000, "focus", 20 * 60 * 1000, "task-c", "Banana"), // 20m (tied with Apple)
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      // Should be: Apple (20m), Banana (20m), Zebra (10m)
      expect(result.breakdown[0].label).toBe("Apple");
      expect(result.breakdown[1].label).toBe("Banana");
      expect(result.breakdown[2].label).toBe("Zebra");
    });

    it("uses current taskTitle from taskTitles map when available", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000, "task-1", "Old Title"),
      ];

      const result = aggregateStats("day", {
        sessions,
        nowMs: dayStart,
        timeZone: "US/Eastern",
        taskTitles: new Map([["task-1", "New Title"]])
      });

      expect(result.breakdown[0].label).toBe("New Title");
    });

    it("uses snapshot title when task title map not provided", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000, "task-1", "Snapshot Title"),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.breakdown[0].label).toBe("Snapshot Title");
    });

    it("uses 'Deleted task' when no title is available", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000, "task-1", null),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.breakdown[0].label).toBe("Deleted task");
    });
  });

  describe("boundaries", () => {
    it("includes sessions at range start, excludes sessions at range end", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const nextDayStart = dayStart + 24 * 3600000;

      const sessions: StatsSession[] = [
        session(dayStart, "focus", 25 * 60 * 1000),      // At start (included)
        session(dayStart + 1, "focus", 25 * 60 * 1000),   // Just after start (included)
        session(nextDayStart - 1, "focus", 25 * 60 * 1000), // Just before end (included)
        session(nextDayStart, "focus", 25 * 60 * 1000),   // At end (excluded)
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.totalSessionCount).toBe(3);
    });

    it("excludes sessions before the range", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart - 1, "focus", 25 * 60 * 1000),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.totalSessionCount).toBe(0);
    });
  });

  describe("isEmpty", () => {
    it("is true when no focus sessions in range", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "shortBreak", 5 * 60 * 1000),
        session(dayStart + 2 * 3600000, "longBreak", 15 * 60 * 1000),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.isEmpty).toBe(true);
      expect(result.totalSessionCount).toBe(0);
    });

    it("is false when focus sessions exist", () => {
      const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
      const sessions: StatsSession[] = [
        session(dayStart + 1 * 3600000, "focus", 25 * 60 * 1000),
      ];

      const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "US/Eastern" });

      expect(result.isEmpty).toBe(false);
    });
  });

  describe("performance", () => {
    it("aggregates 5000 sessions in under 100ms", () => {
      // Generate 5000 sessions spread over 12 months
      const sessions: StatsSession[] = [];
      const startMs = new Date("2026-01-01T12:00:00Z").getTime();
      for (let i = 0; i < 5000; i++) {
        const monthOffset = i % 12;
        const sessionMs = startMs + (monthOffset * 30.44 * 24 * 3600000) + (Math.random() * 24 * 3600000);
        sessions.push(session(sessionMs, i % 2 === 0 ? "focus" : "custom", 25 * 60 * 1000, `task-${i % 100}`, `Task ${i % 100}`));
      }

      const nowMs = new Date("2026-06-15T12:00:00Z").getTime();

      const start = performance.now();
      aggregateStats("month", { sessions, nowMs, timeZone: "US/Eastern" });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});

describe("stats: getStatsRange", () => {
  it("returns [from, to) range for day view", () => {
    const dayNoon = new Date("2026-10-09T12:00:00Z").getTime();
    const { fromMs, toMs } = getStatsRange("day", dayNoon, "US/Eastern");

    // Should span from midnight EDT to next midnight EDT
    const dayStart = new Date("2026-10-09T04:00:00Z").getTime(); // 00:00 EDT
    const nextDayStart = dayStart + 24 * 3600000;

    expect(fromMs).toBe(dayStart);
    expect(toMs).toBe(nextDayStart);
  });
});

describe("stats: daysInMonth", () => {
  it("returns 28 for non-leap February", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
  });

  it("returns 29 for leap-year February", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("returns 31 for January", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it("returns 30 for April", () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});
