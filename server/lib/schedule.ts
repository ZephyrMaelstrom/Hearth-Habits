// Deciding what the hourly job owes each player right now. GitHub runs the job
// roughly hourly and sometimes late, so each item has a window (a few hours
// after the chosen time) and is done once per day or week.

import { addDays, daysBetween, weekStart } from '../../src/engine/dates';
import { currentFight } from '../../src/engine/boss';
import { completionFor, scheduledDailies } from '../../src/engine/state';
import { BOSSES } from '../../src/engine/content/bosses';
import type { DayKey, Reminders, State } from '../../src/engine/types';
import type { Local } from './time';

/** What the job already did for this player (users/{uid}/ai/{channel}). */
export interface AiDocState {
  morning?: { day: DayKey } | null;
  weekly?: { week: DayKey } | null;
  lastMorningPush?: DayKey | null;
  lastEvening?: DayKey | null;
}

export interface Due {
  morningAi: boolean;
  morningPush: boolean;
  weeklyAi: boolean;
  eveningPush: boolean;
  /** Days since the player last opened the app. */
  idleDays: number;
}

const MORNING_WINDOW = 3;
const EVENING_WINDOW = 2;
/** No AI writing for players away this long (the plan would go unread). */
const AI_IDLE_DAYS = 3;
/** No reminders at all after this long away: Ember never nags absent players. */
const PUSH_IDLE_DAYS = 14;

export function inQuiet(h: number, r: Reminders): boolean {
  return r.quietStart <= r.quietEnd ? h >= r.quietStart && h < r.quietEnd : h >= r.quietStart || h < r.quietEnd;
}

const within = (h: number, start: number, window: number) => {
  const d = (h - start + 24) % 24;
  return d >= 0 && d < window;
};

export function lastOpened(s: State): DayKey {
  const opened = Object.values(s.days)
    .filter((d) => d.opened)
    .map((d) => d.day)
    .sort();
  return opened.at(-1) ?? s.profile.createdDay;
}

export function dueFor(s: State, local: Local, done: AiDocState, opts: { aiAvailable: boolean; pushAvailable: boolean; hasDevice: boolean }): Due {
  const r = s.profile.reminders;
  const idleDays = Math.max(0, daysBetween(lastOpened(s), local.day));
  const none: Due = { morningAi: false, morningPush: false, weeklyAi: false, eveningPush: false, idleDays };
  if (!s.profile.onboarded || !r) return none;
  const aiOn = opts.aiAvailable && !!s.profile.ai?.enabled && idleDays <= AI_IDLE_DAYS;
  const pushOn = opts.pushAvailable && r.push && opts.hasDevice && idleDays <= PUSH_IDLE_DAYS && !inQuiet(local.hour, r);
  const morningWindow = within(local.hour, r.morningHour, MORNING_WINDOW);
  const morningAi = aiOn && s.profile.morningPlan && morningWindow && done.morning?.day !== local.day;
  const morningPush = pushOn && s.profile.morningPlan && morningWindow && done.lastMorningPush !== local.day;
  // the weekly review: any time from Monday's morning hour, once per week
  const week = weekStart(local.day);
  const weeklyAi = aiOn && done.weekly?.week !== week && (local.day > week || local.hour >= r.morningHour);
  const vacation = !!s.vacationUntil && local.day <= s.vacationUntil;
  const eveningPush = pushOn && r.evening && !vacation && within(local.hour, r.eveningHour, EVENING_WINDOW) && done.lastEvening !== local.day && dailiesLeft(s, local.day) > 0;
  return { morningAi, morningPush, weeklyAi, eveningPush, idleDays };
}

/** Today's Dailies still open (not resting, not excused by a rough day). */
export function dailiesLeft(s: State, day: DayKey): number {
  if (s.today !== day) return scheduledDailies(s, day).filter((t) => !t.restDays?.includes(day)).length;
  const rough = s.days[day]?.rough;
  return scheduledDailies(s, day).filter((t) => !t.restDays?.includes(day) && (!rough || rough.keep.includes(t.id)) && !completionFor(s, t.id, day)).length;
}

/** The evening reminder: a count and, if it matters tonight, the boss. Never guilt. */
export function eveningText(s: State, day: DayKey): string {
  const left = dailiesLeft(s, day);
  let text = `${left} ${left === 1 ? 'Daily' : 'Dailies'} left today.`;
  const f = s.today === day ? currentFight(s) : null;
  if (f && !f.wonDay && f.todayRatio !== null && f.todayRatio < 0.7) text += ` Under 70% at the reset, the ${BOSSES[f.boss].name} strikes.`;
  else text += ' Still time for one.';
  return text;
}

export const yesterday = (day: DayKey) => addDays(day, -1);
