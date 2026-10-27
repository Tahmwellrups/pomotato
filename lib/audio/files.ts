/**
 * The one file the rain layer plays. Swapping the recording is a change to this
 * line alone: nothing else reads the file's length, channel count or format.
 */
export const RAIN_FILE_PATH = "/sounds/rain-865572.m4a";

/**
 * Decoding needs a context, but the real one only exists after a gesture and a
 * layer must find its buffer ready when it is created. A one-frame offline
 * context decodes at page load instead; buffers are not tied to a context, and
 * playback resamples to the live one.
 */
const DECODE_SAMPLE_RATE = 44100;

/** Length of the overlap that hides the loop seam, capped to a quarter of the file. */
const CROSSFADE_SECONDS = 4;

const ready = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<void>>();

/**
 * The loop-ready buffer for `path`, or null while it is still loading or if it
 * failed. Never throws, so a layer can ask at any time.
 */
export function loadedFile(path: string): AudioBuffer | null {
  return ready.get(path) ?? null;
}

/**
 * Returns a buffer shorter by the overlap, whose tail has been blended into its
 * head with an equal-power curve (the right shape for uncorrelated material
 * like rain), so the last sample runs straight into the first with no seam.
 */
function crossfaded(context: BaseAudioContext, source: AudioBuffer): AudioBuffer {
  const overlap = Math.min(Math.floor(CROSSFADE_SECONDS * source.sampleRate), Math.floor(source.length / 4));
  if (overlap < 2) return source;
  const length = source.length - overlap;
  const out = context.createBuffer(source.numberOfChannels, length, source.sampleRate);
  for (let c = 0; c < source.numberOfChannels; c += 1) {
    const from = source.getChannelData(c);
    const to = out.getChannelData(c);
    to.set(from.subarray(0, length));
    for (let i = 0; i < overlap; i += 1) {
      const angle = ((i + 0.5) / overlap) * (Math.PI / 2);
      to[i] = from[i] * Math.sin(angle) + from[length + i] * Math.cos(angle);
    }
  }
  return out;
}

async function fetchAndDecode(path: string): Promise<void> {
  const Offline = typeof OfflineAudioContext === "undefined" ? null : OfflineAudioContext;
  if (Offline === null) return;
  const response = await fetch(path);
  if (!response.ok) return;
  const bytes = await response.arrayBuffer();
  const context = new Offline(1, 1, DECODE_SAMPLE_RATE);
  const decoded = await context.decodeAudioData(bytes);
  ready.set(path, crossfaded(context, decoded));
}

/**
 * Starts fetching and decoding `path` once. Safe to call from every mount and
 * never rejects: a 404, a network error or an undecodable file leaves the layer
 * silent and everything else untouched.
 */
export function preloadFile(path: string): Promise<void> {
  const existing = pending.get(path);
  if (existing) return existing;
  const started = fetchAndDecode(path).catch(() => undefined);
  pending.set(path, started);
  return started;
}

/** Every file a layer plays. Called around page load, not on the first gesture, so sound works offline afterwards. */
export function preloadLayerFiles(): void {
  void preloadFile(RAIN_FILE_PATH);
}
