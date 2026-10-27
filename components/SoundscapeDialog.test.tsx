import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Task 011 criteria 9 (the dialog renders registry-length faders), 12, 13, 14,
// 16, 17 and 20 (the unit break for survival across unmount). Each test loads a
// fresh module graph so the engine singleton and the store start clean. The
// AudioContext is a counting fake; no real audio plays.

class FakeAudioContext {
  static instances = 0;
  /** When gated, resume() waits for the test to release it, so a test controls which action's message settles first. */
  static gated = false;
  static gates: (() => void)[] = [];
  state: AudioContextState = "suspended";
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  onstatechange: (() => void) | null = null;
  constructor() {
    FakeAudioContext.instances += 1;
  }
  private node() {
    const param = { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
    return {
      gain: param,
      frequency: { ...param },
      Q: { ...param },
      detune: { ...param },
      connect: <T,>(target: T) => target,
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
      type: "sine",
    };
  }
  createGain() {
    return this.node();
  }
  createOscillator() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createConstantSource() {
    return this.node();
  }
  createBuffer(_c: number, length: number) {
    return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) };
  }
  resume(): Promise<void> {
    if (!FakeAudioContext.gated) {
      this.state = "running";
      this.onstatechange?.();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      FakeAudioContext.gates.push(() => {
        this.state = "running";
        this.onstatechange?.();
        resolve();
      });
    });
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    return Promise.resolve();
  }
}

type Loaded = Awaited<ReturnType<typeof load>>;
let loaded: Loaded;

async function load() {
  vi.resetModules();
  Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true, writable: true });
  const testing = await import("@testing-library/react");
  const component = await import("./SoundscapeDialog");
  const layers = await import("@/lib/audio/layers");
  const store = await import("@/lib/preferences/store");
  const mix = await import("@/lib/audio/mix");
  const engine = await import("@/lib/audio/engine");
  const gain = await import("@/lib/audio/gain");
  return { ...testing, ...component, LAYERS: layers.LAYERS, usePreferencesStore: store.usePreferencesStore, defaultMix: mix.defaultMix, soundscape: engine.soundscape, gain };
}

beforeEach(async () => {
  FakeAudioContext.instances = 0;
  FakeAudioContext.gated = false;
  FakeAudioContext.gates = [];
  window.localStorage.clear();
  loaded = await load();
  loaded.usePreferencesStore.setState({ mix: loaded.defaultMix() });
});

afterEach(() => {
  loaded.cleanup();
});

function openDialog(): HTMLElement {
  loaded.fireEvent.click(loaded.screen.getByRole("button", { name: "Ambient sound" }));
  return loaded.screen.getByRole("dialog");
}

function triggerSnapshot(): { context: string; playing: boolean; contexts: number; layers: Record<string, { on: boolean; gain: number }> } {
  const node = document.querySelector("[data-soundscape]");
  if (!(node instanceof HTMLElement)) throw new Error("expected the trigger to carry data-soundscape");
  return JSON.parse(node.dataset.soundscape ?? "null");
}

describe("criterion 17 (unit): the dialog shows the stored mix on mount and starts nothing", () => {
  it("mounting with layers stored as on constructs no AudioContext and shows the stored levels", () => {
    const mix = loaded.defaultMix();
    mix[loaded.LAYERS[0].id] = { on: true, level: 80 };
    loaded.usePreferencesStore.setState({ mix });
    loaded.render(<loaded.SoundscapeDialog />);
    expect(FakeAudioContext.instances).toBe(0);
    expect(document.querySelector("[data-soundscape-context]")?.getAttribute("data-soundscape-context")).toBe("none");
    expect(triggerSnapshot().contexts).toBe(0);
    const dialog = openDialog();
    const first = loaded.LAYERS[0];
    const slider = loaded.within(dialog).getByRole("slider", { name: `${first.label} level` });
    expect(slider).toHaveValue("80");
    expect(loaded.within(dialog).getByRole("checkbox", { name: first.label })).toBeChecked();
    expect(FakeAudioContext.instances).toBe(0);
  });
});

describe("criterion 12: one native fader per registry layer, named and announcing its value", () => {
  it("renders exactly LAYERS.length sliders, each with a name and a value in aria-valuetext", () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    const sliders = loaded.within(dialog).getAllByRole("slider");
    expect(sliders.length).toBe(loaded.LAYERS.length);
    for (const layer of loaded.LAYERS) {
      const slider = loaded.within(dialog).getByRole("slider", { name: `${layer.label} level` });
      expect(slider).toHaveAttribute("min", "0");
      expect(slider).toHaveAttribute("max", "100");
      expect(slider).toHaveAttribute("aria-valuetext", "50 percent");
      expect(slider).toHaveValue("50");
    }
  });

  it("the announced value follows the control's value", () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    for (const layer of loaded.LAYERS) {
      const slider = loaded.within(dialog).getByRole("slider", { name: `${layer.label} level` });
      loaded.fireEvent.change(slider, { target: { value: "73" } });
      expect(slider).toHaveAttribute("aria-valuetext", "73 percent");
      expect(slider).toHaveValue("73");
    }
  });

  it("each layer's on/off control is a labelled checkbox, one per layer", () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    const boxes = loaded.within(dialog).getAllByRole("checkbox");
    expect(boxes.length).toBe(loaded.LAYERS.length);
    for (const layer of loaded.LAYERS) {
      expect(loaded.within(dialog).getByRole("checkbox", { name: layer.label })).not.toBeChecked();
    }
  });
});

describe("criterion 13: every interactive element in the dialog is enabled and does something", () => {
  it("no control is disabled, and each checkbox, slider and the stop control change state", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    const controls = loaded.within(dialog).getAllByRole("checkbox").concat(loaded.within(dialog).getAllByRole("slider"), loaded.within(dialog).getAllByRole("button"));
    for (const control of controls) expect(control).toBeEnabled();

    for (const layer of loaded.LAYERS) {
      const box = loaded.within(dialog).getByRole("checkbox", { name: layer.label });
      loaded.fireEvent.click(box);
      expect(loaded.usePreferencesStore.getState().mix[layer.id].on).toBe(true);
    }

    const slider = loaded.within(dialog).getByRole("slider", { name: `${loaded.LAYERS[0].label} level` });
    loaded.fireEvent.change(slider, { target: { value: "20" } });
    expect(loaded.usePreferencesStore.getState().mix[loaded.LAYERS[0].id].level).toBe(20);

    const toggle = loaded.within(dialog).getByRole("button", { name: "Stop all sound" });
    loaded.fireEvent.click(toggle);
    await loaded.waitFor(() => expect(loaded.within(dialog).getByRole("button", { name: "Start sound" })).toBeInTheDocument());
    expect(loaded.soundscape.getSnapshot().playing).toBe(false);
  });
});

describe("criterion 14 (unit): stop-all silences without discarding the mix, and starting again restores it", () => {
  it("stop keeps every layer's on state and level, and start restores the same mix", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    for (const layer of loaded.LAYERS) {
      loaded.fireEvent.click(loaded.within(dialog).getByRole("checkbox", { name: layer.label }));
      loaded.fireEvent.change(loaded.within(dialog).getByRole("slider", { name: `${layer.label} level` }), { target: { value: "40" } });
    }
    const before = JSON.stringify(loaded.usePreferencesStore.getState().mix);
    loaded.fireEvent.click(loaded.within(dialog).getByRole("button", { name: "Stop all sound" }));
    await loaded.waitFor(() => expect(loaded.within(dialog).getByRole("button", { name: "Start sound" })).toBeInTheDocument());
    expect(JSON.stringify(loaded.usePreferencesStore.getState().mix)).toBe(before);
    for (const layer of loaded.LAYERS) expect(triggerSnapshot().layers[layer.id].on).toBe(false);

    loaded.fireEvent.click(loaded.within(dialog).getByRole("button", { name: "Start sound" }));
    await loaded.waitFor(() => expect(loaded.within(dialog).getByRole("button", { name: "Stop all sound" })).toBeInTheDocument());
    expect(JSON.stringify(loaded.usePreferencesStore.getState().mix)).toBe(before);
    for (const layer of loaded.LAYERS) {
      expect(triggerSnapshot().layers[layer.id]).toEqual({ on: true, gain: Math.round(loaded.gain.levelToGain(40) * 10000) / 10000 });
    }
  });
});

describe("criterion 16: the status line is empty on arrival and speaks only what an action produced", () => {
  it("the live region exists, is empty on open, and gains text only after an action", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    const status = loaded.within(dialog).getByRole("status");
    expect(status.textContent).toBe("");
    loaded.fireEvent.click(loaded.within(dialog).getByRole("button", { name: "Start sound" }));
    await loaded.waitFor(() => expect(status.textContent).toBe("No layer is on yet. Turn one on to hear it."));
  });

  it("a stop that follows a pending start is the message that stays (the last action wins)", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    const status = loaded.within(dialog).getByRole("status");
    // Rain's first gesture creates the context and awaits resume(); the stop lands before that settles.
    loaded.fireEvent.click(loaded.within(dialog).getByRole("checkbox", { name: loaded.LAYERS[0].label }));
    loaded.fireEvent.click(loaded.within(dialog).getByRole("button", { name: "Stop all sound" }));
    await loaded.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(status.textContent).toBe("All sound stopped. Your mix is kept.");
  });

  it("turning a layer on announces it, by name", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    const layer = loaded.LAYERS[0];
    loaded.fireEvent.click(loaded.within(dialog).getByRole("checkbox", { name: layer.label }));
    await loaded.waitFor(() => expect(loaded.within(dialog).getByRole("status").textContent).toBe(`${layer.label} on.`));
  });
});

describe("criterion 20 (unit break target): closing and unmounting the dialog keeps the sound", () => {
  it("after an unmount with audio playing, the engine still reports the layer on and the context running", async () => {
    const view = loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    loaded.fireEvent.click(loaded.within(dialog).getByRole("checkbox", { name: loaded.LAYERS[0].label }));
    await loaded.waitFor(() => expect(loaded.soundscape.getSnapshot().context).toBe("running"));
    view.unmount();
    expect(loaded.soundscape.getSnapshot().playing).toBe(true);
    expect(loaded.soundscape.getSnapshot().context).toBe("running");
    expect(loaded.soundscape.getSnapshot().layers[loaded.LAYERS[0].id].on).toBe(true);
    expect(FakeAudioContext.instances).toBe(1);
  });

  it("remounting after the unmount shows one context still running, with no second gesture", async () => {
    const first = loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    loaded.fireEvent.click(loaded.within(dialog).getByRole("checkbox", { name: loaded.LAYERS[0].label }));
    await loaded.waitFor(() => expect(loaded.soundscape.getSnapshot().context).toBe("running"));
    first.unmount();
    loaded.render(<loaded.SoundscapeDialog />);
    expect(document.querySelector("[data-soundscape-context]")?.getAttribute("data-soundscape-context")).toBe("running");
    expect(FakeAudioContext.instances).toBe(1);
  });
});

/**
 * Criterion 16, interleavings. Each start awaits a gated resume(), and the test
 * releases the gates in an order chosen to make an older action settle last. Each
 * test would pass against promise-order (pre-fix) handling only if the newest
 * message happened to settle last, so the release order is the discriminator.
 */
describe("criterion 16: the last action the user took is the message that stays, under interleaving", () => {
  async function settle(): Promise<void> {
    await loaded.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }

  function statusOf(dialog: HTMLElement): string {
    return loaded.within(dialog).getByRole("status").textContent ?? "";
  }

  function box(dialog: HTMLElement, label: string) {
    return loaded.within(dialog).getByRole("checkbox", { name: label });
  }

  function stopOrStart(dialog: HTMLElement) {
    return loaded.within(dialog).getByRole("button", { name: /^(Stop all sound|Start sound)$/ });
  }

  it("a stop after a pending start: the start settles last and must not overwrite the stop", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    FakeAudioContext.gated = true;
    loaded.fireEvent.click(box(dialog, "Rain"));
    expect(FakeAudioContext.gates.length).toBe(1);
    loaded.fireEvent.click(stopOrStart(dialog));
    await settle();
    expect(statusOf(dialog)).toBe("All sound stopped. Your mix is kept.");
    FakeAudioContext.gates[0]();
    await settle();
    expect(statusOf(dialog)).toBe("All sound stopped. Your mix is kept.");
  });

  it("two rapid layer toggles: the older one settles last and must not win", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    FakeAudioContext.gated = true;
    loaded.fireEvent.click(box(dialog, "Rain"));
    loaded.fireEvent.click(box(dialog, "Wind"));
    expect(FakeAudioContext.gates.length).toBe(2);
    FakeAudioContext.gates[1]();
    await settle();
    expect(statusOf(dialog)).toBe("Wind on.");
    FakeAudioContext.gates[0]();
    await settle();
    expect(statusOf(dialog)).toBe("Wind on.");
  });

  it("a layer toggle, then stop-all while the toggle is still pending: stop is the last action", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    FakeAudioContext.gated = true;
    loaded.fireEvent.click(box(dialog, "Wind"));
    loaded.fireEvent.click(stopOrStart(dialog));
    await settle();
    expect(statusOf(dialog)).toBe("All sound stopped. Your mix is kept.");
    FakeAudioContext.gates[0]();
    await settle();
    expect(statusOf(dialog)).toBe("All sound stopped. Your mix is kept.");
  });

  it("stop, then start, with the starts pending: the newest start settles first and the older one must not win", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    FakeAudioContext.gated = true;
    loaded.fireEvent.click(box(dialog, "Rain"));
    loaded.fireEvent.click(stopOrStart(dialog));
    loaded.fireEvent.click(stopOrStart(dialog));
    await settle();
    expect(FakeAudioContext.gates.length).toBe(2);
    expect(statusOf(dialog)).toBe("");
    FakeAudioContext.gates[1]();
    await settle();
    expect(statusOf(dialog)).toBe("Sound started.");
    FakeAudioContext.gates[0]();
    await settle();
    expect(statusOf(dialog)).toBe("Sound started.");
  });

  it("the no-layer message wins over pending toggles that settle after it", async () => {
    loaded.render(<loaded.SoundscapeDialog />);
    const dialog = openDialog();
    FakeAudioContext.gated = true;
    loaded.fireEvent.click(box(dialog, "Rain"));
    loaded.fireEvent.click(box(dialog, "Rain"));
    loaded.fireEvent.click(stopOrStart(dialog));
    await settle();
    expect(statusOf(dialog)).toBe("No layer is on yet. Turn one on to hear it.");
    for (const release of [...FakeAudioContext.gates].reverse()) release();
    await settle();
    expect(statusOf(dialog)).toBe("No layer is on yet. Turn one on to hear it.");
  });
});
