import { RULES } from './rules';
import type { TierName } from './types';

export function timePoints(minutes: number): number {
  let pts = 0;
  for (const t of RULES.timePoints) if (minutes >= t.from) pts = t.pts;
  return pts;
}

export function score(effort: number, minutes: number, dread: number): number {
  return effort + dread + timePoints(minutes);
}

export function tierFor(effort: number, minutes: number, dread: number) {
  const s = score(effort, minutes, dread);
  let tier: (typeof RULES.tiers)[number] = RULES.tiers[0];
  for (const t of RULES.tiers) if (s >= t.min) tier = t;
  return { score: s, name: tier.name as TierName, xp: tier.xp, gold: tier.gold };
}

export function tierOfTask(t: { effort: number; minutes: number; dread: number }) {
  return tierFor(t.effort, t.minutes, t.dread);
}
