// The three MVP weekly bosses. Each one's weakness is a real behavior, so
// beating it means living a little better that week. Everyone fights the same
// boss in the same week (Monday to Sunday), so a party always agrees.

import { daysBetween } from '../dates';
import { P2 } from '../rules';
import type { BossId, DayKey } from '../types';
import { tuning } from '../tuning';

export interface BossDef {
  id: BossId;
  name: string;
  mechanic: string;
  rewards: string;
  tip: string;
  color: string;
}

export const BOSSES: Record<BossId, BossDef> = {
  slothWyrm: {
    id: 'slothWyrm',
    name: 'Sloth Wyrm',
    mechanic: `Shielded each day until the party finishes tasks in ${P2.boss.slothStats} different stats. Hits land at ${Math.round(P2.boss.slothShield * 100)}% until then, and at full strength once the shield breaks.`,
    rewards: 'A balanced day',
    tip: 'Spread the day across a few parts of life.',
    color: '#7A9A5A',
  },
  procrastinaut: {
    id: 'procrastinaut',
    name: 'The Procrastinaut',
    mechanic: `Heals each night for every to-do ${P2.boss.procrastOldDays}+ days overdue. Old to-dos you finish hit it twice as hard.`,
    rewards: 'Clearing the backlog',
    tip: 'Finish the to-do you keep pushing.',
    color: '#7C7FB8',
  },
  goldGremlin: {
    id: 'goldGremlin',
    name: 'Gold Gremlin',
    mechanic: `Pockets ${P2.boss.gremlinSteal} of everyone's gold each night unless someone logs a Vault entry or finishes a Fortune task that day. Beat it and you get it all back, plus its hoard.`,
    rewards: 'Saving',
    tip: 'Log a deposit, or do one money task.',
    color: '#C9A63E',
  },
};

export const BOSS_ROTATION: BossId[] = ['slothWyrm', 'procrastinaut', 'goldGremlin'];

/** A Monday the rotation counts from. */
const EPOCH: DayKey = '2026-01-05';

export function bossForWeek(week: DayKey): BossId {
  const n = Math.floor(daysBetween(EPOCH, week) / 7);
  return BOSS_ROTATION[((n % 3) + 3) % 3];
}

/** Boss HP contributed by one active member, scaled by level. */
export function memberBossHp(level: number): number {
  const b = P2.boss;
  return Math.round(b.hpBase * (1 + b.hpPerLevel * (Math.min(level, b.hpLevelCap) - 1)) * tuning().bossHp);
}
