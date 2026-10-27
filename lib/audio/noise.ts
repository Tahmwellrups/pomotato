import type { NoiseBank } from "./types";

const SECONDS = 6;

function fill(ctx: AudioContext, next: () => number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = next();
  return buffer;
}

const white = (): number => Math.random() * 2 - 1;

// Paul Kellett's economy pink filter (musicdsp.org, public domain); the 0.11
// scale keeps the peak under 1. Provenance is recorded in docs/DECISIONS.md:
// it is a published coefficient set, the only third-party material here.
function pinkGenerator(): () => number {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  return () => {
    const w = white();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    return out;
  };
}

// Leaky integrator of white noise; 3.5 brings it back to roughly full scale.
function brownGenerator(): () => number {
  let last = 0;
  return () => {
    last = (last + 0.02 * white()) / 1.02;
    return last * 3.5;
  };
}

const DROPLET_SECONDS = 8;
const DROPLET_PEAK = 0.8;

/** Seconds until the next onset of a Poisson process at `rate` events per second. */
function gap(rate: number): number {
  return -Math.log(1 - Math.random()) / rate;
}

function between(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

/**
 * Adds one impact at `start`. Samples past the end wrap to the front, so the
 * loop point carries no seam and no onset is cut off.
 */
function add(data: Float32Array, start: number, length: number, sample: (n: number) => number): void {
  for (let n = 0; n < length; n += 1) {
    const at = (start + n) % data.length;
    data[at] += sample(n);
  }
}

/**
 * A field of rain impacts at Poisson-distributed onsets. Three kinds, each with
 * its own rate and per-impact randomised level, decay and brightness or pitch:
 * fine ticks (a short burst of low-passed noise), drops (a damped sine whose
 * pitch rises as it decays, like a bubble) and rarer, lower plops.
 */
function dropletField(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * DROPLET_SECONDS), rate);
  const data = buffer.getChannelData(0);

  for (let t = gap(130); t < DROPLET_SECONDS; t += gap(130)) {
    const level = 0.1 + Math.random() ** 2 * 0.9;
    const tau = between(0.0008, 0.004) * rate;
    const smooth = between(0.05, 0.7);
    let state = 0;
    add(data, Math.floor(t * rate), Math.ceil(tau * 6), (n) => {
      state += (1 - smooth) * ((Math.random() * 2 - 1) - state);
      return state * level * Math.exp(-n / tau);
    });
  }

  for (let t = gap(28); t < DROPLET_SECONDS; t += gap(28)) {
    const level = 0.15 + Math.random() ** 2 * 0.6;
    const tau = between(0.003, 0.012) * rate;
    const base = between(1500, 6500) / rate;
    const rise = between(0.2, 0.8);
    let phase = 0;
    add(data, Math.floor(t * rate), Math.ceil(tau * 6), (n) => {
      phase += 2 * Math.PI * base * (1 + (rise * n) / tau);
      return Math.sin(phase) * level * Math.exp(-n / tau);
    });
  }

  for (let t = gap(6); t < DROPLET_SECONDS; t += gap(6)) {
    const level = 0.2 + Math.random() * 0.5;
    const tau = between(0.012, 0.03) * rate;
    const base = between(350, 1100) / rate;
    const rise = between(0.4, 1.2);
    let phase = 0;
    add(data, Math.floor(t * rate), Math.ceil(tau * 5), (n) => {
      phase += 2 * Math.PI * base * (1 + (rise * n) / tau);
      return Math.sin(phase) * level * Math.exp(-n / tau);
    });
  }

  let peak = 0;
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? DROPLET_PEAK / peak : 1;
  for (let i = 0; i < data.length; i += 1) data[i] *= scale;
  return buffer;
}

function once(make: () => AudioBuffer): () => AudioBuffer {
  let cached: AudioBuffer | null = null;
  return () => (cached ??= make());
}

/**
 * Each buffer is generated sample by sample the first time a layer asks for it,
 * then reused. Nothing is decoded or fetched, and a layer pays only for the
 * colours it filters.
 */
export function createNoiseBank(ctx: AudioContext): NoiseBank {
  const white_ = once(() => fill(ctx, white));
  const pink_ = once(() => fill(ctx, pinkGenerator()));
  const brown_ = once(() => fill(ctx, brownGenerator()));
  const droplets_ = once(() => dropletField(ctx));
  return {
    get white() {
      return white_();
    },
    get pink() {
      return pink_();
    },
    get brown() {
      return brown_();
    },
    get droplets() {
      return droplets_();
    },
  };
}
