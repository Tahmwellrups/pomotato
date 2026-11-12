import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { levelToGain } from "./gain";

// Task 017 criteria 38, 42, 45, 46, 47, 48, 49, 51, 52, 53 (unit half).
// The chime is a module singleton over the engine singleton, so every test
// loads fresh copies (vi.resetModules). The AudioContext is a fake with a
// manual audio clock: `advance()` moves time and fires `onended` for every
// source whose scheduled stop has passed, which is the engine's only callback.

interface ParamCall {
  method: "setValueAtTime" | "linearRampToValueAtTime" | "exponentialRampToValueAtTime" | "setTargetAtTime";
  value: number;
  time: number;
}

class FakeParam {
  value = 1;
  directWrites = 0;
  calls: ParamCall[] = [];
  set valueDirect(v: number) {
    this.value = v;
    this.directWrites += 1;
  }
  setValueAtTime(value: number, time: number) {
    this.calls.push({ method: "setValueAtTime", value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: "linearRampToValueAtTime", value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: "exponentialRampToValueAtTime", value, time });
  }
  setTargetAtTime(value: number, time: number) {
    this.calls.push({ method: "setTargetAtTime", value, time });
  }
  cancelScheduledValues() {}
}

class FakeNode {
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  readonly detune = new FakeParam();
  readonly playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  stopAt: number | null = null;
  startAt: number | null = null;
  fired = false;
  disconnected = false;
  type = "sine";
  buffer: unknown = null;
  loop = false;
  constructor(readonly kind: string) {}
  connect<T>(target: T): T {
    return target;
  }
  disconnect(): void {
    this.disconnected = true;
  }
  start(when = 0): void {
    this.startAt = when;
  }
  stop(when?: number): void {
    if (this.stopAt !== null && when === undefined) return;
    this.stopAt = when ?? 0;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static resumeCalls = 0;
  /** When true, resume() settles without the context ever running: a refused autoplay. */
  static refuse = false;
  /** When true, resume() stays pending forever, as Chrome does under autoplay policy with no gesture. */
  static hang = false;
  /** Settles the pending resume started while `hang` was set: the context runs and the promise resolves. */
  static settleHung: (() => void) | null = null;
  state: AudioContextState = "suspended";
  sampleRate = 48000;
  currentTime = 0;
  destination = new FakeNode("destination");
  onstatechange: (() => void) | null = null;
  nodes: FakeNode[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  private make(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.make("gain");
  }
  createOscillator() {
    return this.make("oscillator");
  }
  createConstantSource() {
    return this.make("constant");
  }
  createBufferSource() {
    return this.make("buffer");
  }
  createBiquadFilter() {
    return this.make("biquad");
  }
  createBuffer(_channels: number, length: number) {
    return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) };
  }
  resume(): Promise<void> {
    FakeAudioContext.resumeCalls += 1;
    if (FakeAudioContext.hang) {
      return new Promise<void>((resolve) => {
        FakeAudioContext.settleHung = () => {
          this.state = "running";
          this.onstatechange?.();
          resolve();
        };
      });
    }
    if (!FakeAudioContext.refuse) {
      this.state = "running";
      this.onstatechange?.();
      return Promise.resolve();
    }
    return Promise.reject(new Error("autoplay refused"));
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    this.onstatechange?.();
    return Promise.resolve();
  }
  /** Moves the audio clock and fires `onended` for every source whose stop time has now passed. */
  advance(seconds: number): void {
    this.currentTime += seconds;
    for (const node of this.nodes) {
      if (node.stopAt !== null && !node.fired && node.stopAt <= this.currentTime) {
        node.fired = true;
        node.onended?.();
      }
    }
  }
  get liveNodes(): number {
    return this.nodes.filter((node) => !node.disconnected).length;
  }
}

const SCRATCH_DIR = resolve(process.cwd(), "lib/audio");

async function load() {
  vi.resetModules();
  const chimeModule = await import("./chime");
  const engineModule = await import("./engine");
  return { chime: chimeModule.chime, chimeModule, soundscape: engineModule.soundscape };
}

/** The oscillators the chime scheduled: every node of kind "oscillator" in creation order. */
function oscillators(ctx: FakeAudioContext): FakeNode[] {
  return ctx.nodes.filter((node) => node.kind === "oscillator");
}

/** The envelope gain nodes, one per oscillator, in creation order (they are the gain nodes the chime built). */
function envelopes(ctx: FakeAudioContext): FakeNode[] {
  return ctx.nodes.filter((node) => node.kind === "gain");
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioContext.resumeCalls = 0;
  FakeAudioContext.refuse = false;
  FakeAudioContext.hang = false;
  FakeAudioContext.settleHung = null;
  Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("criterion 42: the chime's peak follows the squared level curve", () => {
  it("the two notes' peaks sum to levelToGain(level), and level 0 is gain 0", async () => {
    const { chime } = await load();
    const peaks: number[] = [];
    for (const level of [0, 25, 50, 75, 100]) {
      FakeAudioContext.instances = [];
      vi.resetModules();
      const fresh = await load();
      await fresh.chime.play(level);
      const ctx = FakeAudioContext.instances[0];
      const peak = envelopes(ctx)
        .map((gain) => Math.max(...gain.gain.calls.filter((c) => c.method === "linearRampToValueAtTime").map((c) => c.value)))
        .reduce((sum, value) => sum + value, 0);
      expect(peak).toBeCloseTo(levelToGain(level), 10);
      peaks.push(peak);
    }
    expect(peaks[0]).toBe(0);
    for (let i = 1; i < peaks.length; i += 1) expect(peaks[i]).toBeGreaterThan(peaks[i - 1]);
    void chime;
  });

  it("gain is monotonic in the level across the whole 0 to 100 range", () => {
    const samples = Array.from({ length: 101 }, (_, level) => levelToGain(level));
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    expect(samples[0]).toBe(0);
  });
});

describe("criterion 45: the whole chime, release tail included, is at most 2.0 s", () => {
  it("the exported bound and the scheduled stop times agree and stay under 2.0 s", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    const starts = oscillators(ctx).map((node) => node.startAt ?? Number.NaN);
    const stops = oscillators(ctx).map((node) => node.stopAt ?? Number.NaN);
    const span = Math.max(...stops) - Math.min(...starts);
    expect(chimeModule.CHIME_DURATION_SECONDS).toBeLessThanOrEqual(2.0);
    expect(span).toBeLessThanOrEqual(2.0);
    // The first sample is at the lead-in, so the span is the bound itself.
    expect(span).toBeCloseTo(chimeModule.CHIME_DURATION_SECONDS, 6);
  });
});

describe("criterion 46: the chime module has no JS timer or frame source", () => {
  it("chime.ts contains no setInterval, setTimeout, requestAnimationFrame or performance.now", () => {
    const source = readFileSync(resolve(SCRATCH_DIR, "chime.ts"), "utf8");
    expect(source).not.toMatch(/\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/);
  });
});

describe("criterion 47: no click, the envelope starts and ends at 0 through ramps", () => {
  it("every envelope begins with setValueAtTime(0) and ends with a ramp to 0, with no abrupt non-zero write", async () => {
    const { chime } = await load();
    await chime.play(80);
    const ctx = FakeAudioContext.instances[0];
    for (const gain of envelopes(ctx)) {
      const calls = gain.gain.calls;
      expect(calls[0]).toMatchObject({ method: "setValueAtTime", value: 0 });
      expect(calls[calls.length - 1]).toMatchObject({ method: "linearRampToValueAtTime", value: 0 });
      expect(gain.gain.directWrites).toBe(0);
      const abruptNonZero = calls.filter((c) => c.method === "setValueAtTime" && c.value !== 0);
      expect(abruptNonZero).toHaveLength(0);
    }
  });
});

describe("criterion 38: the transition never cuts the chime short", () => {
  it("no node is stopped or disconnected before its scheduled end", async () => {
    const { chime } = await load();
    const pending = chime.play(60);
    const ctx = FakeAudioContext.instances[0];
    await pending;
    // Part way through the sound: nothing has been torn down.
    ctx.advance(1.0);
    expect(ctx.nodes.some((node) => node.disconnected)).toBe(false);
    expect(ctx.state).toBe("running");
    // Past the scheduled end: the teardown runs on the audio clock.
    ctx.advance(1.5);
    expect(ctx.nodes.filter((node) => node.kind === "oscillator").every((node) => node.disconnected)).toBe(true);
  });
});

describe("criterion 48: one AudioContext for the document", () => {
  it("prime, a chime and a soundscape start all share the one context", async () => {
    const { chime, soundscape } = await load();
    chime.prime();
    await chime.play(50);
    await soundscape.apply(
      Object.fromEntries(
        Object.keys(soundscape.getSnapshot().layers).map((id) => [id, { on: true, level: 50 }])
      ) as Parameters<typeof soundscape.apply>[0],
      true
    );
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(soundscape.getSnapshot().contexts).toBe(1);
  });
});

describe("criterion 49: priming opens and resumes the context synchronously, inside the gesture", () => {
  it("prime() calls resume before it returns, with no await in between", async () => {
    const { chime } = await load();
    expect(FakeAudioContext.resumeCalls).toBe(0);
    chime.prime();
    expect(FakeAudioContext.resumeCalls).toBe(1);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});

describe("criterion 51: node hygiene across 20 chimes", () => {
  it("the live node count returns to its pre-chime value and no soundscape layer's target gain moves", async () => {
    const { chime, soundscape } = await load();
    chime.prime();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    ctx.advance(3);
    const baseline = soundscape.getSnapshot();
    // The engine's own idle-suspend markers are constant sources it does not disconnect, so the
    // fake's raw count is not the chime's; the chime's own oscillators and envelopes are.
    const chimeLive = () => ctx.nodes.filter((node) => node.kind === "oscillator" || node.kind === "gain").filter((node) => !node.disconnected).length;
    for (let i = 0; i < 20; i += 1) {
      const pending = chime.play(50);
      ctx.advance(3);
      await pending;
    }
    expect(soundscape.getSnapshot().nodes).toBe(baseline.nodes);
    expect(chimeLive()).toBe(0);
    expect(soundscape.getSnapshot().layers).toEqual(baseline.layers);
    expect(chime.getSnapshot().plays).toBe(21);
  });
});

describe("criterion 52: a chime wakes a context the soundscape left suspended", () => {
  it("after the context is suspended, a session-end chime still plays", async () => {
    const { chime } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    ctx.advance(3);
    await ctx.suspend();
    expect(ctx.state).toBe("suspended");
    await expect(chime.play(50)).resolves.toBe("played");
    expect(ctx.state).toBe("running");
  });
});

describe("criterion 53: blocked playback fails silently, with one warning and no throw", () => {
  it("a refused context resolves blocked, warns exactly once, leaves no node live, and does not throw", async () => {
    const { chime } = await load();
    FakeAudioContext.refuse = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outcome = await chime.play(50);
    expect(outcome).toBe("blocked");
    expect(warn).toHaveBeenCalledTimes(1);
    const ctx = FakeAudioContext.instances[0];
    expect(oscillators(ctx).every((node) => node.disconnected || node.stopAt !== null)).toBe(true);
    expect(ctx.liveNodes).toBe(0);
  });

  it("the play count still records the attempt, so the page can show it", async () => {
    const { chime } = await load();
    FakeAudioContext.refuse = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await chime.play(50);
    expect(chime.getSnapshot()).toEqual({ plays: 1, lastLevel: 50 });
  });
});

// The defect the bound fixes: a resume that neither resolves nor rejects (Chrome under autoplay policy). Before the
// fix, `play()` awaited it forever, the chime's lease never released, and the engine's open-chime count stayed above
// zero, which stops the context suspending for the life of the page.
describe("criterion 53 (real browser): a resume that never settles is classified blocked within the bound", () => {
  const RESUME_BOUND_MS = 500;

  it("a pending-forever resume resolves blocked within the bound, warns once, leaves no node live, and lets the context suspend again", async () => {
    vi.useFakeTimers();
    try {
      const { chime } = await load();
      FakeAudioContext.hang = true;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const pending = chime.play(50);
      await vi.advanceTimersByTimeAsync(RESUME_BOUND_MS);
      await expect(pending).resolves.toBe("blocked");
      expect(warn).toHaveBeenCalledTimes(1);
      const ctx = FakeAudioContext.instances[0];
      expect(ctx.liveNodes).toBe(0);
      expect(ctx.state).toBe("suspended");

      // Suspension is observable: a later chime that does play, then silence, must suspend a running context.
      // That only happens when the blocked chime's lease has been released (`chimesInFlight` is back to zero).
      FakeAudioContext.hang = false;
      const next = chime.play(50);
      await vi.advanceTimersByTimeAsync(0);
      await expect(next).resolves.toBe("played");
      expect(ctx.state).toBe("running");
      ctx.advance(3);
      ctx.advance(1);
      expect(ctx.state, "context must suspend once silent: a hung chime must not wedge suspension").toBe("suspended");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a resume that settles after the bound is ignored: no second outcome, no second warning, no double release", async () => {
    vi.useFakeTimers();
    try {
      const { chime } = await load();
      FakeAudioContext.hang = true;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const pending = chime.play(50);
      await vi.advanceTimersByTimeAsync(RESUME_BOUND_MS);
      await expect(pending).resolves.toBe("blocked");
      const ctx = FakeAudioContext.instances[0];
      const liveAfterBlocked = ctx.liveNodes;

      FakeAudioContext.settleHung?.();
      await vi.advanceTimersByTimeAsync(10);
      await Promise.resolve();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(await pending).toBe("blocked");
      expect(ctx.liveNodes).toBe(liveAfterBlocked);
      expect(chime.getSnapshot().plays).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a context already running takes the synchronous path: 'played' with no timer advance needed", async () => {
    vi.useFakeTimers();
    try {
      const { chime } = await load();
      // Open and run the one context first, so the lease's ready is already settled true.
      chime.prime();
      await Promise.resolve();
      const ctx = FakeAudioContext.instances[0];
      expect(ctx.state).toBe("running");
      const outcome = chime.play(50);
      // No fake-timer advance at all: the result must not wait on the bound.
      await expect(outcome).resolves.toBe("played");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
