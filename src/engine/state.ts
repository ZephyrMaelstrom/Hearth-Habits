import { dayKey, weekStart, monthKey, weekday } from './dates';
import { RULES } from './rules';
import { STATS, type DayKey, type State, type Stat, type Task } from './types';

export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyStats(): Record<Stat, number> {
  return Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>;
}

export function newState(now: Date = new Date()): State {
  const today = dayKey(now);
  return {
    version: 1,
    profile: {
      name: '',
      tone: 'cheerful',
      talk: 3,
      morningPlan: true,
      onboarded: false,
      createdDay: today,
      deviceId: uid(),
    },
    xp: 0,
    gold: 0,
    statXp: emptyStats(),
    momentum: RULES.momentum.start,
    week: { start: weekStart(today), selfCounted: 0 },
    today,
    days: {
      [today]: { day: today, opened: true, momentumStart: RULES.momentum.start, selfCounted: 0, xp: 0, gold: 0, sparkUsed: false },
    },
    tasks: [],
    completions: [],
    rewards: [],
    traits: [],
    owned: ['cloak-ember', 'hat-none', 'item-none'],
    equipped: { cloak: 'cloak-ember', hat: 'hat-none', item: 'item-none' },
    rough: { month: monthKey(today), used: 0 },
    vacationUntil: null,
    wisp: {
      messages: [],
      dismissals: {},
      muted: [],
      seenUnlocks: [],
      celebrated: [],
      lastWeekly: weekStart(today),
      lastMorning: today,
      pendingUnlocks: [],
    },
    lastLevel: 1,
    updatedAt: now.getTime(),
  };
}

/** Fill any fields an older save is missing, so saves survive app updates. */
export function migrate(raw: unknown, now: Date = new Date()): State {
  const base = newState(now);
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<State>;
  return {
    ...base,
    ...s,
    profile: { ...base.profile, ...(s.profile ?? {}) },
    statXp: { ...base.statXp, ...(s.statXp ?? {}) },
    week: s.week ?? base.week,
    days: s.days ?? base.days,
    wisp: { ...base.wisp, ...(s.wisp ?? {}) },
    rough: s.rough ?? base.rough,
    equipped: { ...base.equipped, ...(s.equipped ?? {}) },
  } as State;
}

/** Is this Daily due on `day` (before rest days and vacation are considered)? */
export function isScheduled(t: Task, day: DayKey): boolean {
  return (
    t.type === 'daily' &&
    !t.archived &&
    !t.graduated &&
    t.createdDay <= day &&
    (t.days ?? []).includes(weekday(day))
  );
}

export function scheduledDailies(s: State, day: DayKey): Task[] {
  return s.tasks.filter((t) => isScheduled(t, day)).sort((a, b) => a.order - b.order);
}

export function completionFor(s: State, taskId: string, day: DayKey) {
  return s.completions.find((c) => c.taskId === taskId && c.day === day && c.kind === 'complete');
}

export function habitTaps(s: State, taskId: string, day: DayKey, kind: 'habitPlus' | 'habitMinus') {
  return s.completions.filter((c) => c.taskId === taskId && c.day === day && c.kind === kind).length;
}

/** Streak including today if today's Daily is already done. */
export function liveStreak(s: State, t: Task): number {
  return (t.streak ?? 0) + (completionFor(s, t.id, s.today) ? 1 : 0);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
