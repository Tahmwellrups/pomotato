import { describe, it, expect, beforeEach } from "vitest";
import { logCompletedSession } from "./session-repository";
import { resetDatabaseForTests, listAllSessionsForTests } from "./test-utils";
import { SessionValidationError } from "./errors";
import { aggregateStats } from "../stats/aggregate";
import { SESSION_MODES } from "./session-modes";
import type { StatsSession } from "../stats/types";

// Task 013 criterion 4: a session row that was written with mode "custom" (before the Custom chip was
// removed) is still accepted, still validated by name, and still counted as focus time. Proven with a row
// that goes through the real store and the real aggregation, not only by reading the types.
// Red-proof (unit level): removing "custom" from isFocusTypeMode in lib/db/session-modes.ts turns the
// focus-time assertion red.

describe("013 criterion 4: a stored mode 'custom' row is accepted, named, and counted as focus", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  it("the four historical modes are still the validated set", () => {
    expect([...SESSION_MODES]).toEqual(["focus", "shortBreak", "longBreak", "custom"]);
  });

  it("logCompletedSession accepts a custom row and names all four modes when a mode is rejected", async () => {
    const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
    const result = await logCompletedSession({
      runId: "legacy-custom-row",
      mode: "custom",
      startedAt: dayStart + 3600000,
      endedAt: dayStart + 3600000 + 10 * 60 * 1000,
      plannedDurationMs: 10 * 60 * 1000,
    });
    expect(result.status).toBe("logged");

    // The validation message lives on the issue, not the error's headline: the rejection names all four modes.
    const rejected = await logCompletedSession({
      runId: "bad-mode",
      mode: "invalid" as never,
      startedAt: 1000,
      endedAt: 2000,
      plannedDurationMs: 1000,
    }).catch((err: unknown) => err);
    expect(rejected).toBeInstanceOf(SessionValidationError);
    const issue = (rejected as SessionValidationError).issues.find((i) => i.field === "mode");
    expect(issue?.message).toBe("mode must be focus, shortBreak, longBreak, or custom.");
  });

  it("the stored custom row is counted as focus time by aggregateStats", async () => {
    const dayStart = new Date("2026-10-09T04:00:00Z").getTime();
    await logCompletedSession({
      runId: "legacy-custom-agg",
      mode: "custom",
      startedAt: dayStart + 3600000,
      endedAt: dayStart + 3600000 + 10 * 60 * 1000,
      plannedDurationMs: 10 * 60 * 1000,
    });
    const rows = await listAllSessionsForTests();
    const stored = rows.find((r) => r.runId === "legacy-custom-agg");
    expect(stored?.mode).toBe("custom");

    const sessions: StatsSession[] = rows.map((r) => ({
      mode: r.mode,
      endedAt: r.endedAt,
      plannedDurationMs: r.plannedDurationMs,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
    }));
    const result = aggregateStats("day", { sessions, nowMs: dayStart, timeZone: "UTC" });
    expect(result.totalSessionCount).toBe(1);
    expect(result.totalFocusMs).toBe(10 * 60 * 1000);
  });
});
