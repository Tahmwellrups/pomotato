import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { levelToGain } from "./gain";

// Task 017 criteria 38, 42, 45, 46, 47, 48, 49, 51, 52, 53 (unit half) and task 021
// criteria 1-18 (unit half). The chime is a module singleton over the engine singleton,
// so every test loads fresh copies (vi.resetModules). The AudioContext is a fake with a
// manual audio clock: `advance()` moves time and fires `onended` for every source whose
// scheduled stop has passed. Gain params evaluate their scheduled automation at the
// clock's time, so the summed gain can be sampled, not assumed.

type Automation = {
  method: "setValueAtTime" | "linearRampToValueAtTime" | "exponentialRampToValueAtTime";
  value: number;
  time: number;
};
interface ParamCall {
  method: Automation["method"] | "setTargetAtTime" | "cancelScheduledValues";
  value: number;
  time: number;
}

class FakeParam {
  /** Every call the chime made, in order, cancellations included. */
  readonly calls: ParamCall[] = [];
  /** Automation in effect. A cancel drops what it covers, as the spec does. */
  private events: Automation[] = [];
  private base: number;
  directWrites = 0;

  constructor(private readonly clock: () => number, initial: number) {
    this.base = initial;
  }

  /**
   * The value at audio time `t`: the default before any automation. A linear ramp interpolates
   * arithmetically; an exponential ramp follows the spec curve v0 * (v1/v0)^x (geometric), so a decaying
   * fade lies below its linear chord. An exponential ramp to or from 0 holds the start value, as the spec does.
   */
  valueAt(t: number): number {
    let prev: Automation | null = null;
    let next: Automation | null = null;
    for (const event of [...this.events].sort((a, b) => a.time - b.time)) {
      if (event.time <= t) prev = event;
      else {
        next = event;
        break;
      }
    }
    if (prev === null) return this.base;
    if (next === null || next.method === "setValueAtTime") return prev.value;
    const span = next.time - prev.time;
    if (next.method === "exponentialRampToValueAtTime") {
      if (span <= 0) return next.value;
      if (prev.value === 0 || next.value === 0 || Math.sign(prev.value) !== Math.sign(next.value)) return prev.value;
      const x = (t - prev.time) / span;
      return prev.value * Math.pow(next.value / prev.value, x);
    }
    return span <= 0 ? next.value : prev.value + ((next.value - prev.value) * (t - prev.time)) / span;
  }

  get value(): number {
    return this.valueAt(this.clock());
  }

  set value(next: number) {
    this.directWrites += 1;
    this.base = next;
    this.events = [];
  }

  private automate(event: Automation): void {
    this.calls.push({ ...event });
    this.events.push(event);
  }

  setValueAtTime(value: number, time: number) {
    this.automate({ method: "setValueAtTime", value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.automate({ method: "linearRampToValueAtTime", value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.automate({ method: "exponentialRampToValueAtTime", value, time });
  }
  setTargetAtTime(value: number, time: number, timeConstant: number) {
    this.calls.push({ method: "setTargetAtTime", value, time });
    void timeConstant;
  }
  cancelScheduledValues(time: number) {
    this.calls.push({ method: "cancelScheduledValues", value: Number.NaN, time });
    this.events = this.events.filter((event) => event.time < time);
  }
  // No cancelAndHoldAtTime on this fake: the chime's fallback path is the one measured.
}

class FakeNode {
  readonly gain: FakeParam;
  readonly frequency: FakeParam;
  readonly Q: FakeParam;
  readonly detune: FakeParam;
  readonly playbackRate: FakeParam;
  onended: (() => void) | null = null;
  startAt: number | null = null;
  /** Every stop() call, in order. The chime's own stop is the scheduled end; anything earlier is an early stop. */
  stopCalls: number[] = [];
  /** What this node's output is connected to. */
  outputs: FakeNode[] = [];
  fired = false;
  disconnected = false;
  disconnectedAt: number | null = null;
  type = "sine";
  buffer: unknown = null;
  loop = false;

  constructor(
    readonly kind: string,
    private readonly clock: () => number
  ) {
    this.gain = new FakeParam(clock, 1);
    this.frequency = new FakeParam(clock, 1);
    this.Q = new FakeParam(clock, 1);
    this.detune = new FakeParam(clock, 0);
    this.playbackRate = new FakeParam(clock, 1);
  }

  get stopAt(): number | null {
    return this.stopCalls.length > 0 ? this.stopCalls[this.stopCalls.length - 1] : null;
  }

  connect<T>(target: T): T {
    this.outputs.push(target as unknown as FakeNode);
    return target;
  }

  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.disconnectedAt = this.clock();
  }

  start(when: number = this.clock()): void {
    this.startAt = when;
  }

  stop(when: number = this.clock()): void {
    this.stopCalls.push(when);
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
  destination: FakeNode;
  onstatechange: (() => void) | null = null;
  nodes: FakeNode[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
    this.destination = new FakeNode("destination", () => this.currentTime);
  }

  private make(kind: string): FakeNode {
    const node = new FakeNode(kind, () => this.currentTime);
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
      if (node.onended !== null && node.stopAt !== null && !node.fired && node.stopAt <= this.currentTime) {
        node.fired = true;
        node.onended();
      }
    }
  }
  get liveNodes(): number {
    return this.nodes.filter((node) => !node.disconnected).length;
  }
}

const REPO = process.cwd();
const CHIME_SOURCE = resolve(REPO, "lib/audio/chime.ts");

async function load() {
  vi.resetModules();
  const chimeModule = await import("./chime");
  const engineModule = await import("./engine");
  return { chime: chimeModule.chime, chimeModule, soundscape: engineModule.soundscape };
}

/** Every oscillator the chime built, in creation order. */
function oscillators(ctx: FakeAudioContext): FakeNode[] {
  return ctx.nodes.filter((node) => node.kind === "oscillator");
}

/** The envelope gain an oscillator feeds. */
function envelopeOf(oscillator: FakeNode): FakeNode {
  return oscillator.outputs[0];
}

/** Groups one alarm's oscillators into strikes, `perStrike` oscillators each. */
function strikesOf(oscs: FakeNode[], perStrike: number): FakeNode[][] {
  const strikes: FakeNode[][] = [];
  for (let i = 0; i < oscs.length; i += perStrike) strikes.push(oscs.slice(i, i + perStrike));
  return strikes;
}

/** Summed gain the listener hears at `t`: each oscillator that is sounding, through its live envelope. */
function audibleAt(oscs: FakeNode[], t: number): number {
  let sum = 0;
  for (const osc of oscs) {
    if (osc.startAt === null || t < osc.startAt || t >= (osc.stopAt ?? Infinity)) continue;
    const env = envelopeOf(osc);
    if (env.disconnectedAt !== null && env.disconnectedAt <= t) continue;
    sum += env.gain.valueAt(t);
  }
  return sum;
}

/** Largest audible sum over [from, to] sampled every `step` seconds. */
function peakAudible(oscs: FakeNode[], from: number, to: number, step = 0.002): number {
  let peak = 0;
  for (let t = from; t <= to; t += step) peak = Math.max(peak, audibleAt(oscs, t));
  return peak;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
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

describe("criterion 1: named constants, and no bare literals in the schedule", () => {
  it("exports the strike count, interval, strike length, attack and release as named constants", async () => {
    const { chimeModule } = await load();
    for (const name of ["STRIKE_COUNT", "STRIKE_INTERVAL_SECONDS", "STRIKE_LENGTH_SECONDS", "ATTACK_SECONDS", "RELEASE_SECONDS"] as const) {
      expect(typeof chimeModule[name], name).toBe("number");
    }
  });

  it("the schedule's numeric literals are limited to 0; every timing value comes from a named constant", () => {
    const source = readFileSync(CHIME_SOURCE, "utf8");
    const body = source.slice(source.indexOf("function schedule("), source.indexOf("function start("));
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Any numeric literal, decimal or exponent form, that is not part of an identifier.
    const literals = code.match(/(?<![\w.])(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? [];
    expect(new Set(literals)).toEqual(new Set(["0"]));
    // Per-partial timing comes from the partial's own offset and length; strike spacing and the
    // envelope ramps come from named constants. Neither may be replaced by a literal.
    for (const name of ["STRIKE_OFFSETS_SECONDS", "ATTACK_SECONDS", "RELEASE_SECONDS", "partial.offset", "partial.length"]) {
      expect(code, name).toContain(name);
    }
  });
});

describe("criterion 2: the strike count is a fixed constant (owner-tuned, 5)", () => {
  it("STRIKE_COUNT is exactly 5 (owner-tuned, third ruling), and every alarm schedules exactly that many strikes", async () => {
    const { chime, chimeModule } = await load();
    expect(Number.isInteger(chimeModule.STRIKE_COUNT)).toBe(true);
    expect(chimeModule.STRIKE_COUNT).toBe(5);
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    expect(oscillators(ctx)).toHaveLength(chimeModule.STRIKE_COUNT * chimeModule.STRIKE_PARTIALS.length);
    ctx.advance(7);
    const before = oscillators(ctx).length;
    await chime.play(50);
    expect(oscillators(ctx).length - before).toBe(chimeModule.STRIKE_COUNT * chimeModule.STRIKE_PARTIALS.length);
  });
});

describe("criterion 3: strikes are evenly spaced at STRIKE_INTERVAL_SECONDS", () => {
  it("the interval equals one bell's full length; strike k's leading partial begins k x interval after the first, and each partial begins at its offset within the strike", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    const strikes = strikesOf(oscillators(ctx), chimeModule.STRIKE_PARTIALS.length);
    const first = strikes[0][0].startAt as number;
    const bellLength = Math.max(...chimeModule.STRIKE_PARTIALS.map((p) => p.offset + p.length));
    expect(chimeModule.STRIKE_INTERVAL_SECONDS).toBeCloseTo(bellLength, 9);
    // The strike's start is its leading partial's start (offset 0). The stagger is inside the bell.
    strikes.forEach((strike, k) => {
      const strikeStart = first + k * chimeModule.STRIKE_INTERVAL_SECONDS;
      strike.forEach((osc, p) => {
        expect(osc.startAt).toBeCloseTo(strikeStart + chimeModule.STRIKE_PARTIALS[p].offset, 9);
      });
      expect(strike[0].startAt).toBeCloseTo(strikeStart, 9);
    });
  });
});

describe("criterion 4: each strike is silent before the next begins", () => {
  it("every strike's envelope reaches 0 at or before the next strike's start", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    const strikes = strikesOf(oscillators(ctx), chimeModule.STRIKE_PARTIALS.length);
    strikes.forEach((strike, k) => {
      const silentAt = Math.max(...strike.map((osc) => envelopeOf(osc).gain.calls.at(-1)?.time ?? Number.NaN));
      expect(Number.isNaN(silentAt)).toBe(false);
      if (k + 1 < strikes.length) expect(silentAt).toBeLessThanOrEqual(strikes[k + 1][0].startAt as number + 1e-12);
    });
  });
});

describe("criterion 5: every strike's envelope starts at 0 and ends by a ramp to 0", () => {
  it("every envelope begins with setValueAtTime(0), ends with a ramp to 0, and has no abrupt non-zero write", async () => {
    const { chime } = await load();
    await chime.play(80);
    const ctx = FakeAudioContext.instances[0];
    const envs = oscillators(ctx).map(envelopeOf);
    expect(envs).toHaveLength(oscillators(ctx).length);
    for (const env of envs) {
      const calls = env.gain.calls;
      expect(calls[0]).toMatchObject({ method: "setValueAtTime", value: 0 });
      expect(calls[calls.length - 1]).toMatchObject({ method: "linearRampToValueAtTime", value: 0 });
      expect(env.gain.directWrites).toBe(0);
      expect(calls.filter((c) => c.method === "setValueAtTime" && c.value !== 0)).toHaveLength(0);
    }
  });
});

describe("criterion 6: the whole alarm spans 8.0 s to 8.6 s", () => {
  it("max(stop) minus the first strike's start, from the scheduled node times, is in the band", async () => {
    const { chime } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    const oscs = oscillators(ctx);
    const span = Math.max(...oscs.map((o) => o.stopAt as number)) - Math.min(...oscs.map((o) => o.startAt as number));
    expect(span).toBeGreaterThanOrEqual(8.0);
    expect(span).toBeLessThanOrEqual(8.6);
  });
});

describe("criterion 7: the exported duration equals the scheduled span and is at most 9.0 s", () => {
  it("CHIME_DURATION_SECONDS matches max(stop) to 6 decimal places and is <= 9.0", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    const oscs = oscillators(ctx);
    const span = Math.max(...oscs.map((o) => o.stopAt as number)) - Math.min(...oscs.map((o) => o.startAt as number));
    expect(chimeModule.CHIME_DURATION_SECONDS).toBeLessThanOrEqual(9.0);
    expect(span).toBeCloseTo(chimeModule.CHIME_DURATION_SECONDS, 6);
  });
});

describe("criterion 8: one strike's peak is levelToGain(level)", () => {
  it("the per-partial peaks of each strike sum to levelToGain(level) (the peak budget); level 0 is gain 0", async () => {
    for (const level of [0, 25, 50, 75, 100]) {
      const { chime, chimeModule } = await load();
      FakeAudioContext.instances = [];
      await chime.play(level);
      const ctx = FakeAudioContext.instances[0];
      for (const strike of strikesOf(oscillators(ctx), chimeModule.STRIKE_PARTIALS.length)) {
        const peak = strike
          .map((osc) => Math.max(...envelopeOf(osc).gain.calls.filter((c) => c.method === "linearRampToValueAtTime").map((c) => c.value)))
          .reduce((sum, value) => sum + value, 0);
        expect(peak).toBeCloseTo(levelToGain(level), 10);
      }
    }
  });

  it("gain is monotonic in the level across the whole 0 to 100 range, and 0 at level 0", () => {
    const samples = Array.from({ length: 101 }, (_, level) => levelToGain(level));
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    expect(samples[0]).toBe(0);
  });

  // Sampled every 0.2 ms across one bell. The leading partial is at its peak at 0.015 s, but it has
  // decayed by the time the second partial reaches its own peak, so the loudest instant of a bell
  // sits below the per-partial peak budget. The ceiling (criterion 9) is what must hold.
  it("the loudest instant of one bell never exceeds levelToGain(level)", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(100);
    const ctx = FakeAudioContext.instances[0];
    const bell = strikesOf(oscillators(ctx), chimeModule.STRIKE_PARTIALS.length)[0];
    const from = bell[0].startAt as number;
    expect(peakAudible(bell, from, from + chimeModule.STRIKE_INTERVAL_SECONDS, 0.0002)).toBeLessThanOrEqual(levelToGain(100) + 1e-9);
  });

  // Brief criterion 8 (corrected 2026-11-13 after measurement): the loudest instant of a bell is strictly
  // below the peak gain budget, measured at 0.6379 x levelToGain(level) on the spec exponential curve (the earlier 0.9307 came from a linear-ramp fake that overstated every fade), reached at 0.175 s into the bell.
  // The budget is asserted in the peak-budget test above; this asserts the measured instant and its place.
  it("the loudest instant of one bell is the measured 0.6379 of the budget, reached at 0.175 s", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(100);
    const ctx = FakeAudioContext.instances[0];
    const bell = strikesOf(oscillators(ctx), chimeModule.STRIKE_PARTIALS.length)[0];
    const from = bell[0].startAt as number;
    const to = from + chimeModule.STRIKE_INTERVAL_SECONDS;
    let max = 0;
    let at = 0;
    for (let t = from; t <= to; t += 0.001) {
      const v = audibleAt(bell, t);
      if (v > max) {
        max = v;
        at = t - from;
      }
    }
    expect(max / levelToGain(100)).toBeCloseTo(0.6379, 3);
    expect(at).toBeCloseTo(0.175, 2);
    expect(max).toBeLessThan(levelToGain(100));
  });
});

describe("criterion 9: the summed gain across the alarm never exceeds levelToGain(level)", () => {
  it.each([50, 100])("sampled every 2 ms across the whole alarm, the audible sum stays at or under the ceiling (level %i)", async (level) => {
    const { chime, chimeModule } = await load();
    await chime.play(level);
    const ctx = FakeAudioContext.instances[0];
    const oscs = oscillators(ctx);
    const peak = peakAudible(oscs, 0, chimeModule.CHIME_DURATION_SECONDS + 0.1);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(levelToGain(level) + 1e-9);
  });
});

describe("criterion 10: every strike is scheduled in one synchronous pass inside play()", () => {
  it("all strikes exist with their start times before play() has resolved or any time has passed", async () => {
    const { chime, chimeModule } = await load();
    const pending = chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.currentTime).toBe(0);
    expect(oscillators(ctx)).toHaveLength(chimeModule.STRIKE_COUNT * chimeModule.STRIKE_PARTIALS.length);
    for (const osc of oscillators(ctx)) expect(typeof osc.startAt).toBe("number");
    await pending;
  });
});

describe("criterion 11: chime.ts has no JS timer or frame source", () => {
  it("chime.ts contains no setInterval, setTimeout, requestAnimationFrame or performance.now", () => {
    const source = readFileSync(CHIME_SOURCE, "utf8");
    expect(source).not.toMatch(/\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/);
  });
});

describe("criterion 12: teardown hangs off the last-ending oscillator; 20 alarms leave no residue", () => {
  it("exactly one oscillator carries onended and it is the one with the greatest end", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    const oscs = oscillators(ctx);
    const withEnded = oscs.filter((o) => o.onended !== null);
    expect(withEnded).toHaveLength(1);
    const ends = oscs.map((o) => o.stopAt as number).sort((a, b) => b - a);
    expect(withEnded[0].stopAt).toBe(ends[0]);
    // The greatest end is unique: the next-latest oscillator ends at least a stagger earlier.
    expect(ends[0] - ends[1]).toBeGreaterThan(1e-9);
    // With the stagger, the carrier is the final strike's upper partial, 0.16 s after its leading
    // partial. A teardown wired to the leading partial (the final strike's A5, which ends first)
    // would fire too early and fail here.
    const finalLeading = oscs[oscs.length - chimeModule.STRIKE_PARTIALS.length];
    expect(withEnded[0].stopAt! - finalLeading.stopAt!).toBeCloseTo(chimeModule.STRIKE_PARTIALS[1].offset - chimeModule.STRIKE_PARTIALS[0].offset, 9);
  });

  it("the live node count returns to its pre-chime value and no soundscape layer's target gain moves", async () => {
    const { chime, chimeModule, soundscape } = await load();
    chime.prime();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    const ringFor = chimeModule.CHIME_DURATION_SECONDS + 0.1;
    ctx.advance(ringFor);
    const baseline = soundscape.getSnapshot();
    // The engine's own idle-suspend markers are constant sources it does not disconnect, so the
    // fake's raw count is not the chime's; the chime's own oscillators and envelopes are.
    const chimeLive = () =>
      ctx.nodes.filter((node) => node.kind === "oscillator" || node.kind === "gain").filter((node) => !node.disconnected).length;
    for (let i = 0; i < 20; i += 1) {
      const pending = chime.play(50);
      ctx.advance(ringFor);
      await pending;
    }
    expect(soundscape.getSnapshot().nodes).toBe(baseline.nodes);
    expect(chimeLive()).toBe(0);
    expect(soundscape.getSnapshot().layers).toEqual(baseline.layers);
    expect(chime.getSnapshot().plays).toBe(21);
  });
});

describe("criterion 13: one alarm is one play", () => {
  it("each alarm increments plays by exactly 1 and lastLevel is the level passed", async () => {
    const { chime } = await load();
    await chime.play(40);
    expect(chime.getSnapshot()).toEqual({ plays: 1, lastLevel: 40 });
    await chime.play(70);
    expect(chime.getSnapshot()).toEqual({ plays: 2, lastLevel: 70 });
  });
});

describe("criterion 14 (unit half): preview plays the same alarm as the session end", () => {
  it("preview schedules the same strikes at the same times and durations as play", async () => {
    const schedule = async (mode: "play" | "preview") => {
      FakeAudioContext.instances = [];
      const { chime } = await load();
      if (mode === "play") await chime.play(50);
      else chime.preview(50);
      return oscillators(FakeAudioContext.instances[0]).map((o) => [o.startAt, o.stopAt]);
    };
    const fromPlay = await schedule("play");
    const fromPreview = await schedule("preview");
    expect(fromPreview).toEqual(fromPlay);
    expect(fromPreview).toHaveLength(fromPlay.length);
  });
});

describe("criterion 15 (unit half): the preview handle is a stop", () => {
  it("preview() returns a handle with stop(), and play() returns an outcome, not a handle", async () => {
    const { chime } = await load();
    const preview = chime.preview(50);
    expect(typeof preview.stop).toBe("function");
    await preview.outcome;
    const outcome = await chime.play(50);
    expect(typeof outcome).toBe("string");
  });
});

describe("criterion 16: stopping a preview ramps the live gain to 0 over the release time, then tears down", () => {
  it("the stop holds the live value, ramps to 0 within RELEASE_SECONDS, disconnects, and releases its lease once", async () => {
    const { chime, chimeModule, soundscape } = await load();
    const baseline = soundscape.getSnapshot().nodes;
    // Count the release calls the chime itself makes on its lease, not just the engine's count.
    const releases: number[] = [];
    const realLease = soundscape.lease.bind(soundscape);
    vi.spyOn(soundscape, "lease").mockImplementation(() => {
      const lease = realLease();
      if (lease === null) return lease;
      return { ...lease, release: (nodes: number) => { releases.push(nodes); lease.release(nodes); } };
    });
    const preview = chime.preview(50);
    const ctx = FakeAudioContext.instances[0];
    await preview.outcome;
    expect(soundscape.getSnapshot().nodes).toBe(baseline + chimeModule.STRIKE_COUNT * chimeModule.STRIKE_PARTIALS.length * 2);
    ctx.advance(1.0);
    const now = ctx.currentTime;
    const oscs = oscillators(ctx);
    const liveBefore = oscs.map((osc) => envelopeOf(osc).gain.valueAt(now));
    expect(liveBefore.some((value) => value > 0)).toBe(true);
    const callsBefore = oscs.map((osc) => envelopeOf(osc).gain.calls.length);

    preview.stop();
    const silentAt = now + chimeModule.RELEASE_SECONDS;
    oscs.forEach((osc, i) => {
      const param = envelopeOf(osc).gain;
      const written = param.calls.slice(callsBefore[i]);
      const begun = (osc.startAt as number) <= now;
      // The cancel happens at the stop time in every case.
      expect(written[0]).toMatchObject({ method: "cancelScheduledValues", time: now });
      // No non-zero write after the stop.
      expect(written.filter((c) => c.method === "setValueAtTime" && c.time > now && c.value !== 0)).toHaveLength(0);
      if (begun) {
        // Its automation has begun, so param.value is the live curve. The stop holds that value.
        expect(written[1]).toMatchObject({ method: "setValueAtTime", time: now });
        expect(written[1].value).toBeCloseTo(liveBefore[i], 12);
        // The last write is a ramp to 0 that lands within the release time.
        expect(written[written.length - 1]).toMatchObject({ method: "linearRampToValueAtTime", value: 0 });
        expect(written[written.length - 1].time).toBeLessThanOrEqual(silentAt + 1e-12);
        // Continuity: the gain at the stop equals what it was a moment before.
        expect(param.valueAt(now)).toBeCloseTo(liveBefore[i], 12);
      } else {
        // Not begun: its envelope has no automation yet, so param.value is the node default and is
        // not a live value. The stop pins it at 0, and the oscillator ends at or before now, so it
        // never sounds. Nothing audible, so no jump.
        expect(written[1]).toMatchObject({ method: "setValueAtTime", value: 0, time: now });
        expect(param.valueAt(now)).toBe(0);
        expect(osc.stopAt as number).toBeLessThanOrEqual(now);
      }
    });

    ctx.advance(chimeModule.RELEASE_SECONDS + 0.01);
    for (const osc of oscs) {
      expect(envelopeOf(osc).disconnected).toBe(true);
      expect(envelopeOf(osc).disconnectedAt as number).toBeGreaterThanOrEqual(silentAt - 1e-12);
    }
    await expect(preview.ended).resolves.toBeUndefined();
    // Lease balance: the alarm's retained nodes are released exactly once, so the count is back at baseline.
    expect(soundscape.getSnapshot().nodes).toBe(baseline);
    expect(releases).toEqual([chimeModule.STRIKE_COUNT * chimeModule.STRIKE_PARTIALS.length * 2]);
    preview.stop();
    expect(soundscape.getSnapshot().nodes).toBe(baseline);
    expect(releases).toHaveLength(1);
    expect(chime.getSnapshot().plays).toBe(1);
  });

  it("the ConstantSource marker that carries teardown is not counted in the lease, and stop twice is a no-op", async () => {
    const { chime, chimeModule, soundscape } = await load();
    const baseline = soundscape.getSnapshot().nodes;
    const preview = chime.preview(50);
    const ctx = FakeAudioContext.instances[0];
    await preview.outcome;
    ctx.advance(0.5);
    preview.stop();
    const markers = ctx.nodes.filter((node) => node.kind === "constant");
    expect(markers).toHaveLength(1);
    const ringing = soundscape.getSnapshot().nodes;
    expect(ringing).toBe(baseline + chimeModule.STRIKE_COUNT * chimeModule.STRIKE_PARTIALS.length * 2);
    preview.stop();
    expect(markers).toHaveLength(1);
    ctx.advance(chimeModule.RELEASE_SECONDS + 0.01);
    expect(soundscape.getSnapshot().nodes).toBe(baseline);
  });

  it("stopping before the first strike starts leaves no audible gain above the ceiling", async () => {
    // Defect probe. A stop inside the start lead (before any envelope event) holds the envelope at
    // the parameter's default of 1, not at the live value 0, so the strike that then starts is heard
    // at gain 1 for the release time. Criterion 16 forbids any abrupt write to a non-zero value.
    const { chime, chimeModule } = await load();
    const preview = chime.preview(50);
    const ctx = FakeAudioContext.instances[0];
    preview.stop();
    const oscs = oscillators(ctx);
    expect(peakAudible(oscs, 0, chimeModule.RELEASE_SECONDS, 0.001)).toBeLessThanOrEqual(levelToGain(50) + 1e-9);
  });

  it("stopping inside the first bell's stagger (leading partial begun, upper partial not) holds the live value under the ceiling", async () => {
    // Bell 1's leading partial begins at 0.02 s and its upper partial at 0.18 s. A stop at 0.05 s is
    // the case where one partial of the same strike is running and the other is not yet begun.
    const { chime, chimeModule } = await load();
    const preview = chime.preview(50);
    const ctx = FakeAudioContext.instances[0];
    await preview.outcome;
    ctx.advance(0.05);
    const now = ctx.currentTime;
    const oscs = oscillators(ctx);
    const [leading, upper] = oscs;
    expect((leading.startAt as number) <= now).toBe(true);
    expect((upper.startAt as number) > now).toBe(true);
    const before = audibleAt(oscs, now - 1e-6);
    expect(before).toBeGreaterThan(0);
    preview.stop();
    // No jump at the stop: the sound a moment after equals the sound a moment before.
    expect(audibleAt(oscs, now)).toBeCloseTo(before, 5);
    expect(peakAudible(oscs, 0, now + chimeModule.RELEASE_SECONDS + 0.01, 0.0005)).toBeLessThanOrEqual(levelToGain(50) + 1e-9);
    // The unbegun upper partial is silent from its own start, and was stopped at or before now.
    expect(upper.stopAt as number).toBeLessThanOrEqual(now);
    expect(envelopeOf(upper).gain.valueAt(now + 1e-6)).toBe(0);
  });
});

describe("criterion 17: a second play() while a preview rings does not layer two alarms", () => {
  it("the new alarm starts no earlier than the old one's silence, and the summed gain never exceeds the ceiling", async () => {
    const { chime, chimeModule } = await load();
    const preview = chime.preview(50);
    const ctx = FakeAudioContext.instances[0];
    await preview.outcome;
    ctx.advance(1.0);
    const old = oscillators(ctx).slice();
    const oldSilentAt = ctx.currentTime + chimeModule.RELEASE_SECONDS;
    await chime.play(50);
    const fresh = oscillators(ctx).slice(old.length);
    expect(fresh).toHaveLength(chimeModule.STRIKE_COUNT * chimeModule.STRIKE_PARTIALS.length);
    expect(Math.min(...fresh.map((o) => o.startAt as number))).toBeGreaterThanOrEqual(oldSilentAt - 1e-9);
    const all = [...old, ...fresh];
    const peak = peakAudible(all, 0, 1.0 + chimeModule.CHIME_DURATION_SECONDS + 0.2);
    expect(peak).toBeLessThanOrEqual(levelToGain(50) + 1e-9);
  });
});

describe("criterion 18: nothing on the session-end route stops a ringing alarm early", () => {
  it("no node is stopped early or disconnected before its scheduled end while the other chime calls run", async () => {
    const { chime, chimeModule } = await load();
    const pending = chime.play(60);
    const ctx = FakeAudioContext.instances[0];
    await pending;
    const oscs = oscillators(ctx);
    const scheduledEnds = oscs.map((o) => o.stopAt as number);
    const lastEnd = Math.max(...scheduledEnds);
    const listener = vi.fn();
    const unsubscribe = chime.subscribe(listener);
    for (let t = 0; t + 0.5 < lastEnd; t += 0.5) {
      chime.prime();
      chime.getSnapshot();
      ctx.advance(0.5);
      for (const osc of oscs) {
        expect(osc.disconnected).toBe(false);
        expect(osc.stopCalls).toEqual([scheduledEnds[oscs.indexOf(osc)]]);
      }
      expect(ctx.state).toBe("running");
    }
    unsubscribe();
    ctx.advance(lastEnd + 0.01 - ctx.currentTime);
    for (const osc of oscs) expect(osc.disconnectedAt as number).toBeGreaterThanOrEqual(lastEnd - 1e-12);
    expect(chimeModule.CHIME_DURATION_SECONDS).toBeCloseTo(lastEnd - (oscs[0].startAt as number), 6);
  });

  it("no app source other than the settings component calls preview(), so only the explicit preview stop can end an alarm early", () => {
    const roots = ["app", "components", "hooks", "lib", "widgets"].map((dir) => resolve(REPO, dir)).filter((dir) => existsSync(dir));
    const callers = roots
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => !file.endsWith("lib/audio/chime.ts") && /\bchime\.preview\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO, file));
    expect(callers).toEqual(["components/ChimeSettings.tsx"]);
  });

  it("a refused context stops nothing it did not itself schedule and leaves no node live", async () => {
    const { chime } = await load();
    FakeAudioContext.refuse = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(chime.play(50)).resolves.toBe("blocked");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances[0].liveNodes).toBe(0);
  });
});

describe("criterion 38 (017): the transition never cuts the chime short", () => {
  it("no node is stopped or disconnected before its scheduled end", async () => {
    const { chime, chimeModule } = await load();
    const pending = chime.play(60);
    const ctx = FakeAudioContext.instances[0];
    await pending;
    // Part way through the sound: nothing has been torn down.
    ctx.advance(1.0);
    expect(ctx.nodes.some((node) => node.disconnected)).toBe(false);
    expect(ctx.state).toBe("running");
    // Just short of the scheduled end: still nothing torn down.
    ctx.advance(chimeModule.CHIME_DURATION_SECONDS - 1.0 - 0.05);
    expect(ctx.nodes.some((node) => node.disconnected)).toBe(false);
    // Past the scheduled end: the teardown runs on the audio clock.
    ctx.advance(0.2);
    expect(oscillators(ctx).every((node) => node.disconnected)).toBe(true);
  });
});

describe("criterion 46 (017): the chime module has no JS timer or frame source", () => {
  it("chime.ts contains no setInterval, setTimeout, requestAnimationFrame or performance.now", () => {
    const source = readFileSync(CHIME_SOURCE, "utf8");
    expect(source).not.toMatch(/\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/);
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

describe("criterion 52 (017): a chime wakes a context the soundscape left suspended", () => {
  it("after the context is suspended, a session-end chime still plays", async () => {
    const { chime, chimeModule } = await load();
    await chime.play(50);
    const ctx = FakeAudioContext.instances[0];
    ctx.advance(chimeModule.CHIME_DURATION_SECONDS + 0.1);
    await ctx.suspend();
    expect(ctx.state).toBe("suspended");
    await expect(chime.play(50)).resolves.toBe("played");
    expect(ctx.state).toBe("running");
  });
});

describe("criterion 53 (017): blocked playback fails silently, with one warning and no throw", () => {
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
describe("criterion 53 (real browser, 017): a resume that never settles is classified blocked within the bound", () => {
  const RESUME_BOUND_MS = 500;

  it("a pending-forever resume resolves blocked within the bound, warns once, leaves no node live, and lets the context suspend again", async () => {
    vi.useFakeTimers();
    try {
      const { chime, chimeModule } = await load();
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
      ctx.advance(chimeModule.CHIME_DURATION_SECONDS + 0.5);
      ctx.advance(10); // the engine suspend marker is created by the teardown and fires after its own delay
      await vi.advanceTimersByTimeAsync(1000);
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
