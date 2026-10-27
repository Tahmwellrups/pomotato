import { levelToGain } from "./gain";
import { LAYERS } from "./layers";
import { DEFAULT_LAYER_MIX, type Mix } from "./mix";
import { createNoiseBank } from "./noise";
import type { LayerVoice, NoiseBank } from "./types";

/**
 * Level and on/off changes never assign a gain directly. Each one cancels what
 * is pending and approaches the target exponentially with this time constant
 * (about 95% of the way after three, so ~120 ms), which cannot click.
 */
export const RAMP_TIME_CONSTANT_SECONDS = 0.04;

/** A fading voice is stopped, and an idle context suspended, once the fade is inaudible. */
const VOICE_STOP_AFTER_SECONDS = 0.4;
const SUSPEND_AFTER_SECONDS = 0.5;

export type ContextState = "none" | AudioContextState;

/** What the engine is doing right now, as read by the UI and exposed on the trigger's `data-soundscape`. */
export interface SoundscapeSnapshot {
  /** `none` until the first gesture that asks for sound. */
  context: ContextState;
  /** Whether sound was asked for. Not persisted: a reload starts false. */
  playing: boolean;
  /** AudioContexts this document owns. Never more than one. */
  contexts: number;
  /** Nodes the engine currently holds in the graph. Does not grow across open/close or navigation. */
  nodes: number;
  /**
   * Per layer id: `on` is audible, which is derived and so cannot be true unless
   * the context is `running` or a resume is still pending (a refused or failed
   * resume therefore reads false). `gain` is the target the ramp is heading to.
   */
  layers: Readonly<Record<string, { on: boolean; gain: number }>>;
}

export type StartResult = "running" | "idle" | "blocked" | "unsupported";

export interface SoundscapeEngine {
  /**
   * Brings the graph in line with `mix` and `playing`. Call it from the event
   * handler that caused the change: the context is created and resumed
   * synchronously, before the first await, which is what autoplay policy needs.
   */
  apply(mix: Mix, playing: boolean): Promise<StartResult>;
  getSnapshot(): SoundscapeSnapshot;
  getServerSnapshot(): SoundscapeSnapshot;
  subscribe(listener: () => void): () => void;
}

interface ActiveVoice {
  fade: GainNode;
  voice: LayerVoice;
}

interface LayerRuntime {
  level: GainNode;
  active: ActiveVoice | null;
}

type ContextConstructor = typeof AudioContext;

function contextConstructor(): ContextConstructor | null {
  if (typeof window === "undefined") return null;
  const legacy = window as unknown as { webkitAudioContext?: ContextConstructor };
  return window.AudioContext ?? legacy.webkitAudioContext ?? null;
}

function ramp(param: AudioParam, target: number, now: number): void {
  param.cancelScheduledValues(now);
  param.setTargetAtTime(target, now, RAMP_TIME_CONSTANT_SECONDS);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function createEngine(): SoundscapeEngine {
  let ctx: AudioContext | null = null;
  let noise: NoiseBank | null = null;
  const runtimes = new Map<string, LayerRuntime>();
  const listeners = new Set<() => void>();

  let mix: Mix = {};
  let playing = false;
  let liveNodes = 0;
  // A resume that has been asked for and has not settled. While one is pending
  // the sound is on its way, so the layers read as audible and the button as Stop.
  let resumesInFlight = 0;
  // Bumped on every apply, so a pending suspend knows it has been overtaken.
  let generation = 0;

  function entryFor(id: string) {
    return mix[id] ?? DEFAULT_LAYER_MIX;
  }

  function soundWanted(): boolean {
    return playing && LAYERS.some((layer) => entryFor(layer.id).on);
  }

  function build(): SoundscapeSnapshot {
    return {
      context: ctx === null ? "none" : ctx.state,
      playing,
      contexts: ctx === null ? 0 : 1,
      nodes: liveNodes,
      layers: Object.fromEntries(
        LAYERS.map((layer) => {
          const entry = entryFor(layer.id);
          const audible = playing && entry.on && ctx !== null && (ctx.state === "running" || resumesInFlight > 0);
          return [layer.id, { on: audible, gain: audible ? round(levelToGain(entry.level)) : 0 }];
        })
      ),
    };
  }

  const serverSnapshot = build();
  let snapshot = serverSnapshot;

  function publish(): void {
    snapshot = build();
    listeners.forEach((listener) => listener());
  }

  function open(): AudioContext | null {
    const Constructor = contextConstructor();
    if (Constructor === null) return null;
    const created = new Constructor({ latencyHint: "playback" });
    created.onstatechange = publish;
    noise = createNoiseBank(created);
    return created;
  }

  function runtimeFor(context: AudioContext, id: string): LayerRuntime {
    const existing = runtimes.get(id);
    if (existing) return existing;
    const level = context.createGain();
    level.gain.value = 0;
    level.connect(context.destination);
    liveNodes += 1;
    const created: LayerRuntime = { level, active: null };
    runtimes.set(id, created);
    return created;
  }

  function fadeOutAndStop(runtime: LayerRuntime, now: number): void {
    const { active } = runtime;
    if (active === null) return;
    runtime.active = null;
    ramp(active.fade.gain, 0, now);
    active.voice.stop(now + VOICE_STOP_AFTER_SECONDS, () => {
      active.fade.disconnect();
      liveNodes -= active.voice.nodeCount + 1;
      publish();
    });
  }

  // Suspends the context on the audio clock: a source scheduled to end after
  // the fades fires `onended`, so no JS timer is involved.
  function suspendWhenSilent(context: AudioContext): void {
    if (context.state !== "running") return;
    const mine = generation;
    const marker = context.createConstantSource();
    marker.onended = () => {
      if (mine === generation && context.state === "running") void context.suspend();
    };
    marker.start();
    marker.stop(context.currentTime + SUSPEND_AFTER_SECONDS);
  }

  async function apply(nextMix: Mix, nextPlaying: boolean): Promise<StartResult> {
    mix = nextMix;
    playing = nextPlaying;
    generation += 1;

    const wanted = soundWanted();
    if (ctx === null && !wanted) {
      publish();
      return "idle";
    }
    if (ctx === null) {
      ctx = open();
      if (ctx === null) {
        playing = false;
        publish();
        return "unsupported";
      }
    }
    const context = ctx;
    const resuming = wanted && context.state !== "running" ? context.resume() : null;
    if (resuming !== null) resumesInFlight += 1;

    const now = context.currentTime;
    for (const layer of LAYERS) {
      const entry = entryFor(layer.id);
      const runtime = runtimeFor(context, layer.id);
      ramp(runtime.level.gain, levelToGain(entry.level), now);
      if (playing && entry.on) {
        if (runtime.active === null && noise !== null) {
          const fade = context.createGain();
          fade.gain.value = 0;
          fade.connect(runtime.level);
          const voice = layer.source.create(context, noise, fade);
          liveNodes += voice.nodeCount + 1;
          runtime.active = { fade, voice };
        }
        if (runtime.active !== null) ramp(runtime.active.fade.gain, 1, now);
      } else {
        fadeOutAndStop(runtime, now);
      }
    }
    if (!wanted) suspendWhenSilent(context);
    publish();

    if (resuming !== null) {
      let settled = true;
      try {
        await resuming;
      } catch {
        settled = false;
      }
      resumesInFlight -= 1;
      // The context may have started after the sound was already stopped. Read
      // the live intent, not the `wanted` captured above, which is stale here.
      if (!soundWanted()) suspendWhenSilent(context);
      publish();
      return settled && context.state === "running" ? "running" : "blocked";
    }
    return wanted ? "running" : "idle";
  }

  return {
    apply,
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

/**
 * The one engine for the document. It lives at module scope so closing the
 * dialog and client-side navigation (which unmount every component) leave the
 * sound and the single AudioContext alone. Nothing here runs at import time.
 */
export const soundscape: SoundscapeEngine = createEngine();
