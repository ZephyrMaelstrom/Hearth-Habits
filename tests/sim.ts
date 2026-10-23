// Simulation helpers for Phase 2 balance tests: play whole boss weeks with a
// light, typical or heavy player and see which day the boss falls.

import { vi } from 'vitest';
import * as A from '../src/engine/actions';

import { currentFight } from '../src/engine/boss';
import { generateItem, ITEM_SLOTS } from '../src/engine/content/gear';
import { petXpForLevel } from '../src/engine/content/pets';
import { xpForLevel } from '../src/engine/progress';
import { rollover } from '../src/engine/rollover';
import { newState } from '../src/engine/state';
import { rng } from '../src/engine/rng';
import { STATS, type ClassId, type GearSlot, type State, type Stat, type TaskType } from '../src/engine/types';

export const MON = (week = 0, hour = 8) => new Date(2026, 9, 26 + week * 7, hour); // Monday Oct 26 2026
export const at = (dayIndex: number, hour: number, week = 0) => new Date(2026, 9, 26 + week * 7 + dayIndex, hour);
const ALL = [0, 1, 2, 3, 4, 5, 6];

export type Plan = 'light' | 'typical' | 'heavy';

interface TaskSpec {
  type: TaskType;
  title: string;
  e: number;
  m: number;
  d: number;
  stats: Stat[];
}

// Tiers: Easy = 2/10/2 (score 5), Medium = 3/20/3 (8), Hard = 4/45/4 (11)
const EASY = { e: 2, m: 10, d: 2 };
const MED = { e: 3, m: 20, d: 3 };
const HARD = { e: 4, m: 45, d: 4 };

export const PLANS: Record<Plan, TaskSpec[]> = {
  light: [
    { type: 'daily', title: 'Walk', ...MED, stats: ['might'] },
    { type: 'daily', title: 'Read', ...EASY, stats: ['mind'] },
    { type: 'daily', title: 'Tidy', ...EASY, stats: ['craft'] },
    { type: 'daily', title: 'Water', ...EASY, stats: ['vigor'] },
    { type: 'daily', title: 'Stretch', ...EASY, stats: ['spirit'] },
    { type: 'habit', title: 'Text a friend', ...EASY, stats: ['bond'] },
  ],
  typical: [
    { type: 'daily', title: 'Workout', ...HARD, stats: ['might'] },
    { type: 'daily', title: 'Study', ...MED, stats: ['mind'] },
    { type: 'daily', title: 'Cook', ...MED, stats: ['craft'] },
    { type: 'daily', title: 'Water', ...EASY, stats: ['vigor'] },
    { type: 'daily', title: 'Journal', ...EASY, stats: ['spirit'] },
    { type: 'daily', title: 'Budget', ...EASY, stats: ['fortune'] },
    { type: 'habit', title: 'Call family', ...EASY, stats: ['bond'] },
  ],
  heavy: [
    { type: 'daily', title: 'Workout', ...HARD, stats: ['might'] },
    { type: 'daily', title: 'Deep work', ...HARD, stats: ['mind'] },
    { type: 'daily', title: 'Cook', ...MED, stats: ['craft'] },
    { type: 'daily', title: 'Sleep by 11', ...MED, stats: ['vigor'] },
    { type: 'daily', title: 'Meditate', ...EASY, stats: ['spirit'] },
    { type: 'daily', title: 'Budget', ...EASY, stats: ['fortune'] },
    { type: 'habit', title: 'Call family', ...EASY, stats: ['bond'] },
  ],
};

/** Habit taps per day and the share of Dailies done, by plan. */
const PACE: Record<Plan, { taps: number; skip: (day: number, i: number) => boolean }> = {
  light: { taps: 2, skip: (d, i) => (d + i) % 4 === 0 }, // ~75% of Dailies
  typical: { taps: 2, skip: (d, i) => (d * 3 + i) % 9 === 0 }, // ~89%
  heavy: { taps: 3, skip: () => false },
};

export interface SimOpts {
  plan: Plan;
  level: number;
  cls?: ClassId;
  gear?: 'none' | 'common' | 'rare';
  petLevel?: number;
  weeks?: number;
}

export function setupPlayer(o: SimOpts): State {
  vi.setSystemTime(MON());
  let s = A.finishOnboarding(newState(MON()), 'Sim', 'cheerful', []).state;
  for (const t of PLANS[o.plan]) {
    s = A.addTask(s, { type: t.type, title: t.title, effort: t.e, minutes: t.m, dread: t.d, stats: t.stats, days: t.type === 'daily' ? ALL : undefined }).state;
  }
  s = structuredClone(s);
  s.xp = xpForLevel(o.level);
  s.lastLevel = o.level;
  // spread the XP across stats like a balanced player (each stat ~ a seventh)
  for (const st of STATS) s.statXp[st] = s.xp / 7;
  s.profile.createdDay = '2026-10-01';
  s.combat.startDay = '2026-10-19';
  s.wisp.seenUnlocks = ['rewards', 'bounties', 'hero', 'boss', 'pets', 'party', 'vault', 'epics', 'class'];
  if (o.cls) s.cls = { id: o.cls, day: s.today, changes: 0, lastChange: s.today };
  if (o.cls) s.mana = 100;
  if (o.gear && o.gear !== 'none') {
    const r = rng('sim-gear');
    const slots: GearSlot[] = ['head', 'chest', 'legs', 'hands', 'feet', 'weapon', 'offhand', 'trinket1', 'trinket2'];
    slots.forEach((slot, i) => {
      const itemSlot = slot.startsWith('trinket') ? 'trinket' : (slot as (typeof ITEM_SLOTS)[number]);
      const it = generateItem(r, { slot: itemSlot, rarity: o.gear as 'common' | 'rare', ilvl: o.level, day: s.today, source: 'sim', id: `g${i}` });
      s.inventory.push(it);
      s.gear[slot] = it.id;
    });
  }
  if (o.petLevel) {
    s.pets.push({ id: 'p1', species: 'bear', potion: 'ember', xp: petXpForLevel(o.petLevel), day: s.today });
    s.activePet = 'p1';
  }
  return s;
}

/** Play one Monday-to-Sunday week. Returns the state and the day index the boss fell (0 = Monday). */
export function playWeek(s0: State, plan: Plan, week = 0, onDay?: (s: State, d: number) => State): { s: State; wonDay: number | null } {
  let s = s0;
  let wonDay: number | null = null;
  for (let d = 0; d < 7; d++) {
    vi.setSystemTime(at(d, 8, week));
    s = rollover(s, at(d, 8, week));
    if (onDay) s = onDay(s, d);
    const tasks = s.tasks.filter((t) => !t.archived);
    let hour = 10;
    tasks.forEach((t, i) => {
      if (t.type === 'daily') {
        if (PACE[plan].skip(d, i)) return;
        vi.setSystemTime(at(d, Math.min(19, hour++), week));
        s = A.completeTask(s, t.id).state;
      } else if (t.type === 'habit') {
        for (let k = 0; k < PACE[plan].taps; k++) {
          vi.setSystemTime(at(d, Math.min(19, hour++), week));
          s = A.tapHabit(s, t.id, 1).state;
        }
      }
    });
    const f = currentFight(s);
    if (f?.wonDay && wonDay === null) wonDay = d;
  }
  return { s, wonDay };
}

export function simulate(o: SimOpts) {
  let s = setupPlayer(o);
  const out = [];
  for (let w = 0; w < (o.weeks ?? 1); w++) {
    const r = playWeek(s, o.plan, w);
    s = r.s;
    out.push(r.wonDay);
  }
  return { s, wonDays: out };
}


