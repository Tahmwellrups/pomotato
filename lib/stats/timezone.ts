export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    // Throws RangeError for an unknown zone name.
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** The browser's IANA zone name. The only environment read in `lib/stats`; callers pass the result into the pure functions. */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Wall-clock fields of an instant in `timeZone`. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(ms));
  const out: LocalParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of parts) {
    switch (part.type) {
      case "year":
        out.year = Number(part.value);
        break;
      case "month":
        out.month = Number(part.value);
        break;
      case "day":
        out.day = Number(part.value);
        break;
      case "hour":
        out.hour = Number(part.value);
        break;
      case "minute":
        out.minute = Number(part.value);
        break;
      case "second":
        out.second = Number(part.value);
        break;
      default:
        break;
    }
  }
  return out;
}

function dayKey(parts: LocalParts): number {
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

/** Offset (ms) such that local wall clock = UTC + offset, at instant `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * First instant of the local calendar day `year-month-day` in `timeZone`
 * (month 1-12; out-of-range day/month values roll over like `Date.UTC`).
 * Follows the calendar, not a fixed 24 h step, so DST days are 23 or 25 h
 * long. If local midnight does not exist (a DST gap at 00:00) this is the
 * instant the clock jumps over it.
 */
export function startOfLocalDay(year: number, month: number, day: number, timeZone: string): number {
  const target = new Date(Date.UTC(year, month - 1, day));
  const targetKey = target.getUTCFullYear() * 10000 + (target.getUTCMonth() + 1) * 100 + target.getUTCDate();
  const guess = target.getTime();

  // Two-pass offset resolution handles the ordinary and DST-gap cases.
  const first = guess - offsetAt(guess, timeZone);
  const candidate = guess - offsetAt(first, timeZone);
  if (dayKey(localParts(candidate, timeZone)) >= targetKey && dayKey(localParts(candidate - 1, timeZone)) < targetKey) {
    return candidate;
  }

  // Fallback: binary search for the first instant whose local date reaches the target.
  let lo = guess - 15 * 3600000;
  let hi = guess + 15 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(localParts(mid, timeZone)) >= targetKey) hi = mid;
    else lo = mid;
  }
  return hi;
}
