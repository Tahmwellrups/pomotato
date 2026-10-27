import { humSource, rainFileSource, wavesSource, windSource } from "./sources";
import type { LayerSource } from "./types";

export interface LayerDefinition {
  /** Stable identifier, persisted and keyed on by tests. Never the label. */
  readonly id: string;
  /** What the control says. It may only name what the source actually synthesizes. */
  readonly label: string;
  readonly source: LayerSource;
}

/**
 * The one list of layers. The dialog, the preference validator, the persisted
 * shape and the engine all read it, so a fifth layer is one entry here plus its
 * source and nothing else. Importing it does no audio work.
 */
export const LAYERS: readonly LayerDefinition[] = [
  { id: "rain", label: "Rain", source: rainFileSource },
  { id: "wind", label: "Wind", source: windSource },
  { id: "waves", label: "Waves", source: wavesSource },
  { id: "hum", label: "Hum", source: humSource },
];
