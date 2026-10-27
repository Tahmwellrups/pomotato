import { DEFAULT_LEVEL, LEVEL_MAX, LEVEL_MIN } from "./gain";
import { LAYERS } from "./layers";

export interface LayerMix {
  on: boolean;
  level: number;
}

/** Keyed by layer id. A layer's level is kept while it is off. */
export type Mix = Record<string, LayerMix>;

export const DEFAULT_LAYER_MIX: Readonly<LayerMix> = { on: false, level: DEFAULT_LEVEL };

export function defaultMix(): Mix {
  return Object.fromEntries(LAYERS.map((layer) => [layer.id, { ...DEFAULT_LAYER_MIX }]));
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

export function isLevel(raw: unknown): raw is number {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= LEVEL_MIN && raw <= LEVEL_MAX;
}

/**
 * Anything in, a valid mix out, never throws. Each layer and each of its two
 * fields falls back alone, unknown ids are dropped, and a level that is out of
 * range, fractional or not a number takes the default instead of being clamped,
 * so a corrupt value never turns into a loud one.
 */
export function sanitizeMix(raw: unknown): Mix {
  const source = isRecord(raw) ? raw : {};
  return Object.fromEntries(
    LAYERS.map((layer) => {
      const entry = isRecord(source[layer.id]) ? (source[layer.id] as Record<string, unknown>) : {};
      return [
        layer.id,
        {
          on: typeof entry.on === "boolean" ? entry.on : DEFAULT_LAYER_MIX.on,
          level: isLevel(entry.level) ? entry.level : DEFAULT_LAYER_MIX.level,
        },
      ];
    })
  );
}

/** True only for a value that is already exactly a valid mix. */
export function isMix(raw: unknown): raw is Mix {
  if (!isRecord(raw)) return false;
  const keys = Object.keys(raw);
  if (keys.length !== LAYERS.length) return false;
  return LAYERS.every((layer) => {
    const entry = raw[layer.id];
    return isRecord(entry) && Object.keys(entry).length === 2 && typeof entry.on === "boolean" && isLevel(entry.level);
  });
}
