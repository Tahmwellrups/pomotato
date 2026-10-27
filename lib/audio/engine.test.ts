import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { levelToGain } from "./gain";
import { LAYERS } from "./layers";
import type { Mix } from "./mix";
import type { SoundscapeEngine } from "./engine";

// Task 011 criteria 8, 14, 17, 18, 19, 21, 26 (unit half). The engine is a
// module singleton, so each test loads a fresh copy. The AudioContext is a fake
// with a manual audio clock: `advance()` fires the onended of every source
// whose stop time has passed, which is the only way the engine gets a callback.

interface FakeParam {
  value: number;
  /** Direct `.value` assignments after construction. The ramp must never use this on an audible node. */
  directWrites: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

class FakeNode {
  readonly gain: FakeParam;
  readonly frequency: FakeParam;
  readonly Q: FakeParam;
  readonly detune: FakeParam;
  onended: (() => void) | null = null;
  stopAt: number | null = null;
  fired = false;
  disconnected = false;
  type = "sine";
  buffer: unknown = null;
  loop = false;

  constructor(readonly kind: string) {
    this.gain = param(1);
    this.frequency = param(440);
    this.Q = param(1);
    this.detune = param(0);
  }

  connect<T>(target: T): T {
    return target;
  }
  disconnect(): void {
    this.disconnected = true;
  }
  start(): void {}
  stop(when: number): void {
    this.stopAt = when;
  }
}

function param(initial: number): FakeParam {
  const p: FakeParam = {
    value: initial,
    directWrites: 0,
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
  return new Proxy(p, {
    set(target, key, next) {
      if (key === "value") target.directWrites += 1;
      return Reflect.set(target, key, next);
    },
  });
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
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
  createBiquadFilter() {
    return this.make("biquad");
  }
  createBufferSource() {
    return this.make("buffer");
  }
  createConstantSource() {
    return this.make("constant");
  }
  createBuffer(_channels: number, length: number) {
    return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) };
  }
  resume(): Promise<void> {
    this.state = "running";
    this.onstatechange?.();
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    this.onstatechange?.();
    return Promise.resolve();
  }
  /** Moves the audio clock, and fires `onended` for every source whose stop time has now passed. */
  advance(seconds: number): void {
    this.currentTime += seconds;
    for (const node of this.nodes) {
      if (node.stopAt !== null && !node.fired && node.stopAt <= this.currentTime) {
        node.fired = true;
        node.onended?.();
      }
    }
  }
  /** Live, non-destination nodes, the same count the engine reports as `nodes`. */
  get liveNodes(): number {
    return this.nodes.filter((node) => !node.disconnected).length;
  }
  get directWrites(): number {
    return this.nodes.reduce((sum, node) => sum + node.gain.directWrites, 0);
  }
}

function layersOn(overrides: Partial<Record<string, { on: boolean; level: number }>> = {}): Mix {
  return Object.fromEntries(
    LAYERS.map((layer) => [layer.id, { on: false, level: 50, ...overrides[layer.id] }]),
  );
}

function allOn(level = 50): Mix {
  return Object.fromEntries(LAYERS.map((layer) => [layer.id, { on: true, level }]));
}

let engine: SoundscapeEngine;

beforeEach(async () => {
  vi.resetModules();
  FakeAudioContext.instances = [];
  Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true, writable: true });
  engine = (await import("./engine")).soundscape;
});

describe("criterion 17 (unit): nothing is constructed before a gesture", () => {
  it("a fresh engine constructs no AudioContext and reports context none", () => {
    expect(FakeAudioContext.instances.length).toBe(0);
    expect(engine.getSnapshot().context).toBe("none");
    expect(engine.getSnapshot().contexts).toBe(0);
  });

  it("applying a mix with layers marked on but not playing still constructs nothing", async () => {
    const result = await engine.apply(allOn(80), false);
    expect(result).toBe("idle");
    expect(FakeAudioContext.instances.length).toBe(0);
    expect(engine.getSnapshot().context).toBe("none");
  });
});

describe("criterion 8: one context, running, generated from oscillator and buffer sources", () => {
  it("playing creates exactly one context and it is running", async () => {
    const result = await engine.apply(allOn(), true);
    expect(result).toBe("running");
    expect(FakeAudioContext.instances.length).toBe(1);
    expect(FakeAudioContext.instances[0].state).toBe("running");
    expect(engine.getSnapshot().context).toBe("running");
    const kinds = new Set(FakeAudioContext.instances[0].nodes.map((node) => node.kind));
    expect(kinds.has("buffer") || kinds.has("oscillator")).toBe(true);
    expect(kinds.has("buffer")).toBe(true);
    expect(kinds.has("oscillator")).toBe(true);
    expect(kinds.has("media")).toBe(false);
  });

  it("the engine never builds a ScriptProcessor or a media element source", () => {
    const sources = readSources();
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/createScriptProcessor|createMediaElementSource|createMediaStreamSource/);
    }
  });
});

describe("criterion 18: the accessor reports each layer's gain, and one layer's change moves only that layer", () => {
  it("reports the ramp target through levelToGain, rounded, and 0 when a layer is not audible", async () => {
    await engine.apply(layersOn({ rain: { on: true, level: 80 }, hum: { on: true, level: 20 } }), true);
    const snapshot = engine.getSnapshot();
    expect(snapshot.layers.rain).toEqual({ on: true, gain: Math.round(levelToGain(80) * 10000) / 10000 });
    expect(snapshot.layers.hum).toEqual({ on: true, gain: Math.round(levelToGain(20) * 10000) / 10000 });
    expect(snapshot.layers.wind).toEqual({ on: false, gain: 0 });
    expect(snapshot.layers.waves).toEqual({ on: false, gain: 0 });
  });

  for (const target of LAYERS) {
    it(`moving ${target.id}'s level leaves every other layer's reported gain byte-identical`, async () => {
      const base = allOn(50);
      await engine.apply(base, true);
      const before = engine.getSnapshot().layers;
      await engine.apply({ ...base, [target.id]: { on: true, level: 90 } }, true);
      const after = engine.getSnapshot().layers;
      for (const other of LAYERS) {
        if (other.id === target.id) continue;
        expect(JSON.stringify(after[other.id]), other.id).toBe(JSON.stringify(before[other.id]));
      }
      expect(after[target.id].gain).not.toBe(before[target.id].gain);
    });
  }

  it("reports context state and the playing flag from the same snapshot", async () => {
    await engine.apply(allOn(), true);
    const snapshot = engine.getSnapshot();
    expect(snapshot.context).toBe("running");
    expect(snapshot.playing).toBe(true);
    expect(snapshot.contexts).toBe(1);
  });
});

describe("criterion 19: off is silent and held idle; level changes are ramped, never assigned", () => {
  it("a level change on an audible layer makes no direct gain assignment and does ramp via setTargetAtTime", async () => {
    await engine.apply(allOn(50), true);
    const ctx = FakeAudioContext.instances[0];
    const writesBefore = ctx.directWrites;
    const rampsBefore = ctx.nodes.reduce((sum, node) => sum + node.gain.setTargetAtTime.mock.calls.length, 0);
    await engine.apply(allOn(70), true);
    expect(ctx.directWrites - writesBefore).toBe(0);
    const rampsAfter = ctx.nodes.reduce((sum, node) => sum + node.gain.setTargetAtTime.mock.calls.length, 0);
    expect(rampsAfter).toBeGreaterThan(rampsBefore);
  });

  it("switching a layer off makes no direct gain assignment either", async () => {
    await engine.apply(allOn(50), true);
    const ctx = FakeAudioContext.instances[0];
    const writesBefore = ctx.directWrites;
    await engine.apply(layersOn({ rain: { on: false, level: 50 }, wind: { on: true, level: 50 } }), true);
    expect(ctx.directWrites - writesBefore).toBe(0);
  });

  it("stop-all silences every layer in the snapshot and suspends the context on the audio clock", async () => {
    await engine.apply(allOn(), true);
    const ctx = FakeAudioContext.instances[0];
    await engine.apply(allOn(), false);
    for (const layer of LAYERS) expect(engine.getSnapshot().layers[layer.id]).toEqual({ on: false, gain: 0 });
    expect(ctx.state).toBe("running");
    ctx.advance(0.3);
    expect(ctx.state).toBe("running");
    ctx.advance(0.5);
    expect(ctx.state).toBe("suspended");
    expect(engine.getSnapshot().context).toBe("suspended");
  });

  it("a restart after stop-all resumes the same context and restores the same mix", async () => {
    await engine.apply(allOn(65), true);
    const ctx = FakeAudioContext.instances[0];
    await engine.apply(allOn(65), false);
    ctx.advance(1);
    expect(ctx.state).toBe("suspended");
    const result = await engine.apply(allOn(65), true);
    expect(result).toBe("running");
    expect(ctx.state).toBe("running");
    expect(FakeAudioContext.instances.length).toBe(1);
    expect(engine.getSnapshot().layers.rain).toEqual({ on: true, gain: Math.round(levelToGain(65) * 10000) / 10000 });
  });
});

describe("criterion 21 (unit): no leak, no growth across open and close cycles", () => {
  it("five on/off cycles keep one context and a node count that does not grow", async () => {
    const counts: number[] = [];
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await engine.apply(allOn(50), true);
      await engine.apply(allOn(50), false);
      FakeAudioContext.instances[0].advance(1);
      counts.push(engine.getSnapshot().nodes);
      expect(FakeAudioContext.instances.length).toBe(1);
    }
    expect(new Set(counts).size).toBe(1);
  });

  it("repeated applies of an identical mix while playing do not grow the graph", async () => {
    await engine.apply(allOn(50), true);
    const first = engine.getSnapshot().nodes;
    for (let i = 0; i < 5; i += 1) await engine.apply(allOn(50), true);
    expect(engine.getSnapshot().nodes).toBe(first);
    expect(FakeAudioContext.instances.length).toBe(1);
  });
});

describe("criterion 26 (static): the feature introduces no JS timer or animation frame", () => {
  it("no setInterval, setTimeout or requestAnimationFrame in lib/audio, the hook or the dialog", () => {
    for (const [file, text] of readSources()) {
      expect(text, file).not.toMatch(/\b(?:setInterval|setTimeout|requestAnimationFrame)\b/);
    }
  });
});

/** Every source file of the feature, read from disk. */
function readSources(): [string, string][] {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const audioDir = resolve(root, "lib/audio");
  const files = readdirSync(audioDir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => `lib/audio/${name}`);
  files.push("hooks/use-soundscape.ts", "components/SoundscapeDialog.tsx");
  return files.map((file) => [file, readFileSync(resolve(root, file), "utf8")]);
}
