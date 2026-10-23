import { RULES } from './rules';
import { STATS, type State, type Stat, type Task } from './types';

/** Total XP needed to reach `level` from level 1 (XP to next level = 30 x level). */
export function xpForLevel(level: number): number {
  const m = RULES.xpPerLevel / 2;
  return m * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  return L;
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: xp - start, need: next - start, toNext: next - xp };
}

export function statLevels(state: Pick<State, 'statXp'>): Record<Stat, number> {
  const out = {} as Record<Stat, number>;
  for (const s of STATS) out[s] = levelFromXp(state.statXp[s] ?? 0);
  return out;
}

/** Harmony: lowest stat at least 60% of the highest, once the highest reaches level 5. */
export function harmony(state: Pick<State, 'statXp'>) {
  const lv = statLevels(state);
  const vals = STATS.map((s) => lv[s]);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const ratio = hi > 0 ? lo / hi : 1;
  const active = hi >= RULES.harmony.minTopLevel && ratio >= RULES.harmony.ratio;
  const lowest = STATS.filter((s) => lv[s] === lo);
  const needed = Math.ceil(RULES.harmony.ratio * hi);
  return { active, ratio, hi, lo, lowest, needed, bonus: active ? RULES.harmony.bonus : 0 };
}

export function dailySlots(level: number): number {
  return Math.min(RULES.slots.max, RULES.slots.base + Math.floor(level / RULES.slots.perLevels));
}

export function activeDailies(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.type === 'daily' && !t.archived && !t.graduated);
}

export function traitBonus(state: Pick<State, 'traits'>, stats: Stat[]): number {
  let b = 0;
  for (const tr of state.traits) if (stats.includes(tr.stat)) b += tr.bonus;
  return b;
}

export const STAT_LABEL: Record<Stat, string> = {
  might: 'Might',
  vigor: 'Vigor',
  mind: 'Mind',
  craft: 'Craft',
  spirit: 'Spirit',
  bond: 'Bond',
  fortune: 'Fortune',
};

export const STAT_HINT: Record<Stat, string> = {
  might: 'Workouts, sports, physical work',
  vigor: 'Sleep, water, meals, check-ups',
  mind: 'Study, reading, deep work',
  craft: 'Creative projects, cooking, repairs, chores',
  spirit: 'Meditation, journaling, faith, gratitude',
  bond: 'Family, friends, helping others',
  fortune: 'Saving, budgeting, paying down debt',
};

export const TRAIT_NAMES: Record<Stat, string> = {
  might: 'Iron Will',
  vigor: 'Deep Roots',
  mind: 'Sharp Mind',
  craft: 'Steady Hands',
  spirit: 'Still Water',
  bond: 'Warm Hearth',
  fortune: 'Full Purse',
};
