/**
 * Shared, versioned user preferences. Pure data and logic: no React, no DOM
 * access at import time, so it is safe to import from a server component, the
 * store, and the pre-hydration boot script generator alike.
 *
 * To add a preference (task 008's gauge style is the first): add the field to
 * `Preferences`, its default to `PREFERENCE_DEFAULTS`, its allowed values to
 * `PREFERENCE_VALUES`, and one `pick` line to `sanitizePreferences`. Nothing
 * else changes. A key whose value is not a closed set (task 010's background
 * reference) gets a validator instead of a value-set entry, plus the same one
 * `pick` line and one line in `isPreferences`. A key whose value is a plain
 * boolean (`taskPanelVisible`) is validated inline in `sanitizePreferences`
 * and `isPreferences` with `typeof`. A bump of `PREFERENCES_VERSION` is only
 * mechanically needed when an existing key's meaning changes, and the old
 * version is then handled in `migratePreferences`. Version 2 was taken for a
 * new key anyway, by owner ruling (task 015), purely so the stored `version`
 * records when `taskPanelVisible` appeared. Version 3 (task 017) is the same
 * kind of bump, for the three session lengths and the two session-end sound
 * keys. A length is validated by `isDurationMinutes` against its own bounds
 * (the same predicate the timer parser uses), the level by `isLevel`, and a
 * corrupt level takes the default rather than being clamped.
 */

import { DEFAULT_LEVEL } from "../audio/gain";
import { defaultMix, isLevel, isMix, sanitizeMix, type Mix } from "../audio/mix";
import { DURATION_KEYS, DURATION_LIMITS } from "../timer/constants";
import { isDurationMinutes } from "../timer/time";

/**
 * Stable identifiers, never colours or component names. `vessel` is the liquid
 * behind the digits (what ships today); `glyph` is the two-tone fill inside
 * them (prototype variant 4). A further style is a new entry here plus a
 * renderer, nothing else.
 */
export const GAUGE_STYLE_VALUES = ["vessel", "glyph"] as const;
export type GaugeStylePreference = (typeof GAUGE_STYLE_VALUES)[number];

/**
 * The uploaded background is a reference, never the image: the `id` of the one
 * row in the Dexie `backgrounds` table (`lib/db/background-repository.ts`), or
 * `null` for no background. The bytes cannot live here, localStorage is a ~5 MB
 * string-encoded quota shared with the timer and a failed write loses every key.
 * A reference whose row is gone is not an error: the reader treats it as none.
 */
export type BackgroundPreference = string | null;

export const BACKGROUND_ID_MAX_LENGTH = 64;
const BACKGROUND_ID_PATTERN = /^[A-Za-z0-9-]+$/;

/**
 * True for a plausible row id (a UUID in practice). Shape only: it does not look the row up.
 */
export function isBackgroundId(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length > 0 &&
    raw.length <= BACKGROUND_ID_MAX_LENGTH &&
    BACKGROUND_ID_PATTERN.test(raw)
  );
}

export interface Preferences {
  gaugeStyle: GaugeStylePreference;
  background: BackgroundPreference;
  /**
   * Task 011's ambient mix: which layers are on and each layer's level (an
   * integer 0 to 100, kept while the layer is off). Whether sound is playing
   * right now is deliberately not stored, autoplay policy forbids resuming it.
   */
  mix: Mix;
  /** Task 015: whether the task panel on `/` is shown. Default true; stored so a hidden panel stays hidden across reloads. */
  taskPanelVisible: boolean;
  /** Task 017: session lengths in whole minutes, each inside its own bounds in `lib/timer/constants.ts`. */
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Task 017: whether a chime plays when a session ends. Preview ignores it. */
  chimeEnabled: boolean;
  /** Task 017: the chime's volume, an integer 0 to 100, through the mixer's squared gain curve. */
  chimeLevel: number;
}

/** localStorage key. Not "pomotato-timer". The boot script reads this same constant. */
export const PREFERENCES_STORAGE_KEY = "pomotato-preferences";
export const PREFERENCES_VERSION = 3;

// The vessel, so no existing screen changes until someone picks otherwise.
export const DEFAULT_GAUGE_STYLE: GaugeStylePreference = "vessel";

export const PREFERENCE_DEFAULTS: Preferences = {
  gaugeStyle: DEFAULT_GAUGE_STYLE,
  background: null,
  mix: defaultMix(),
  taskPanelVisible: true,
  focusMinutes: DURATION_LIMITS.focusMinutes.default,
  shortBreakMinutes: DURATION_LIMITS.shortBreakMinutes.default,
  longBreakMinutes: DURATION_LIMITS.longBreakMinutes.default,
  chimeEnabled: true,
  chimeLevel: DEFAULT_LEVEL,
};

/** Keys that are not a closed value set: each has a validator or an inline check instead. */
type FreeFormKey =
  | "background"
  | "mix"
  | "taskPanelVisible"
  | "focusMinutes"
  | "shortBreakMinutes"
  | "longBreakMinutes"
  | "chimeEnabled"
  | "chimeLevel";

/** The accepted value set per closed-set key. The free-form keys have validators instead. */
export const PREFERENCE_VALUES: {
  readonly [K in Exclude<keyof Preferences, FreeFormKey>]: readonly Preferences[K][];
} = {
  gaugeStyle: GAUGE_STYLE_VALUES,
};

function pickMinutes(key: (typeof DURATION_KEYS)[number], raw: unknown): number {
  return isDurationMinutes(key, raw) ? raw : PREFERENCE_DEFAULTS[key];
}

function pick<K extends keyof typeof PREFERENCE_VALUES>(key: K, raw: unknown): Preferences[K] {
  const match = PREFERENCE_VALUES[key].find((value) => value === raw);
  return match === undefined ? PREFERENCE_DEFAULTS[key] : match;
}

/**
 * Turns anything (a parsed storage entry, a persisted `state`, `undefined`)
 * into a valid `Preferences`. Each key falls back to its default on its own,
 * so one bad key never discards a good one. Never throws.
 */
export function sanitizePreferences(raw: unknown): Preferences {
  const record: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    gaugeStyle: pick("gaugeStyle", record.gaugeStyle),
    background: isBackgroundId(record.background) ? record.background : PREFERENCE_DEFAULTS.background,
    mix: sanitizeMix(record.mix),
    taskPanelVisible:
      typeof record.taskPanelVisible === "boolean" ? record.taskPanelVisible : PREFERENCE_DEFAULTS.taskPanelVisible,
    focusMinutes: pickMinutes("focusMinutes", record.focusMinutes),
    shortBreakMinutes: pickMinutes("shortBreakMinutes", record.shortBreakMinutes),
    longBreakMinutes: pickMinutes("longBreakMinutes", record.longBreakMinutes),
    chimeEnabled: typeof record.chimeEnabled === "boolean" ? record.chimeEnabled : PREFERENCE_DEFAULTS.chimeEnabled,
    chimeLevel: isLevel(record.chimeLevel) ? record.chimeLevel : PREFERENCE_DEFAULTS.chimeLevel,
  };
}

/** True only for a value that is already exactly a valid `Preferences`. */
export function isPreferences(raw: unknown): raw is Preferences {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  const enumsValid = (Object.keys(PREFERENCE_VALUES) as (keyof typeof PREFERENCE_VALUES)[]).every((key) =>
    PREFERENCE_VALUES[key].some((value) => value === record[key])
  );
  return (
    enumsValid &&
    (record.background === null || isBackgroundId(record.background)) &&
    isMix(record.mix) &&
    typeof record.taskPanelVisible === "boolean" &&
    DURATION_KEYS.every((key) => isDurationMinutes(key, record[key])) &&
    typeof record.chimeEnabled === "boolean" &&
    isLevel(record.chimeLevel)
  );
}

/**
 * Version 3 is current. Unknown or older shapes are sanitised, never trusted.
 * A version-2 payload (no session lengths or chime keys) keeps every key it
 * has and gains the defaults for the rest, because `sanitizePreferences` falls
 * back per key. That per-key fallback is also why `gaugeStyle`, `background`
 * and `mix` each needed no version bump. The one thing sanitising cannot do is
 * carry the Focus length out of the old timer store; `store.ts` does that.
 *
 * Task 019 removed the `theme` key (the app is dark only) without a version
 * bump: no remaining key changed meaning. A stored `theme` is dropped as a
 * field, not mapped into anything and not by clearing the key: sanitising
 * builds the result from the known keys only, so an unknown key, whatever its
 * value, never reaches the store or the written-back envelope.
 */
export function migratePreferences(persisted: unknown): Preferences {
  return sanitizePreferences(persisted);
}

/**
 * Pre-hydration contract for the task panel (task 015): the boot script sets
 * this attribute on <html> to `TASK_PANEL_HIDDEN_VALUE` when the stored
 * `taskPanelVisible` is `false`, and removes it in every other case, so absent
 * means visible and matches the default.
 */
export const TASK_PANEL_ATTRIBUTE = "data-task-panel";
export const TASK_PANEL_HIDDEN_VALUE = "hidden";
