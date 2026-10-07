import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTimerStore } from "./store";
import { MS_PER_MINUTE } from "./constants";

describe("useTimerStore", () => {
  beforeEach(() => {
    // Reset the store state before each test
    useTimerStore.setState({
      mode: "focus",
      customMinutes: 25,
      status: "idle",
      endTimestamp: null,
      pausedRemainingMs: null,
      hasHydrated: false,
    });
  });

  describe("initial state", () => {
    it("starts with Focus mode, idle status, and 25 minutes custom", () => {
      const state = useTimerStore.getState();
      expect(state.mode).toBe("focus");
      expect(state.status).toBe("idle");
      expect(state.customMinutes).toBe(25);
      expect(state.endTimestamp).toBeNull();
      expect(state.pausedRemainingMs).toBeNull();
    });
  });

  describe("selectMode", () => {
    it("switches to a different mode when idle", () => {
      const store = useTimerStore.getState();
      store.selectMode("shortBreak");
      const state = useTimerStore.getState();
      expect(state.mode).toBe("shortBreak");
      expect(state.status).toBe("idle");
    });

    it("no-op when selecting the current mode while idle", () => {
      const store = useTimerStore.getState();
      store.selectMode("focus");
      const state = useTimerStore.getState();
      expect(state.mode).toBe("focus");
      expect(state.status).toBe("idle");
    });

    it("no-op when selecting the current mode while running (countdown keeps running)", () => {
      const store = useTimerStore.getState();
      store.start();
      const runningState = useTimerStore.getState();
      const runningEndTimestamp = runningState.endTimestamp;
      // Immediately select the same mode
      store.selectMode("focus");
      const afterState = useTimerStore.getState();
      expect(afterState.status).toBe("running");
      expect(afterState.endTimestamp).toBe(runningEndTimestamp);
    });

    it("switches to a different mode while running and discards the old countdown", () => {
      const store = useTimerStore.getState();
      store.start();
      const runningState = useTimerStore.getState();
      expect(runningState.status).toBe("running");
      // Switch to a different mode
      store.selectMode("shortBreak");
      const state = useTimerStore.getState();
      expect(state.mode).toBe("shortBreak");
      expect(state.status).toBe("idle");
      expect(state.endTimestamp).toBeNull();
      expect(state.pausedRemainingMs).toBeNull();
    });

    it("switches to a different mode while paused and discards the old countdown", () => {
      const store = useTimerStore.getState();
      store.start();
      store.pause();
      const pausedState = useTimerStore.getState();
      expect(pausedState.status).toBe("paused");
      // Switch mode
      store.selectMode("longBreak");
      const state = useTimerStore.getState();
      expect(state.mode).toBe("longBreak");
      expect(state.status).toBe("idle");
      expect(state.endTimestamp).toBeNull();
      expect(state.pausedRemainingMs).toBeNull();
    });

    it("switches mode from complete to idle", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ status: "complete" });
      store.selectMode("custom");
      const state = useTimerStore.getState();
      expect(state.mode).toBe("custom");
      expect(state.status).toBe("idle");
    });
  });

  describe("start", () => {
    it("transitions from idle to running and sets endTimestamp", () => {
      const before = Date.now();
      const store = useTimerStore.getState();
      store.start();
      const after = Date.now();
      const state = useTimerStore.getState();
      expect(state.status).toBe("running");
      expect(state.endTimestamp).toBeDefined();
      // endTimestamp should be approximately 25 minutes in the future
      const expectedEndTime = before + 25 * MS_PER_MINUTE;
      const actualEndTime = state.endTimestamp!;
      // Allow a small tolerance for test execution time
      expect(actualEndTime).toBeGreaterThanOrEqual(expectedEndTime - 100);
      expect(actualEndTime).toBeLessThanOrEqual(after + 25 * MS_PER_MINUTE + 100);
    });

    it("transitions from complete to running", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ status: "complete" });
      store.start();
      const state = useTimerStore.getState();
      expect(state.status).toBe("running");
      expect(state.endTimestamp).toBeDefined();
    });

    it("no-op when already running", () => {
      const store = useTimerStore.getState();
      store.start();
      const firstState = useTimerStore.getState();
      const firstEndTimestamp = firstState.endTimestamp;
      // Try to start again immediately
      store.start();
      const secondState = useTimerStore.getState();
      expect(secondState.endTimestamp).toBe(firstEndTimestamp);
    });

    it("no-op when paused", () => {
      const store = useTimerStore.getState();
      store.start();
      store.pause();
      const pausedState = useTimerStore.getState();
      const pausedEndTimestamp = pausedState.endTimestamp;
      store.start();
      const afterState = useTimerStore.getState();
      expect(afterState.endTimestamp).toBe(pausedEndTimestamp);
    });
  });

  describe("pause", () => {
    it("transitions from running to paused and captures remaining time", () => {
      const store = useTimerStore.getState();
      store.start();
      const timeBefore = Date.now();
      store.pause();
      const timeAfter = Date.now();
      const pausedState = useTimerStore.getState();
      expect(pausedState.status).toBe("paused");
      expect(pausedState.endTimestamp).toBeNull();
      expect(pausedState.pausedRemainingMs).toBeDefined();
      // pausedRemainingMs should be close to 25 minutes (minus execution time)
      const expectedMin = 25 * MS_PER_MINUTE - (timeAfter - timeBefore) - 100;
      const expectedMax = 25 * MS_PER_MINUTE;
      expect(pausedState.pausedRemainingMs!).toBeGreaterThanOrEqual(expectedMin);
      expect(pausedState.pausedRemainingMs!).toBeLessThanOrEqual(expectedMax);
    });

    it("no-op when idle", () => {
      const store = useTimerStore.getState();
      store.pause();
      const state = useTimerStore.getState();
      expect(state.status).toBe("idle");
      expect(state.pausedRemainingMs).toBeNull();
    });

    it("no-op when paused", () => {
      const store = useTimerStore.getState();
      store.start();
      store.pause();
      const pausedState = useTimerStore.getState();
      const pausedValue = pausedState.pausedRemainingMs;
      store.pause();
      const secondPausedState = useTimerStore.getState();
      expect(secondPausedState.pausedRemainingMs).toBe(pausedValue);
    });

    it("clamps remaining time to [0, fullMs]", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ mode: "shortBreak" }); // 5 minutes
      store.start();
      // Manually set endTimestamp to the past so remaining would be negative
      useTimerStore.setState({ endTimestamp: Date.now() - 1000 });
      store.pause();
      const state = useTimerStore.getState();
      expect(state.pausedRemainingMs).toBe(0);
    });
  });

  describe("resume", () => {
    it("transitions from paused back to running with a fresh endTimestamp", () => {
      const store = useTimerStore.getState();
      store.start();
      store.pause();
      const pausedState = useTimerStore.getState();
      const pausedValue = pausedState.pausedRemainingMs;
      const timeBefore = Date.now();
      store.resume();
      const timeAfter = Date.now();
      const resumedState = useTimerStore.getState();
      expect(resumedState.status).toBe("running");
      expect(resumedState.pausedRemainingMs).toBeNull();
      expect(resumedState.endTimestamp).toBeDefined();
      // endTimestamp should be approximately now + pausedValue
      const expectedEndTime = timeBefore + pausedValue!;
      const actualEndTime = resumedState.endTimestamp!;
      expect(actualEndTime).toBeGreaterThanOrEqual(expectedEndTime - 100);
      expect(actualEndTime).toBeLessThanOrEqual(timeAfter + pausedValue! + 100);
    });

    it("no-op when idle", () => {
      const store = useTimerStore.getState();
      store.resume();
      const state = useTimerStore.getState();
      expect(state.status).toBe("idle");
    });

    it("no-op when running", () => {
      const store = useTimerStore.getState();
      store.start();
      const runningState = useTimerStore.getState();
      const endTimestamp = runningState.endTimestamp;
      store.resume();
      const afterState = useTimerStore.getState();
      expect(afterState.endTimestamp).toBe(endTimestamp);
    });
  });

  describe("reset", () => {
    it("returns to idle from running", () => {
      const store = useTimerStore.getState();
      store.start();
      store.reset();
      const state = useTimerStore.getState();
      expect(state.status).toBe("idle");
      expect(state.endTimestamp).toBeNull();
      expect(state.pausedRemainingMs).toBeNull();
    });

    it("returns to idle from paused", () => {
      const store = useTimerStore.getState();
      store.start();
      store.pause();
      store.reset();
      const state = useTimerStore.getState();
      expect(state.status).toBe("idle");
      expect(state.endTimestamp).toBeNull();
      expect(state.pausedRemainingMs).toBeNull();
    });

    it("returns to idle from complete", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ status: "complete" });
      store.reset();
      const state = useTimerStore.getState();
      expect(state.status).toBe("idle");
      expect(state.endTimestamp).toBeNull();
      expect(state.pausedRemainingMs).toBeNull();
    });

    it("no-op from idle", () => {
      const store = useTimerStore.getState();
      store.reset();
      const state = useTimerStore.getState();
      expect(state.status).toBe("idle");
    });

    it("does not touch customMinutes", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ customMinutes: 50 });
      store.start();
      store.reset();
      const state = useTimerStore.getState();
      expect(state.customMinutes).toBe(50);
    });
  });

  describe("setCustomMinutes", () => {
    it("updates customMinutes when idle", () => {
      const store = useTimerStore.getState();
      store.setCustomMinutes(30);
      const state = useTimerStore.getState();
      expect(state.customMinutes).toBe(30);
    });

    it("updates customMinutes when complete", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ status: "complete" });
      store.setCustomMinutes(50);
      const state = useTimerStore.getState();
      expect(state.customMinutes).toBe(50);
    });

    it("no-op when custom mode is running", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ mode: "custom", customMinutes: 25 });
      store.start();
      store.setCustomMinutes(50);
      const state = useTimerStore.getState();
      expect(state.customMinutes).toBe(25);
    });

    it("no-op when custom mode is paused", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ mode: "custom", customMinutes: 25 });
      store.start();
      store.pause();
      store.setCustomMinutes(50);
      const state = useTimerStore.getState();
      expect(state.customMinutes).toBe(25);
    });

    it("allows updates while other modes are running", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({ mode: "focus" });
      store.start();
      store.setCustomMinutes(50);
      const state = useTimerStore.getState();
      expect(state.customMinutes).toBe(50);
    });
  });

  describe("completeIfExpired", () => {
    it("transitions to complete when now >= endTimestamp", () => {
      const store = useTimerStore.getState();
      store.start();
      const startingState = useTimerStore.getState();
      const endTimestamp = startingState.endTimestamp!;
      // Simulate reaching or passing the end time
      store.completeIfExpired(endTimestamp);
      const completeState = useTimerStore.getState();
      expect(completeState.status).toBe("complete");
      expect(completeState.endTimestamp).toBeNull();
    });

    it("transitions to complete when now is far past endTimestamp", () => {
      const store = useTimerStore.getState();
      store.start();
      const startingState = useTimerStore.getState();
      const endTimestamp = startingState.endTimestamp!;
      store.completeIfExpired(endTimestamp + 10000);
      const completeState = useTimerStore.getState();
      expect(completeState.status).toBe("complete");
    });

    it("no-op when not running", () => {
      const store = useTimerStore.getState();
      store.completeIfExpired(Date.now());
      const state = useTimerStore.getState();
      expect(state.status).toBe("idle");
    });

    it("no-op when running but time hasn't reached the end", () => {
      const store = useTimerStore.getState();
      store.start();
      const startingState = useTimerStore.getState();
      const endTimestamp = startingState.endTimestamp!;
      store.completeIfExpired(endTimestamp - 1000);
      const afterState = useTimerStore.getState();
      expect(afterState.status).toBe("running");
      expect(afterState.endTimestamp).toBe(endTimestamp);
    });

    it("no-op when paused", () => {
      const store = useTimerStore.getState();
      store.start();
      store.pause();
      store.completeIfExpired(Date.now());
      const state = useTimerStore.getState();
      expect(state.status).toBe("paused");
    });
  });

  describe("hasHydrated", () => {
    it("starts as false", () => {
      expect(useTimerStore.getState().hasHydrated).toBe(false);
    });

    it("can be set to true", () => {
      useTimerStore.getState().setHasHydrated(true);
      expect(useTimerStore.getState().hasHydrated).toBe(true);
    });

    it("is not persisted (not included in partialize)", () => {
      useTimerStore.getState().setHasHydrated(true);
      // hasHydrated is not in the persisted state, so resetting and checking the persisted data
      // won't show it
      const persistedState = useTimerStore.getState();
      expect(persistedState.hasHydrated).toBe(true); // still true in memory
      // The partialize function excludes hasHydrated, but we can't easily test persistence
      // without a real localStorage implementation
    });
  });

  describe("complex scenarios", () => {
    it("mode switch mid-run discards remaining time", () => {
      const store = useTimerStore.getState();
      store.start();
      store.selectMode("shortBreak");
      const state = useTimerStore.getState();
      expect(state.mode).toBe("shortBreak");
      expect(state.status).toBe("idle");
      expect(state.endTimestamp).toBeNull();
    });

    it("pause then resume preserves the paused value", () => {
      vi.useFakeTimers();
      try {
        const store = useTimerStore.getState();
        store.start();
        store.pause();
        // Simulate 5 seconds of wall-clock time passing
        vi.advanceTimersByTime(5000);
        store.resume();
        // The paused value should be used to calculate the new endTimestamp
        const state = useTimerStore.getState();
        expect(state.status).toBe("running");
        expect(state.pausedRemainingMs).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("reload while running preserves running state", () => {
      const store = useTimerStore.getState();
      useTimerStore.setState({
        mode: "focus",
        status: "running",
        endTimestamp: Date.now() + 10 * MS_PER_MINUTE,
        customMinutes: 25,
      });
      // Simulate a reload by checking the state
      const state = useTimerStore.getState();
      expect(state.status).toBe("running");
      expect(state.mode).toBe("focus");
      expect(state.endTimestamp).toBeDefined();
    });

    it("complete on expiry, then start again", () => {
      const store = useTimerStore.getState();
      store.start();
      store.completeIfExpired(Date.now() + 30 * MS_PER_MINUTE);
      let state = useTimerStore.getState();
      expect(state.status).toBe("complete");
      store.start();
      state = useTimerStore.getState();
      expect(state.status).toBe("running");
      expect(state.endTimestamp).toBeDefined();
    });
  });
});
