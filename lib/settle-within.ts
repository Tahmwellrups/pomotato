/**
 * Resolves with `promise`'s value, or with `fallback` if it has not settled
 * within `ms`. A rejection also resolves to `fallback`. Used where a browser
 * API can stay pending forever instead of failing: `AudioContext.resume()`
 * under autoplay policy neither resolves nor rejects until a gesture arrives.
 *
 * A JS timer is the only way to bound that wait — a suspended context's own
 * clock does not advance, so the audio clock cannot measure it. This classifies
 * an outcome and never schedules, shapes or times a sound, which is why it does
 * not belong in `lib/audio` alongside the code that does.
 */
export function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        resolve(fallback);
      }
    );
  });
}
