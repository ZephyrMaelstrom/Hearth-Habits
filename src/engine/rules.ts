// The balancing rules adopted after Phase 0 (Gate 0 passed Oct 23, 2026).
// Every number here matches the Rules tab of Hearth_and_Habits_Balancing.xlsx.
// Change a number here and in the workbook together, then re-run the simulation.

import type { TierName } from './types';

export const RULES = {
  tiers: [
    { name: 'Trivial', min: 2, xp: 5, gold: 2 },
    { name: 'Easy', min: 5, xp: 10, gold: 4 },
    { name: 'Medium', min: 7, xp: 20, gold: 8 },
    { name: 'Hard', min: 10, xp: 35, gold: 14 },
    { name: 'Epic', min: 12, xp: 60, gold: 25 },
  ] as { name: TierName; min: number; xp: number; gold: number }[],
  /** Minutes thresholds for time points (from 0, 6, 16, 31, 61 minutes). */
  timePoints: [
    { from: 0, pts: 0 },
    { from: 6, pts: 1 },
    { from: 16, pts: 2 },
    { from: 31, pts: 3 },
    { from: 61, pts: 4 },
  ],
  xpPerLevel: 30,
  momentum: { start: 1.0, t0: 0.55, t1: 0.65, max: 1.1, min: 0.55, step: 0.25, negPenalty: 0.02 },
  weekCap: 1400,
  dayCeiling: 300,
  spark: 30,
  habitTapsPaid: 3,
  sameDayTodo: 0.5,
  classLevel: 10,
  classMinDay: 7,
  harmony: { ratio: 0.6, minTopLevel: 5, bonus: 0.1 },
  slots: { base: 6, perLevels: 5, max: 15 },
  rough: { perMonth: 4, keep: 3 },
  vacationMaxDays: 14,
  graduation: { rate: 0.95, windowDays: 28, minScheduled: 12, maxTraits: 5, bonus: 0.02 },
  shrink: { rate: 0.3, windowDays: 14, minScheduled: 5 },
  historyDays: 60,
  completionDays: 90,
} as const;

/**
 * Phase 2 numbers (the game layer). None of these touch the XP rules above:
 * gear, pets and bosses change combat and loot, never task XP. The only XP
 * effects are the two the design calls for: a teammate's Cheer (+5% for an
 * hour) and a Bard's Rally (+10% for a day).
 */
export const P2 = {
  /** Loot chance per paid task, by tier (Trivial to Epic). */
  dropChance: { Trivial: 0.02, Easy: 0.05, Medium: 0.1, Hard: 0.18, Epic: 0.3 } as Record<TierName, number>,
  /** What a drop turns out to be. */
  dropKinds: { item: 0.55, egg: 0.15, potion: 0.15, food: 0.15 },
  inventoryMax: 40,
  combat: {
    baseHp: 100,
    hpPerVigor: 4,
    baseMana: 30,
    manaPerSpirit: 3,
    manaRefill: 0.25,
    manaSpiritBonus: 0.25,
    critBase: 0.05,
    critPerMind: 0.005,
    critMax: 0.3,
    critMult: 2,
    mightPerLevel: 0.01,
    mightMax: 0.4,
    classMatch: 0.25,
    /** Gear never adds more than this to damage, or to max HP as a share of base HP. */
    gearDmgMax: 0.4,
    gearHpMax: 0.4,
    gearGoldMax: 0.1,
    fortuneGoldPerLevel: 0.005,
    fortuneGoldMax: 0.05,
    craftGearPerLevel: 0.01,
    craftGearMax: 0.3,
    bondPartyPerLevel: 0.01,
    bondPartyMax: 0.3,
    vigorResistPerLevel: 0.005,
    vigorResistMax: 0.25,
  },
  boss: {
    /** Boss HP per active member: base x (1 + perLevel x (level - 1)), level capped. */
    hpBase: 750,
    hpPerLevel: 0.035,
    hpLevelCap: 60,
    strikeBelow: 0.7,
    strikePct: 0.3,
    slothStats: 4,
    slothShield: 0.4,
    procrastOldDays: 7,
    procrastHealPer: 0.04,
    procrastHealCap: 0.12,
    gremlinSteal: 15,
    gremlinHoard: 30,
    eggChance: 0.5,
    restingAfterDays: 14,
    potionHeal: 0.5,
    downedDamage: 0.5,
  },
  pets: { foodXp: 40, xpPerLevel: 20, maxLevel: 30, attackBase: 12, attackPerLevel: 3, tasksToAttack: 3 },
  shop: { healing: 40, food: 15, egg: 150 },
  classChange: { gold: 500, cooldownDays: 7, treeReset: 100 },
  social: { cheerXp: 0.05, cheerMinutes: 60, cheersPerDay: 3, rescueMomentum: 0.1, rescuesPerDay: 1, lanternBelow: 0.8, partyMax: 6 },
  rally: { xp: 0.1, hours: 24 },
  vault: { chestsAt: [25, 50, 75, 100] },
  epics: { minMilestones: 3, maxMilestones: 10, rewardMinDays: 21 },
  bounties: { count: 3, rerolls: 1, earlyHour: 12 },
} as const;

/** Level at which each screen or system opens. */
export const UNLOCKS: { level: number; id: string; label: string }[] = [
  { level: 2, id: 'rewards', label: 'Rewards and the gold shop' },
  { level: 2, id: 'bounties', label: 'Daily bounties' },
  { level: 3, id: 'hero', label: 'Your stat shape and Harmony' },
  { level: 3, id: 'boss', label: 'The weekly boss and loot' },
  { level: 4, id: 'pets', label: 'Pets' },
  { level: 5, id: 'party', label: 'Parties' },
  { level: 6, id: 'vault', label: 'The Vault' },
  { level: 8, id: 'epics', label: 'Epics' },
  { level: 10, id: 'class', label: 'Class choice' },
];

export function unlocked(level: number, id: string): boolean {
  const u = UNLOCKS.find((x) => x.id === id);
  return !u || level >= u.level;
}
