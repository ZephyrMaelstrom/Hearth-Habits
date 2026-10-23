// 30 achievements in Bronze, Silver, Gold and Legendary tiers, adding up to an
// achievement score. A few grant titles. One is secret until found.

import { harmony, levelFromXp, statLevels } from './progress';
import { pointsSpent } from './content/classes';
import { petLevel } from './content/pets';
import { equippedItems } from './combat';
import { P2 } from './rules';
import { say } from './wisp';
import { STATS, type State } from './types';

export type AchTier = 'bronze' | 'silver' | 'gold' | 'legendary';

export interface AchDef {
  id: string;
  name: string;
  desc: string;
  tier: AchTier;
  group: string;
  secret?: boolean;
  title?: string;
  check: (s: State) => boolean;
}

const bestStreak = (s: State) => Math.max(0, ...s.tasks.map((t) => Math.max(t.bestStreak ?? 0, t.streak ?? 0)));
const level = (s: State) => levelFromXp(s.xp);
const coffersSaved = (s: State) => s.vault.coffers.reduce((a, c) => a + c.entries.reduce((b, e) => b + e.amount, 0), 0);

export const ACHIEVEMENTS: AchDef[] = [
  // Consistency
  { id: 'first-spark', name: 'First Spark', desc: 'Finish your first task', tier: 'bronze', group: 'Consistency', check: (s) => s.completions.some((c) => c.counted > 0) || s.xp > 0 },
  { id: 'streak-7', name: 'Kindling', desc: 'Keep a Daily going 7 days', tier: 'bronze', group: 'Consistency', check: (s) => bestStreak(s) >= 7 },
  { id: 'streak-30', name: 'Steady Flame', desc: 'Keep a Daily going 30 days', tier: 'silver', group: 'Consistency', check: (s) => bestStreak(s) >= 30 },
  { id: 'streak-100', name: 'The Unbroken', desc: 'Keep a Daily going 100 days', tier: 'gold', group: 'Consistency', title: 'the Unbroken', check: (s) => bestStreak(s) >= 100 },
  { id: 'streak-365', name: 'Eternal Hearth', desc: 'Keep a Daily going 365 days', tier: 'legendary', group: 'Consistency', title: 'Keeper of the Flame', check: (s) => bestStreak(s) >= 365 },
  { id: 'perfect-10', name: 'Clean Sweep', desc: 'Finish every scheduled Daily on 10 days', tier: 'bronze', group: 'Consistency', check: (s) => s.counters.perfectDays >= 10 },
  { id: 'perfect-50', name: 'Clockwork', desc: 'Finish every scheduled Daily on 50 days', tier: 'silver', group: 'Consistency', check: (s) => s.counters.perfectDays >= 50 },
  // Growth
  { id: 'level-10', name: 'Adventurer', desc: 'Reach level 10', tier: 'bronze', group: 'Growth', check: (s) => level(s) >= 10 },
  { id: 'level-25', name: 'Veteran', desc: 'Reach level 25', tier: 'silver', group: 'Growth', title: 'Veteran', check: (s) => level(s) >= 25 },
  { id: 'level-50', name: 'Hero of the Hearth', desc: 'Reach level 50', tier: 'gold', group: 'Growth', title: 'Hero of the Hearth', check: (s) => level(s) >= 50 },
  { id: 'harmony', name: 'In Harmony', desc: 'Earn Harmony with a balanced stat shape', tier: 'silver', group: 'Growth', check: (s) => harmony(s).active },
  { id: 'stats-5', name: 'Well-Rounded', desc: 'Raise all seven stats to level 5', tier: 'bronze', group: 'Growth', check: (s) => STATS.every((x) => statLevels(s)[x] >= 5) },
  { id: 'stats-20', name: 'Renaissance', desc: 'Raise all seven stats to level 20', tier: 'gold', group: 'Growth', check: (s) => STATS.every((x) => statLevels(s)[x] >= 20) },
  { id: 'graduate', name: 'Second Nature', desc: 'Graduate a Daily into a trait', tier: 'silver', group: 'Growth', check: (s) => s.traits.length > 0 },
  // Class
  { id: 'class', name: 'A Calling', desc: 'Choose a class', tier: 'bronze', group: 'Class', check: (s) => !!s.cls },
  { id: 'skills-10', name: 'Specialist', desc: 'Spend 10 skill points', tier: 'silver', group: 'Class', check: (s) => pointsSpent(s.skills) >= 10 },
  // Boss
  { id: 'boss-1', name: 'Giant Slayer', desc: 'Defeat a weekly boss', tier: 'bronze', group: 'Bosses', check: (s) => s.counters.bossWins >= 1 },
  { id: 'boss-all', name: 'Wyrmbane', desc: 'Defeat all three weekly bosses', tier: 'silver', group: 'Bosses', title: 'Wyrmbane', check: (s) => s.counters.bossKinds.length >= 3 },
  { id: 'flawless', name: 'Flawless', desc: 'Win a boss week without a single strike', tier: 'gold', group: 'Bosses', secret: true, title: 'the Flawless', check: (s) => s.counters.flawless >= 1 },
  // Gear and pets
  { id: 'rare', name: 'Shiny', desc: 'Equip a Rare item', tier: 'bronze', group: 'Collection', check: (s) => equippedItems(s).some((i) => i.rarity === 'rare') },
  { id: 'full-kit', name: 'Fully Kitted', desc: 'Fill all nine gear slots', tier: 'silver', group: 'Collection', check: (s) => equippedItems(s).length >= 9 },
  { id: 'hatch-1', name: 'New Friend', desc: 'Hatch a pet', tier: 'bronze', group: 'Collection', check: (s) => s.pets.length >= 1 },
  { id: 'hatch-10', name: 'Menagerie', desc: 'Hatch 10 pets', tier: 'silver', group: 'Collection', check: (s) => s.pets.length >= 10 },
  { id: 'pet-30', name: 'Best Friends', desc: 'Raise a pet to level 30', tier: 'gold', group: 'Collection', check: (s) => s.pets.some((p) => petLevel(p.xp) >= P2.pets.maxLevel) },
  // Social
  { id: 'party', name: 'Fellowship', desc: 'Join a party', tier: 'bronze', group: 'Social', check: (s) => !!s.party },
  { id: 'rescue', name: 'Lantern Bearer', desc: 'Rescue a teammate', tier: 'silver', group: 'Social', check: (s) => s.counters.rescuesGiven >= 1 },
  { id: 'cheers-100', name: 'Cheerleader', desc: 'Give 100 cheers', tier: 'gold', group: 'Social', check: (s) => s.counters.cheersGiven >= 100 },
  // Money and quests
  { id: 'saved-100', name: 'Nest Egg', desc: 'Put your first $100 into Coffers', tier: 'bronze', group: 'Money', check: (s) => coffersSaved(s) >= 100 },
  { id: 'dragon', name: 'Dragonslayer', desc: 'Slay a Debt Dragon', tier: 'gold', group: 'Money', check: (s) => s.counters.dragonsSlain >= 1 },
  { id: 'epic-1', name: 'The Long Road', desc: 'Finish an Epic', tier: 'gold', group: 'Quests', title: 'the Steadfast', check: (s) => s.counters.epicsDone >= 1 },
];

export const ACH_POINTS: Record<AchTier, number> = { bronze: 10, silver: 25, gold: 50, legendary: 100 };
export const ACH_LABEL: Record<AchTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', legendary: 'Legendary' };

export function achievementScore(s: State): number {
  return ACHIEVEMENTS.filter((a) => s.achievements[a.id]).reduce((n, a) => n + ACH_POINTS[a.tier], 0);
}

/** Award any newly earned achievements. Mutates s; returns their names. */
export function awardAchievements(s: State): string[] {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] || !a.check(s)) continue;
    s.achievements[a.id] = s.today;
    if (a.title && !s.titles.includes(a.title)) s.titles.push(a.title);
    got.push(a.name);
    say(s, 'achievement', { name: a.name, tier: ACH_LABEL[a.tier], title: a.title ?? '' }, [{ label: 'See trophies', action: { type: 'openTab', tab: 'hero' } }], {
      key: `ach:${a.id}`,
    });
  }
  return got;
}

/** State in, state out: returns the same object when nothing new was earned. */
export function checkAchievements(state: State): { state: State; earned: string[] } {
  if (!ACHIEVEMENTS.some((a) => !state.achievements[a.id] && a.check(state))) return { state, earned: [] };
  const s = structuredClone(state);
  const earned = awardAchievements(s);
  return { state: s, earned };
}
