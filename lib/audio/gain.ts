/** The fader's range. Integers only, so the stored value and the control agree exactly. */
export const LEVEL_MIN = 0;
export const LEVEL_MAX = 100;
export const DEFAULT_LEVEL = 50;

/**
 * Gain at LEVEL_MAX for one layer. Four layers at full level sum to 2.0 before
 * the sources' own headroom, which is why a single layer tops out well under 1.
 */
export const MAX_LAYER_GAIN = 0.5;

/**
 * Control value to linear gain. A squared curve, because loudness is heard
 * roughly logarithmically and a linear fader spends its top half on the
 * difference between "loud" and "slightly louder". Monotonic, 0 at LEVEL_MIN,
 * MAX_LAYER_GAIN at LEVEL_MAX. Anything outside the range or not finite is
 * clamped, so it is defined for every input.
 */
export function levelToGain(level: number): number {
  if (!Number.isFinite(level)) return 0;
  const clamped = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, level));
  const fraction = (clamped - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
  return MAX_LAYER_GAIN * fraction * fraction;
}
