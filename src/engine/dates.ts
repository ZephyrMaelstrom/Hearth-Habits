import type { DayKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day for a Date (the player's own clock decides when a day ends). */
export function dayKey(d: Date = new Date()): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = parseDay(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from a to b (b later = positive). */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 864e5);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(k: DayKey): number {
  return parseDay(k).getDay();
}

/** Weeks start on Monday, matching the Monday-to-Sunday boss week. */
export function weekStart(k: DayKey): DayKey {
  const wd = weekday(k);
  return addDays(k, wd === 0 ? -6 : 1 - wd);
}

export function monthKey(k: DayKey): string {
  return k.slice(0, 7);
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDay(k: DayKey): string {
  const d = parseDay(k);
  return `${WEEKDAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function shortDay(k: DayKey): string {
  const d = parseDay(k);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
