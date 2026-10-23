// Gate 1 measurement: did testers open the app on at least 12 of the last 14 days,
// and finish more Dailies in week 2 than in week 1?

import { addDays } from './dates';
import { levelFromXp } from './progress';
import type { DayKey, State } from './types';

export interface TesterReport {
  name: string;
  firstDay: DayKey;
  daysPlayed: number;
  window: { from: DayKey; to: DayKey };
  daysOpened: number;
  week1: { done: number; scheduled: number };
  week2: { done: number; scheduled: number };
  level: number;
  xp: number;
  momentum: number;
  openedOk: boolean;
  improvedOk: boolean;
  /** Per-day rows for the last 14 days, oldest first. */
  rows: { day: DayKey; opened: boolean; done: number; scheduled: number; xp: number }[];
}

export function testerReport(s: State): TesterReport {
  const to = addDays(s.today, -1); // the last closed day
  const from = addDays(to, -13);
  const rows: TesterReport['rows'] = [];
  for (let i = 0; i < 14; i++) {
    const day = addDays(from, i);
    const log = s.days[day];
    rows.push({
      day,
      opened: !!log?.opened,
      done: log?.done ?? 0,
      scheduled: log?.scheduled ?? 0,
      xp: Math.round(log?.xp ?? 0),
    });
  }
  const sum = (part: typeof rows) =>
    part.reduce((a, r) => ({ done: a.done + r.done, scheduled: a.scheduled + r.scheduled }), { done: 0, scheduled: 0 });
  const week1 = sum(rows.slice(0, 7));
  const week2 = sum(rows.slice(7));
  const daysOpened = rows.filter((r) => r.opened && r.day >= s.profile.createdDay).length;
  return {
    name: s.profile.name,
    firstDay: s.profile.createdDay,
    daysPlayed: Object.values(s.days).filter((d) => d.opened).length,
    window: { from, to },
    daysOpened,
    week1,
    week2,
    level: levelFromXp(s.xp),
    xp: Math.round(s.xp),
    momentum: s.momentum,
    openedOk: daysOpened >= 12,
    improvedOk: week2.done > week1.done,
    rows,
  };
}

export function reportText(r: TesterReport): string {
  return [
    `Hearth & Habits tester report: ${r.name}`,
    `Window: ${r.window.from} to ${r.window.to}`,
    `Days opened: ${r.daysOpened} of 14 (target 12) ${r.openedOk ? 'PASS' : 'not yet'}`,
    `Dailies done: week 1 ${r.week1.done}/${r.week1.scheduled}, week 2 ${r.week2.done}/${r.week2.scheduled} ${r.improvedOk ? 'PASS' : 'not yet'}`,
    `Level ${r.level}, ${r.xp} XP, Momentum ${r.momentum.toFixed(2)}`,
    '',
    'Day, opened, Dailies done/scheduled, XP',
    ...r.rows.map((x) => `${x.day}, ${x.opened ? 'yes' : 'no'}, ${x.done}/${x.scheduled}, ${x.xp}`),
  ].join('\n');
}
