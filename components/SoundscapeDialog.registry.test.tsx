import { afterEach, describe, expect, it, vi } from "vitest";

// Task 011 criterion 9, proven rather than asserted: a throwaway fifth registry
// entry is added through a module mock. The dialog must render five faders, the
// validator must accept and round-trip the fifth level, and nothing else is edited.

afterEach(() => {
  vi.doUnmock("@/lib/audio/layers");
  vi.resetModules();
});

describe("criterion 9: a fifth registry entry renders a fifth fader and round-trips through the validator", () => {
  it("the dialog renders five faders, the validator accepts the fifth level, and the store keeps it", async () => {
    vi.resetModules();
    const actual = await vi.importActual<typeof import("@/lib/audio/layers")>("@/lib/audio/layers");
    const fifth = { id: "fifth-probe", label: "Probe", source: actual.LAYERS[0].source };
    vi.doMock("@/lib/audio/layers", () => ({ LAYERS: [...actual.LAYERS, fifth] }));

    const { render, screen, within, fireEvent, cleanup } = await import("@testing-library/react");
    const { SoundscapeDialog } = await import("./SoundscapeDialog");
    const { isMix, defaultMix, sanitizeMix } = await import("@/lib/audio/mix");
    const { usePreferencesStore } = await import("@/lib/preferences/store");

    try {
      expect(Object.keys(defaultMix())).toContain("fifth-probe");
      expect(sanitizeMix({ "fifth-probe": { on: true, level: 33 } })["fifth-probe"]).toEqual({ on: true, level: 33 });

      render(<SoundscapeDialog />);
      fireEvent.click(screen.getByRole("button", { name: "Ambient sound" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getAllByRole("slider").length).toBe(5);
      expect(within(dialog).getByRole("slider", { name: "Probe level" })).toBeInTheDocument();

      const mix = { ...defaultMix(), "fifth-probe": { on: true, level: 33 } };
      expect(isMix(mix)).toBe(true);
      usePreferencesStore.getState().setMix(mix);
      const stored = JSON.parse(window.localStorage.getItem("pomotato-preferences") ?? "null") as { state: { mix: Record<string, unknown> } };
      expect(stored.state.mix["fifth-probe"]).toEqual({ on: true, level: 33 });
    } finally {
      cleanup();
    }
  });
});
