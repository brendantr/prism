/**
 * A training day is the device-local calendar date where a check-in occurs.
 *
 * `checkedInAt` remains the event instant. This module derives the separate
 * calendar label used for one-per-day identity without depending on the host
 * timezone in tests.
 */

type Instant = Date | string | number;

/** Strict `YYYY-MM-DD`, the shape Postgres `date` returns through PostgREST. */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Calendar date at a fixed offset from UTC.
 *
 * `utcOffsetMinutes` follows the ordinary sign convention: positive east of
 * UTC (`+600` for UTC+10), negative west (`-300` for UTC-5).
 */
export function localDateAtOffset(instant: Instant, utcOffsetMinutes: number): string {
  const at = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
  if (!Number.isFinite(at.getTime())) throw new RangeError('Training-day instant must be valid.');
  if (!Number.isFinite(utcOffsetMinutes)) {
    throw new RangeError('Training-day UTC offset must be finite.');
  }

  return new Date(at.getTime() + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** The local calendar date on this device at the supplied instant. */
export function deviceLocalDate(instant: Instant = new Date()): string {
  const at = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
  if (!Number.isFinite(at.getTime())) throw new RangeError('Training-day instant must be valid.');
  return localDateAtOffset(at, -at.getTimezoneOffset());
}
