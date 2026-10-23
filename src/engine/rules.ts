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

/** Level at which each screen or system opens. */
export const UNLOCKS: { level: number; id: string; label: string }[] = [
  { level: 2, id: 'rewards', label: 'Rewards and the gold shop' },
  { level: 3, id: 'hero', label: 'Your stat shape and Harmony' },
  { level: 10, id: 'class', label: 'Class choice (arrives in Phase 2)' },
];
