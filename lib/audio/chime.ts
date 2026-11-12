/**
 * The session-end chime: two sine bells, a perfect fifth apart, each a short
 * attack and a long exponential fade. Synthesized on the one shared
 * `AudioContext` (`soundscape.lease()`), so there is no audio file to license
 * and nothing in `public/`.
 *
 * Contract for callers and tests:
 * - `chime.play(level)` is synchronous up to the point the sound is scheduled
 *   and then returns a promise that always resolves. It never throws or rejects.
 *   A refused context logs exactly one `console.warn` and leaves no node behind.
 * - `chime.prime()` unlocks the audio path. Call it inside a click handler.
 * - The count of `play` calls is page-readable through `getSnapshot`, which is
 *   what lets a test watch for a chime without audio hardware.
 *
 * Timing is entirely on the audio clock: envelopes are scheduled ramps and
 * teardown hangs off the last oscillator's `onended`. Nothing here uses a JS
 * timer, and nothing stops a node before its scheduled end.
 */
import { settleWithin } from "../settle-within";
import { levelToGain } from "./gain";
import { soundscape, type ChimeLease } from "./engine";

export type ChimeOutcome = "played" | "blocked" | "unsupported" | "failed";

export interface ChimeSnapshot {
  /** `play` calls made in this document. Preview and session ends both count. */
  plays: number;
  /** The level the latest `play` was given, or null before the first. */
  lastLevel: number | null;
}

export interface ChimePlayer {
  play(level: number): Promise<ChimeOutcome>;
  prime(): void;
  getSnapshot(): ChimeSnapshot;
  getServerSnapshot(): ChimeSnapshot;
  subscribe(listener: () => void): () => void;
}

interface Note {
  readonly frequency: number;
  /** Seconds after the chime starts. */
  readonly offset: number;
  /** Share of the chime's peak gain. The two shares sum to 1. */
  readonly share: number;
  /** Seconds from this note's start to silence, release included. */
  readonly length: number;
}

// A5 and E6. The fifth reads as a bell rather than a beep, and the lower note
// leads so the ear takes the upper one as its answer.
const NOTES: readonly Note[] = [
  { frequency: 880, offset: 0, share: 0.6, length: 1.5 },
  { frequency: 1318.51, offset: 0.16, share: 0.4, length: 1.5 },
];

const ATTACK_SECONDS = 0.015;
const RELEASE_SECONDS = 0.1;
/** Gain the exponential fade reaches before the final linear ramp to exactly 0. */
const FADE_FLOOR = 0.0001;
/**
 * How long to wait for a suspended context to start before calling the chime
 * blocked. Under autoplay policy `resume()` stays pending rather than failing.
 * A real resume settles in tens of milliseconds even on a slow device, so
 * 500 ms clears it, and it is under a third of the 1.66 s chime so a blocked
 * chime does not read as a hung page. Only a context that is not already
 * running waits at all; a primed one resolves immediately.
 */
const RESUME_BOUND_MS = 500;
/** Lead time so the first ramp is never scheduled in the past. */
const START_LEAD_SECONDS = 0.02;

/**
 * Seconds from the start of the sound to its last scheduled sample, release
 * tail included. The pm bound is 2.0 s: two chimes of the shortest legal
 * session (1 minute) can never overlap.
 */
export const CHIME_DURATION_SECONDS = Math.max(...NOTES.map((note) => note.offset + note.length));

function createChime(): ChimePlayer {
  let snapshot: ChimeSnapshot = { plays: 0, lastLevel: null };
  const serverSnapshot = snapshot;
  const listeners = new Set<() => void>();

  function publish(next: ChimeSnapshot): void {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function warn(reason: string, error?: unknown): void {
    console.warn(`Pomotato could not play the session chime: ${reason}.`, error ?? "");
  }

  function schedule(lease: ChimeLease, level: number): () => void {
    const { context } = lease;
    const start = context.currentTime + START_LEAD_SECONDS;
    const peak = levelToGain(level);
    const nodes: AudioNode[] = [];
    const oscillators: OscillatorNode[] = [];
    let ended = 0;

    const teardown = (): void => {
      nodes.forEach((node) => node.disconnect());
      lease.release(nodes.length);
    };

    for (const note of NOTES) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.frequency;
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      nodes.push(oscillator, envelope);

      const noteStart = start + note.offset;
      const noteEnd = noteStart + note.length;
      const noteGain = peak * note.share;
      envelope.gain.setValueAtTime(0, noteStart);
      envelope.gain.linearRampToValueAtTime(noteGain, noteStart + ATTACK_SECONDS);
      envelope.gain.exponentialRampToValueAtTime(FADE_FLOOR, noteEnd - RELEASE_SECONDS);
      envelope.gain.linearRampToValueAtTime(0, noteEnd);

      oscillator.onended = () => {
        ended += 1;
        if (ended === oscillators.length) teardown();
      };
      oscillators.push(oscillator);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    }
    lease.retain(nodes.length);

    // Used only when the browser refuses to start the context: the scheduled
    // sound would otherwise wait on a suspended clock and leak, or play late.
    return () => {
      oscillators.forEach((oscillator) => {
        oscillator.onended = null;
        try {
          oscillator.stop();
        } catch {
          // Already stopped.
        }
      });
      teardown();
    };
  }

  async function play(level: number): Promise<ChimeOutcome> {
    publish({ plays: snapshot.plays + 1, lastLevel: level });
    let lease: ChimeLease | null = null;
    let abandon: (() => void) | null = null;
    try {
      lease = soundscape.lease();
      if (lease === null) {
        warn("this browser has no Web Audio");
        return "unsupported";
      }
      abandon = schedule(lease, level);
      if (await settleWithin(lease.ready, RESUME_BOUND_MS, false)) return "played";
      abandon();
      warn("the browser did not allow audio to start");
      return "blocked";
    } catch (error) {
      if (abandon !== null) abandon();
      else lease?.release(0);
      warn("playback failed", error);
      return "failed";
    }
  }

  return {
    play,
    prime: () => soundscape.prime(),
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const chime: ChimePlayer = createChime();
