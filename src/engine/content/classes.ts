// The four MVP classes, their signature skills and one small skill tree each.
// Skill trees change combat only. The single XP effect is the Bard's Rally,
// which the design calls for (+10% XP for the party for a day).

import type { ClassId, SkillId, Stat } from '../types';

export interface ClassDef {
  id: ClassId;
  name: string;
  main: [Stat, Stat];
  role: string;
  blurb: string;
  skill: SkillId;
  color: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    main: ['might', 'vigor'],
    role: 'Tank',
    blurb: 'Takes the hits for the party. Workouts and health tasks hit 25% harder.',
    skill: 'shieldWall',
    color: '#C8643C',
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    main: ['mind', 'spirit'],
    role: 'Burst damage',
    blurb: 'Turns big tasks into big hits. Study and mindful tasks hit 25% harder.',
    skill: 'arcaneSurge',
    color: '#6F7FD6',
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    main: ['spirit', 'vigor'],
    role: 'Healer',
    blurb: 'Keeps the party on its feet. Mindful and health tasks hit 25% harder.',
    skill: 'mend',
    color: '#E0C25A',
  },
  bard: {
    id: 'bard',
    name: 'Bard',
    main: ['bond', 'mind'],
    role: 'Support',
    blurb: 'Lifts the whole party. Social and study tasks hit 25% harder.',
    skill: 'rally',
    color: '#5FB59A',
  },
};

export const CLASS_LIST: ClassId[] = ['warrior', 'mage', 'cleric', 'bard'];

export interface SkillDef {
  id: SkillId;
  name: string;
  cost: number;
  desc: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  shieldWall: { id: 'shieldWall', name: 'Shield Wall', cost: 30, desc: "Blocks the boss's next strike for the whole party." },
  arcaneSurge: { id: 'arcaneSurge', name: 'Arcane Surge', cost: 25, desc: 'Your next Hard or Epic task deals triple damage.' },
  mend: { id: 'mend', name: 'Mend', cost: 30, desc: 'Heals the party for 25% of max HP and gets Downed teammates back up.' },
  rally: { id: 'rally', name: 'Rally', cost: 35, desc: 'The party earns 10% more XP for 24 hours.' },
};

/** Everything a skill tree can change. Summed over the ranks you've spent. */
export interface Effects {
  dmgStat: Partial<Record<Stat, number>>;
  hpPct: number;
  manaPct: number;
  crit: number;
  critMult: number;
  costCut: Partial<Record<SkillId, number>>;
  ironRhythm: number;
  unbreakable: boolean;
  secondWind: boolean;
  warcry: number;
  surgeBonus: number;
  leyTap: number;
  spellbind: boolean;
  mendBonus: number;
  ward: boolean;
  wellspring: number;
  beacon: boolean;
  inspire: number;
  encoreHours: number;
  cheerHeal: boolean;
  crescendo: boolean;
}

export function noEffects(): Effects {
  return {
    dmgStat: {},
    hpPct: 0,
    manaPct: 0,
    crit: 0,
    critMult: 0,
    costCut: {},
    ironRhythm: 0,
    unbreakable: false,
    secondWind: false,
    warcry: 0,
    surgeBonus: 0,
    leyTap: 0,
    spellbind: false,
    mendBonus: 0,
    ward: false,
    wellspring: 0,
    beacon: false,
    inspire: 0,
    encoreHours: 0,
    cheerHeal: false,
    crescendo: false,
  };
}

export interface NodeDef {
  id: string;
  name: string;
  max: number;
  /** What one rank does, in plain words. */
  desc: string;
  req?: { id: string; rank: number };
  apply: (e: Effects, rank: number) => void;
}

const statDmg = (stat: Stat, per: number) => (e: Effects, r: number) => {
  e.dmgStat[stat] = (e.dmgStat[stat] ?? 0) + per * r;
};

export const TREES: Record<ClassId, NodeDef[]> = {
  warrior: [
    { id: 'w-heavy', name: 'Heavy Blows', max: 3, desc: '+5% damage from Might tasks', apply: statDmg('might', 0.05) },
    { id: 'w-hide', name: 'Tough Hide', max: 3, desc: '+8% max HP', apply: (e, r) => (e.hpPct += 0.08 * r) },
    { id: 'w-rhythm', name: 'Iron Rhythm', max: 2, desc: '+4% damage on days you finish every scheduled Daily', apply: (e, r) => (e.ironRhythm += 0.04 * r) },
    { id: 'w-stalwart', name: 'Stalwart', max: 2, desc: 'Shield Wall costs 5 less Mana', req: { id: 'w-hide', rank: 1 }, apply: (e, r) => (e.costCut.shieldWall = (e.costCut.shieldWall ?? 0) + 5 * r) },
    { id: 'w-unbreakable', name: 'Unbreakable', max: 1, desc: 'Boss strikes deal 25% less to you', req: { id: 'w-hide', rank: 3 }, apply: (e) => (e.unbreakable = true) },
    { id: 'w-secondwind', name: 'Second Wind', max: 1, desc: 'Once a week, get back up at 30% HP the day after you are Downed', req: { id: 'w-rhythm', rank: 1 }, apply: (e) => (e.secondWind = true) },
    { id: 'w-warcry', name: 'Warcry', max: 2, desc: 'Shield Wall also gives the party +5% damage for a day', req: { id: 'w-stalwart', rank: 1 }, apply: (e, r) => (e.warcry += 0.05 * r) },
  ],
  mage: [
    { id: 'm-focus', name: 'Focus', max: 3, desc: '+5% damage from Mind tasks', apply: statDmg('mind', 0.05) },
    { id: 'm-well', name: 'Deep Well', max: 3, desc: '+10% max Mana', apply: (e, r) => (e.manaPct += 0.1 * r) },
    { id: 'm-insight', name: 'Insight', max: 3, desc: '+2% critical-hit chance', apply: (e, r) => (e.crit += 0.02 * r) },
    { id: 'm-overcharge', name: 'Overcharge', max: 2, desc: 'Arcane Surge deals +0.5x more', req: { id: 'm-focus', rank: 1 }, apply: (e, r) => (e.surgeBonus += 0.5 * r) },
    { id: 'm-echo', name: 'Echo', max: 1, desc: 'Critical hits deal 2.5x instead of 2x', req: { id: 'm-insight', rank: 3 }, apply: (e) => (e.critMult += 0.5) },
    { id: 'm-leytap', name: 'Ley Tap', max: 2, desc: '+5 Mana when you finish a Hard or Epic task', req: { id: 'm-well', rank: 1 }, apply: (e, r) => (e.leyTap += 5 * r) },
    { id: 'm-spellbind', name: 'Spellbind', max: 1, desc: 'Arcane Surge also fires on Medium tasks', req: { id: 'm-overcharge', rank: 1 }, apply: (e) => (e.spellbind = true) },
  ],
  cleric: [
    { id: 'c-smite', name: 'Smite', max: 3, desc: '+5% damage from Spirit tasks', apply: statDmg('spirit', 0.05) },
    { id: 'c-sanctuary', name: 'Sanctuary', max: 3, desc: '+8% max HP', apply: (e, r) => (e.hpPct += 0.08 * r) },
    { id: 'c-light', name: 'Gentle Light', max: 3, desc: 'Mend heals 10% more of max HP', apply: (e, r) => (e.mendBonus += 0.1 * r) },
    { id: 'c-grace', name: 'Grace', max: 2, desc: 'Mend costs 5 less Mana', req: { id: 'c-light', rank: 1 }, apply: (e, r) => (e.costCut.mend = (e.costCut.mend ?? 0) + 5 * r) },
    { id: 'c-ward', name: 'Ward', max: 1, desc: "After Mend, the party's next strike deals half damage", req: { id: 'c-sanctuary', rank: 2 }, apply: (e) => (e.ward = true) },
    { id: 'c-wellspring', name: 'Wellspring', max: 2, desc: '+10% Mana refill on days you finish a Vigor task', req: { id: 'c-grace', rank: 1 }, apply: (e, r) => (e.wellspring += 0.1 * r) },
    { id: 'c-beacon', name: 'Beacon', max: 1, desc: 'Downed teammates still deal full damage', req: { id: 'c-ward', rank: 1 }, apply: (e) => (e.beacon = true) },
  ],
  bard: [
    { id: 'b-song', name: 'Harmony Song', max: 3, desc: '+5% damage from Bond tasks', apply: statDmg('bond', 0.05) },
    { id: 'b-inspire', name: 'Inspire', max: 3, desc: 'Your party deals +2% damage', apply: (e, r) => (e.inspire += 0.02 * r) },
    { id: 'b-encore', name: 'Encore', max: 2, desc: 'Rally lasts 12 hours longer', apply: (e, r) => (e.encoreHours += 12 * r) },
    { id: 'b-tempo', name: 'Tempo', max: 2, desc: 'Rally costs 5 less Mana', req: { id: 'b-encore', rank: 1 }, apply: (e, r) => (e.costCut.rally = (e.costCut.rally ?? 0) + 5 * r) },
    { id: 'b-ballad', name: 'Ballad', max: 3, desc: '+10% max Mana', apply: (e, r) => (e.manaPct += 0.1 * r) },
    { id: 'b-cheer', name: 'Cheerleader', max: 1, desc: 'Cheers you give also heal the teammate 10% of max HP', req: { id: 'b-inspire', rank: 1 }, apply: (e) => (e.cheerHeal = true) },
    { id: 'b-crescendo', name: 'Crescendo', max: 1, desc: 'While Rally lasts, the party also deals +10% damage', req: { id: 'b-encore', rank: 2 }, apply: (e) => (e.crescendo = true) },
  ],
};

/** Skill points: 1 per level from 10 on, plus a bonus every 10 levels from 20. */
export function skillPoints(level: number): number {
  if (level < 10) return 0;
  return level - 9 + Math.floor(level / 10) - 1;
}

export function pointsSpent(skills: Record<string, number>): number {
  return Object.values(skills).reduce((a, b) => a + b, 0);
}

export function effectsFor(cls: ClassId | null | undefined, skills: Record<string, number>): Effects {
  const e = noEffects();
  if (!cls) return e;
  for (const n of TREES[cls]) {
    const r = Math.min(n.max, skills[n.id] ?? 0);
    if (r > 0) n.apply(e, r);
  }
  return e;
}

export function skillCost(skill: SkillId, e: Effects): number {
  return Math.max(10, SKILLS[skill].cost - (e.costCut[skill] ?? 0));
}
