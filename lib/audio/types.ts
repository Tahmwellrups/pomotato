/**
 * One shared bank of looping buffers per AudioContext, made by `createNoiseBank`.
 * Each member is generated on first read and then reused, so a layer pays only
 * for the buffers it touches. Sources filter these instead of generating their own.
 */
export interface NoiseBank {
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  /** Sparse rain impacts at random onsets, with no continuous bed. */
  readonly droplets: AudioBuffer;
}

/** One sounding instance of a layer. The engine owns its fade; the voice owns its nodes. */
export interface LayerVoice {
  /** Nodes this voice added to the graph, so the engine can report growth. */
  readonly nodeCount: number;
  /** Schedules every source to end at `when` (audio clock) and disconnects after the last one ends. */
  stop(when: number, onDisposed: () => void): void;
}

/**
 * What a layer is made of. The four shipped sources are synthesized; a
 * file-backed source would implement this same interface and ignore `noise`.
 */
export interface LayerSource {
  create(ctx: AudioContext, noise: NoiseBank, output: AudioNode): LayerVoice;
}
