// A player's local wall-clock time, from their IANA time zone.
// The engine reads only wall-clock fields (year, month, date, hours), so a Date
// built from those fields in a UTC process behaves like the player's own clock.

import type { DayKey } from '../../src/engine/types';

export interface Local {
  day: DayKey;
  hour: number;
  weekday: number; // 0 = Sunday
  /** A Date whose wall-clock fields equal the player's local time (process TZ must be UTC). */
  wall: Date;
}

export function localTime(now: Date, tz: string | undefined): Local {
  let parts: Record<string, string>;
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  } catch {
    return localTime(now, 'America/Chicago');
  }
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour) % 24;
  const min = Number(parts.minute);
  const wall = new Date(y, m - 1, d, h, min);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: h, weekday: wall.getDay(), wall };
}
