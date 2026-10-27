import { loadedFile, RAIN_FILE_PATH } from "./files";
import type { LayerSource, LayerVoice, NoiseBank } from "./types";

interface VoiceGraph {
  node<T extends AudioNode>(node: T): T;
  noise(buffer: AudioBuffer, cents?: number): AudioBufferSourceNode;
  osc(type: OscillatorType, frequency: number): OscillatorNode;
  /** A sine on the audio clock that moves `target` by +/- `depth`. No JS timer drives it. */
  lfo(frequency: number, depth: number, target: AudioParam): void;
  finish(): LayerVoice;
}

function graph(ctx: AudioContext): VoiceGraph {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];

  const node = <T extends AudioNode>(n: T): T => {
    nodes.push(n);
    return n;
  };

  const start = <T extends AudioScheduledSourceNode>(source: T): T => {
    node(source);
    sources.push(source);
    return source;
  };

  return {
    node,
    noise(buffer, cents = 0) {
      const source = start(ctx.createBufferSource());
      source.buffer = buffer;
      source.loop = true;
      source.detune.value = cents;
      // A random entry point, so turning a layer off and on does not replay the same second.
      source.start(0, Math.random() * buffer.duration);
      return source;
    },
    osc(type, frequency) {
      const source = start(ctx.createOscillator());
      source.type = type;
      source.frequency.value = frequency;
      source.start();
      return source;
    },
    lfo(frequency, depth, target) {
      const source = start(ctx.createOscillator());
      source.frequency.value = frequency;
      const amount = node(ctx.createGain());
      amount.gain.value = depth;
      source.connect(amount).connect(target);
      source.start();
    },
    finish() {
      return {
        nodeCount: nodes.length,
        stop(when, onDisposed) {
          for (const source of sources) source.stop(when);
          const last = sources[sources.length - 1];
          last.onended = () => {
            for (const n of nodes) n.disconnect();
            onDisposed();
          };
        },
      };
    },
  };
}

function biquad(
  ctx: AudioContext,
  g: VoiceGraph,
  type: BiquadFilterType,
  frequency: number,
  q = 0.7071
): BiquadFilterNode {
  const filter = g.node(ctx.createBiquadFilter());
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

function gainNode(ctx: AudioContext, g: VoiceGraph, value: number): GainNode {
  const gain = g.node(ctx.createGain());
  gain.gain.value = value;
  return gain;
}

/**
 * Droplet impacts on two loops, the second detuned down 120 cents so the pair
 * never lines up into an audible period, over a faint pink sheet of distant rain.
 */
export const rainSource: LayerSource = {
  create(ctx, bank: NoiseBank, output) {
    const g = graph(ctx);
    g.noise(bank.droplets).connect(gainNode(ctx, g, 0.5)).connect(output);
    g.noise(bank.droplets, -120).connect(gainNode(ctx, g, 0.4)).connect(output);

    const sheet = g.noise(bank.pink);
    sheet.connect(biquad(ctx, g, "bandpass", 2400, 0.6)).connect(gainNode(ctx, g, 0.07)).connect(output);
    return g.finish();
  },
};

/** A voice that plays nothing and disposes at once, for a file that has not loaded. */
const SILENT_VOICE: LayerVoice = {
  nodeCount: 0,
  stop(_when, onDisposed) {
    onDisposed();
  },
};

/**
 * Plays a decoded file on a loop. It ignores the noise bank, and it reads the
 * buffer synchronously: if the file has not arrived (or failed) the voice is
 * silent until the layer is next toggled. The loop seam is already crossfaded
 * into the buffer by the loader; the start point is random each time.
 */
export function fileSource(path: string, level: number): LayerSource {
  return {
    create(ctx, _bank, output) {
      const buffer = loadedFile(path);
      if (buffer === null) return SILENT_VOICE;
      const g = graph(ctx);
      g.noise(buffer).connect(gainNode(ctx, g, level)).connect(output);
      return g.finish();
    },
  };
}

export const rainFileSource: LayerSource = fileSource(RAIN_FILE_PATH, 0.8);

/** Pink noise through a band that wanders, with its level swelling on a separate, slower cycle. */
export const windSource: LayerSource = {
  create(ctx, bank, output) {
    const g = graph(ctx);
    const band = biquad(ctx, g, "bandpass", 450, 1.1);
    const swell = gainNode(ctx, g, 0.6);
    g.noise(bank.pink).connect(band).connect(swell).connect(output);
    g.lfo(0.13, 220, band.frequency);
    g.lfo(0.071, 0.3, swell.gain);
    return g.finish();
  },
};

/** Brown noise swelling about every ten seconds, with a thin hiss that rides the crest. */
export const wavesSource: LayerSource = {
  create(ctx, bank, output) {
    const g = graph(ctx);
    const surge = gainNode(ctx, g, 0.5);
    g.noise(bank.brown).connect(biquad(ctx, g, "lowpass", 700, 0.5)).connect(surge).connect(output);
    g.lfo(0.09, 0.42, surge.gain);

    const foam = gainNode(ctx, g, 0.06);
    g.noise(bank.pink).connect(biquad(ctx, g, "highpass", 1500)).connect(foam).connect(output);
    g.lfo(0.11, 0.06, foam.gain);
    return g.finish();
  },
};

/** Two sines a fraction of a hertz apart, so the pair beats slowly, plus quiet overtones. */
export const humSource: LayerSource = {
  create(ctx, _bank, output) {
    const g = graph(ctx);
    const tone = biquad(ctx, g, "lowpass", 400);
    tone.connect(gainNode(ctx, g, 0.6)).connect(output);

    const partials: ReadonlyArray<[OscillatorType, number, number]> = [
      ["sine", 55, 0.35],
      ["sine", 55.4, 0.35],
      ["sine", 110, 0.2],
      ["triangle", 165, 0.06],
    ];
    for (const [type, frequency, level] of partials) {
      g.osc(type, frequency).connect(gainNode(ctx, g, level)).connect(tone);
    }
    return g.finish();
  },
};
