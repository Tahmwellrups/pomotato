import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleWithin } from "./settle-within";

// The timer helper behind the chime's resume bound (task 017, criterion 53 real-browser clause).
// It is the only JS timer in that path, so it is tested directly with fake timers.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("settleWithin", () => {
  it("resolves with the value when the promise settles before the bound", async () => {
    const result = settleWithin(Promise.resolve(true), 500, false);
    await expect(result).resolves.toBe(true);
  });

  it("clears its timer when the promise wins, so no stray timer is left pending", async () => {
    const result = settleWithin(Promise.resolve("ok"), 500, "fallback");
    await expect(result).resolves.toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves with the fallback when the promise does not settle within the bound", async () => {
    const result = settleWithin(new Promise<boolean>(() => {}), 500, false);
    await vi.advanceTimersByTimeAsync(499);
    let settled = false;
    result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(false);
  });

  it("resolves with the fallback when the promise rejects, and does not throw", async () => {
    const result = settleWithin(Promise.reject(new Error("refused")), 500, "fallback");
    await expect(result).resolves.toBe("fallback");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a promise that settles after the bound does not change the result already returned", async () => {
    let finish: (value: boolean) => void = () => {};
    const late = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const result = settleWithin(late, 500, false);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toBe(false);
    finish(true);
    await Promise.resolve();
    await expect(result).resolves.toBe(false);
  });
});
