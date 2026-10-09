const MS_PER_MINUTE = 60_000;

/** `6_000_000` -> `"1 h 40 m"`, `1_500_000` -> `"25 m"`, `0` -> `"0 m"`. Rounds to the nearest minute. */
export function formatFocusTime(ms: number): string {
  const totalMinutes = Math.round(ms / MS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} m`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} m`;
}

export function formatSessionCount(count: number): string {
  return count === 1 ? "1 session" : `${count} sessions`;
}
