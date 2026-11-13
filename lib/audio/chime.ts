/**
 * The session-end alarm: `STRIKE_COUNT` strikes of one bell, each two sine
 * partials a perfect fifth apart (the upper slightly behind the lower) with a
 * short attack and an exponential fade, struck one bell's length apart so each
 * finishes ringing as the next begins. Synthesized on the one shared
 * `AudioContext` (`soundscape.lease()`), so there is no audio file to license
 * and nothing in `public/`.
 *
 * Contract for callers and tests:
 * - `chime.play(level)` is synchronous up to the point the sound is scheduled
 *   and then returns a promise that always resolves. It never throws or rejects.
 *   A refused context logs exactly one `console.warn` and leaves no node behind.
 * - `chime.preview(level)` plays the same alarm and also hands back the only
 *   way to stop it early. `play` returns no such handle, so the session-end
 *   route cannot silence a ringing alarm.
 * - `chime.prime()` unlocks the audio path. Call it inside a click handler.
 * - The count of `play` and `preview` calls is page-readable through
 *   `getSnapshot`, which is what lets a test watch for an alarm without audio
 *   hardware. One alarm is one play, however many strikes it has.
 *
 * Timing is entirely on the audio clock: every strike is scheduled in one
 * synchronous pass, envelopes are scheduled ramps, and teardown hangs off the
 * last-ending oscillator's `onended`. Nothing here uses a JS timer.
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

/** One alarm started by `preview`: the outcome, its end, and the way to stop it. */
export interface ChimePreview {
  readonly outcome: Promise<ChimeOutcome>;
  /** Resolves once the alarm's nodes are gone: finished, stopped, refused or failed. Never rejects. */
  readonly ended: Promise<void>;
  /** Fades this alarm out over `RELEASE_SECONDS` and tears it down. Does nothing once it has ended. */
  stop(): void;
}

export interface ChimePlayer {
  play(level: number): Promise<ChimeOutcome>;
  preview(level: number): ChimePreview;
  prime(): void;
  getSnapshot(): ChimeSnapshot;
  getServerSnapshot(): ChimeSnapshot;
  subscribe(listener: () => void): () => void;
}

interface StrikePartial {
  readonly frequency: number;
  /** Seconds after the bell is struck that this partial begins. */
  readonly offset: number;
  /** Share of a bell's peak gain. The shares sum to 1. */
  readonly share: number;
  /** Seconds from this partial's start to silence, release included. */
  readonly length: number;
}

// A5 and E6, the original bell. The lower partial leads so the ear takes the
// upper one as its answer. Both sound together once E6 enters, so the bell's
// peak is the sum of the two shares.
export const STRIKE_PARTIALS: readonly StrikePartial[] = [
  { frequency: 880, offset: 0, share: 0.6, length: 1.5 },
  { frequency: 1318.51, offset: 0.16, share: 0.4, length: 1.5 },
];

/** Bells in one alarm. Fixed, not derived from a measured time. */
export const STRIKE_COUNT = 5;
/** Seconds from a bell's strike to silence: its latest partial's offset plus length. */
export const STRIKE_LENGTH_SECONDS = Math.max(
  ...STRIKE_PARTIALS.map((partial) => partial.offset + partial.length)
);
/** Seconds from one strike to the next: one bell's full length, so bells never overlap. */
export const STRIKE_INTERVAL_SECONDS = STRIKE_LENGTH_SECONDS;
export const ATTACK_SECONDS = 0.015;
export const RELEASE_SECONDS = 0.1;

/** Gain the exponential fade reaches before the final linear ramp to exactly 0. */
const FADE_FLOOR = 0.0001;
/**
 * How long to wait for a suspended context to start before calling the alarm
 * blocked. Under autoplay policy `resume()` stays pending rather than failing.
 * A real resume settles in tens of milliseconds even on a slow device, so
 * 500 ms clears it, and it is well under the alarm's length so a blocked
 * alarm does not read as a hung page. Only a context that is not already
 * running waits at all; a primed one resolves immediately.
 */
const RESUME_BOUND_MS = 500;
/** Lead time so the first ramp is never scheduled in the past. */
const START_LEAD_SECONDS = 0.02;

/** Seconds after the alarm starts at which each strike begins. */
export const STRIKE_OFFSETS_SECONDS: readonly number[] = Array.from(
  { length: STRIKE_COUNT },
  (_, index) => index * STRIKE_INTERVAL_SECONDS
);

/**
 * Seconds from the start of the sound to its last scheduled sample, release
 * tail included, and excluding the start lead. It stays well under the
 * shortest legal session (60 s), so two alarms never overlap.
 */
export const CHIME_DURATION_SECONDS = Math.max(
  ...STRIKE_OFFSETS_SECONDS.flatMap((offset) =>
    STRIKE_PARTIALS.map((partial) => offset + partial.offset + partial.length)
  )
);

/**
 * The gain a voice's envelope has scheduled at `time`, in closed form from the
 * same four events `schedule` sets. Never read from `param.value`, which lags
 * the audio clock by a render quantum and reads the node default of 1 for a
 * voice that has only just begun.
 */
function scheduledGain(voice: Voice, time: number): number {
  const { begin, end, peak } = voice;
  if (time <= begin || time >= end) return 0;
  const attackEnd = begin + ATTACK_SECONDS;
  if (time < attackEnd) return (peak * (time - begin)) / ATTACK_SECONDS;
  const fadeEnd = end - RELEASE_SECONDS;
  if (time < fadeEnd) {
    return peak * Math.pow(FADE_FLOOR / peak, (time - attackEnd) / (fadeEnd - attackEnd));
  }
  return (FADE_FLOOR * (end - time)) / RELEASE_SECONDS;
}

/** Pins a voice's gain at its scheduled value at `time`, dropping later events, without a jump. */
function holdVoice(voice: Voice, time: number): void {
  const held = scheduledGain(voice, time);
  voice.envelope.gain.cancelScheduledValues(time);
  voice.envelope.gain.setValueAtTime(held, time);
}

/** One partial's nodes with the audio-clock times it begins and ends. */
interface Voice {
  readonly envelope: GainNode;
  readonly oscillator: OscillatorNode;
  readonly begin: number;
  readonly end: number;
  /** Peak gain of this partial: the master level times its share. */
  readonly peak: number;
}

interface Scheduled {
  /** Fades out and tears down. Returns the audio-clock time silence is reached, or null if already over. */
  stop(): number | null;
  /** Hard teardown for a context that never started. */
  abandon(): void;
}

function createChime(): ChimePlayer {
  let snapshot: ChimeSnapshot = { plays: 0, lastLevel: null };
  const serverSnapshot = snapshot;
  const listeners = new Set<() => void>();
  // The alarm that is ringing now, if any. A new alarm stops it first.
  let current: Scheduled | null = null;

  function publish(next: ChimeSnapshot): void {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function warn(reason: string, error?: unknown): void {
    console.warn(`Pomotato could not play the session chime: ${reason}.`, error ?? "");
  }

  function schedule(lease: ChimeLease, level: number, notBefore: number, onDone: () => void): Scheduled {
    const { context } = lease;
    const start = Math.max(context.currentTime + START_LEAD_SECONDS, notBefore);
    const peak = levelToGain(level);
    const nodes: AudioNode[] = [];
    const oscillators: OscillatorNode[] = [];
    const strikes: Voice[] = [];
    let lastEnding: OscillatorNode | null = null;
    let lastEnd = -Infinity;
    let finished = false;
    let stoppedAt: number | null = null;
    // Teardown trigger made by stop(); outside `nodes` so the lease count is unchanged.
    let marker: ConstantSourceNode | null = null;

    // Runs once however it is reached: natural end, stop, or abandon.
    const teardown = (): void => {
      if (finished) return;
      finished = true;
      nodes.forEach((node) => node.disconnect());
      marker?.disconnect();
      lease.release(nodes.length);
      onDone();
    };

    for (const offset of STRIKE_OFFSETS_SECONDS) {
      for (const partial of STRIKE_PARTIALS) {
        const strikeStart = start + offset + partial.offset;
        const strikeEnd = strikeStart + partial.length;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = partial.frequency;
        oscillator.connect(envelope);
        envelope.connect(context.destination);
        nodes.push(oscillator, envelope);
        oscillators.push(oscillator);
        strikes.push({
          envelope,
          oscillator,
          begin: strikeStart,
          end: strikeEnd,
          peak: peak * partial.share,
        });

        envelope.gain.setValueAtTime(0, strikeStart);
        envelope.gain.linearRampToValueAtTime(peak * partial.share, strikeStart + ATTACK_SECONDS);
        envelope.gain.exponentialRampToValueAtTime(FADE_FLOOR, strikeEnd - RELEASE_SECONDS);
        envelope.gain.linearRampToValueAtTime(0, strikeEnd);

        oscillator.start(strikeStart);
        oscillator.stop(strikeEnd);
        if (strikeEnd > lastEnd) {
          lastEnd = strikeEnd;
          lastEnding = oscillator;
        }
      }
    }
    // The greatest end, not the last one built.
    if (lastEnding !== null) lastEnding.onended = teardown;
    lease.retain(nodes.length);

    return {
      stop() {
        if (finished) return null;
        if (stoppedAt !== null) return stoppedAt;
        const now = context.currentTime;
        const silentAt = now + RELEASE_SECONDS;
        stoppedAt = silentAt;
        strikes.forEach((voice) => {
          const { envelope, oscillator, begin, end } = voice;
          if (begin > now) {
            // Not begun: its envelope has no real value yet, so drive it to 0
            // and end the oscillator before it starts so it never sounds.
            envelope.gain.cancelScheduledValues(now);
            envelope.gain.setValueAtTime(0, now);
            oscillator.stop(now);
            return;
          }
          holdVoice(voice, now);
          envelope.gain.linearRampToValueAtTime(0, silentAt);
          if (end > silentAt) oscillator.stop(silentAt);
        });
        if (lastEnding !== null) lastEnding.onended = null;
        // Strikes not yet started would end at their own start time, so the
        // teardown rides on a marker that ends when the fade does.
        // Connected so `ended` rides the rendered graph, the contract every engine honours.
        const source = context.createConstantSource();
        marker = source;
        source.connect(context.destination);
        source.onended = teardown;
        source.start(now);
        source.stop(silentAt);
        return silentAt;
      },
      // Used only when the browser refuses to start the context: the scheduled
      // sound would otherwise wait on a suspended clock and leak, or play late.
      abandon() {
        oscillators.forEach((oscillator) => {
          oscillator.onended = null;
          try {
            oscillator.stop();
          } catch {
            // Already stopped.
          }
        });
        teardown();
      },
    };
  }

  function start(level: number): ChimePreview {
    publish({ plays: snapshot.plays + 1, lastLevel: level });
    let finish: () => void = () => undefined;
    const ended = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let mine: Scheduled | null = null;

    async function run(): Promise<ChimeOutcome> {
      let lease: ChimeLease | null = null;
      try {
        lease = soundscape.lease();
        if (lease === null) {
          warn("this browser has no Web Audio");
          finish();
          return "unsupported";
        }
        // One alarm at a time: the new one starts once the old one's fade has finished.
        const notBefore = current?.stop() ?? 0;
        const scheduled = schedule(lease, level, notBefore, () => {
          if (current === scheduled) current = null;
          finish();
        });
        mine = scheduled;
        current = scheduled;
        if (await settleWithin(lease.ready, RESUME_BOUND_MS, false)) return "played";
        scheduled.abandon();
        warn("the browser did not allow audio to start");
        return "blocked";
      } catch (error) {
        if (mine !== null) mine.abandon();
        else lease?.release(0);
        finish();
        warn("playback failed", error);
        return "failed";
      }
    }

    const outcome = run();
    return {
      outcome,
      ended,
      stop() {
        if (mine !== null && current === mine) mine.stop();
      },
    };
  }

  return {
    play: (level) => start(level).outcome,
    preview: start,
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
