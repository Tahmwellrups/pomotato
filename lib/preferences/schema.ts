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
 * `pick` line and one line in `isPreferences`. Bump `PREFERENCES_VERSION` only
 * when an existing key's meaning changes, and handle the old version in
 * `migratePreferences`.
 */

export const THEME_VALUES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_VALUES)[number];

/** The concrete theme that gets painted. `system` is never a painted value. */
export type ResolvedTheme = "light" | "dark";

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

/** True for a plausible row id (a UUID in practice). Shape only: it does not look the row up. */
export function isBackgroundId(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length > 0 &&
    raw.length <= BACKGROUND_ID_MAX_LENGTH &&
    BACKGROUND_ID_PATTERN.test(raw)
  );
}

export interface Preferences {
  theme: ThemePreference;
  gaugeStyle: GaugeStylePreference;
  background: BackgroundPreference;
}

/** localStorage key. Not "pomotato-timer". The boot script reads this same constant. */
export const PREFERENCES_STORAGE_KEY = "pomotato-preferences";
export const PREFERENCES_VERSION = 1;

export const DEFAULT_THEME: ThemePreference = "system";

// The vessel, so no existing screen changes until someone picks otherwise.
export const DEFAULT_GAUGE_STYLE: GaugeStylePreference = "vessel";

export const PREFERENCE_DEFAULTS: Preferences = {
  theme: DEFAULT_THEME,
  gaugeStyle: DEFAULT_GAUGE_STYLE,
  background: null,
};

/** The accepted value set per closed-set key. `background` is validated by `isBackgroundId` instead. */
export const PREFERENCE_VALUES: {
  readonly [K in Exclude<keyof Preferences, "background">]: readonly Preferences[K][];
} = {
  theme: THEME_VALUES,
  gaugeStyle: GAUGE_STYLE_VALUES,
};

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
    theme: pick("theme", record.theme),
    gaugeStyle: pick("gaugeStyle", record.gaugeStyle),
    background: isBackgroundId(record.background) ? record.background : PREFERENCE_DEFAULTS.background,
  };
}

/** True only for a value that is already exactly a valid `Preferences`. */
export function isPreferences(raw: unknown): raw is Preferences {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  const enumsValid = (Object.keys(PREFERENCE_VALUES) as (keyof typeof PREFERENCE_VALUES)[]).every((key) =>
    PREFERENCE_VALUES[key].some((value) => value === record[key])
  );
  return enumsValid && (record.background === null || isBackgroundId(record.background));
}

/**
 * Version 1 is current. Unknown or older shapes are sanitised, never trusted.
 * A v1 payload written before `gaugeStyle` existed keeps its theme and gains the
 * default, because `sanitizePreferences` falls back per key. That is why adding
 * `gaugeStyle` and then `background` needed no version bump.
 */
export function migratePreferences(persisted: unknown): Preferences {
  return sanitizePreferences(persisted);
}

/**
 * The one resolver. Stored preference plus the OS signal gives the concrete
 * theme. `light` and `dark` ignore the OS entirely.
 */
export function resolveTheme(preference: ThemePreference, osPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return osPrefersDark ? "dark" : "light";
  return preference;
}

export const DARK_CLASS = "dark";

/**
 * Idempotent: `toggle` with an explicit force can never leave a duplicated or
 * missing `dark` class, however many times it runs.
 */
export function applyResolvedTheme(root: Element, resolved: ResolvedTheme): void {
  root.classList.toggle(DARK_CLASS, resolved === "dark");
}
