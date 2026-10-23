import { dayKey, weekStart, monthKey, weekday } from './dates';
import { RULES } from './rules';
import { levelFromXp } from './progress';
import { STATS, type Counters, type DayKey, type State, type Stat, type Task } from './types';

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
    version: 2,
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
    ...phase2Defaults(today),
  };
}

/** Everything Phase 2 added to a save, empty. */
export function phase2Defaults(today: DayKey) {
  return {
    cls: null,
    skills: {},
    mana: 0,
    inventory: [],
    gear: {},
    pets: [],
    activePet: null,
    bag: { eggs: {}, potions: {}, food: 0, healing: 0 },
    trophies: [],
    titles: [],
    title: null,
    achievements: {},
    counters: emptyCounters(),
    bounties: { day: '', list: [], rerolled: false, bonusClaimed: false },
    vault: { coffers: [], debts: [], month: monthKey(today) },
    epics: [],
    epicChest: { day: null, owed: 0 },
    combat: { week: weekStart(today), startDay: null, casts: [], surgeArmed: false, results: [] },
    buffs: [],
    party: null,
    partyView: null,
    social: { cheers: [], rescues: [], pendingRescue: null, seen: [], received: { day: '', cheers: 0 } },
  } satisfies Partial<State>;
}

export function emptyCounters(): Counters {
  return { perfectDays: 0, bossWins: 0, bossKinds: [], flawless: 0, hatched: 0, cheersGiven: 0, rescuesGiven: 0, bountyFullDays: 0, epicsDone: 0, dragonsSlain: 0 };
}

/** Fill any fields an older save is missing, so saves survive app updates. */
export function migrate(raw: unknown, now: Date = new Date()): State {
  const base = newState(now);
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<State>;
  const out = {
    ...base,
    ...s,
    version: 2,
    profile: { ...base.profile, ...(s.profile ?? {}) },
    statXp: { ...base.statXp, ...(s.statXp ?? {}) },
    week: s.week ?? base.week,
    days: s.days ?? base.days,
    wisp: { ...base.wisp, ...(s.wisp ?? {}) },
    rough: s.rough ?? base.rough,
    equipped: { ...base.equipped, ...(s.equipped ?? {}) },
    bag: { ...base.bag, ...(s.bag ?? {}) },
    counters: { ...base.counters, ...(s.counters ?? {}) },
    bounties: s.bounties ?? base.bounties,
    vault: { ...base.vault, ...(s.vault ?? {}) },
    epicChest: s.epicChest ?? base.epicChest,
    combat: { ...base.combat, ...(s.combat ?? {}) },
    social: { ...base.social, ...(s.social ?? {}) },
  } as State;
  // A Phase 1 save that is already past level 3 starts its first boss week now.
  if (!out.combat.startDay && levelFromXp(out.xp) >= 3) out.combat.startDay = out.today;
  return out;
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
