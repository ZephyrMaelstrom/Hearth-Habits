// Your combat profile: how stats, class, skill tree and gear turn into HP,
// Mana, crits and damage. Damage is based on the XP a task actually paid
// (after the Phase 0 caps), so faking tasks can't win a boss fight either.

import { CLASSES, effectsFor, type Effects } from './content/classes';
import { statLevels } from './progress';
import { P2 } from './rules';
import { rng } from './rng';
import { GEAR_SLOTS, type ClassId, type Item, type State, type Stat, type TierName } from './types';

export interface Profile {
  cls: ClassId | null;
  main: Stat[];
  effects: Effects;
  levels: Record<Stat, number>;
  baseHp: number;
  maxHp: number;
  maxMana: number;
  crit: number;
  critMult: number;
  /** All-damage bonus from Might. */
  might: number;
  /** Flat damage bonus from gear (weapon), before the per-hit gear cap. */
  gearDmg: number;
  gearStatDmg: Partial<Record<Stat, number>>;
  dawn: number;
  dusk: number;
  /** Total gold bonus (gear + Fortune), as a fraction. */
  gold: number;
  petDmg: number;
  /** Strike damage reduction from Vigor. */
  resist: number;
  /** Strength bonus for party skills from Bond. */
  bondBoost: number;
  /** Craft's gear-quality multiplier. */
  quality: number;
}

export function equippedItems(s: Pick<State, 'gear' | 'inventory'>): Item[] {
  const out: Item[] = [];
  for (const slot of GEAR_SLOTS) {
    const id = s.gear[slot];
    const it = id ? s.inventory.find((i) => i.id === id) : undefined;
    if (it) out.push(it);
  }
  return out;
}

export function profile(s: State): Profile {
  const C = P2.combat;
  const lv = statLevels(s);
  const e = effectsFor(s.cls?.id, s.skills);
  const quality = 1 + Math.min(C.craftGearMax, C.craftGearPerLevel * lv.craft);
  let dmg = 0;
  let hp = 0;
  let crit = 0;
  let mana = 0;
  let gold = 0;
  let pet = 0;
  let dawn = 0;
  let dusk = 0;
  const statDmg: Partial<Record<Stat, number>> = {};
  for (const it of equippedItems(s)) {
    for (const a of [it.implicit, ...it.affixes]) {
      const v = a.value * quality;
      if (a.kind === 'dmg') dmg += v / 100;
      else if (a.kind === 'statDmg' && a.stat) statDmg[a.stat] = (statDmg[a.stat] ?? 0) + v / 100;
      else if (a.kind === 'dawn') dawn += v / 100;
      else if (a.kind === 'dusk') dusk += v / 100;
      else if (a.kind === 'hp') hp += v;
      else if (a.kind === 'crit') crit += v / 100;
      else if (a.kind === 'mana') mana += v / 100;
      else if (a.kind === 'gold') gold += v / 100;
      else if (a.kind === 'petDmg') pet += v / 100;
    }
  }
  const baseHp = C.baseHp + C.hpPerVigor * lv.vigor;
  const gearHp = Math.min(baseHp * C.gearHpMax, hp);
  return {
    cls: s.cls?.id ?? null,
    main: s.cls ? [...CLASSES[s.cls.id].main] : [],
    effects: e,
    levels: lv,
    baseHp,
    maxHp: Math.round((baseHp + gearHp) * (1 + e.hpPct)),
    maxMana: Math.round((C.baseMana + C.manaPerSpirit * lv.spirit) * (1 + e.manaPct + mana)),
    crit: Math.min(C.critMax, C.critBase + C.critPerMind * lv.mind + crit + e.crit),
    critMult: C.critMult + e.critMult,
    might: Math.min(C.mightMax, C.mightPerLevel * lv.might),
    gearDmg: dmg,
    gearStatDmg: statDmg,
    dawn,
    dusk,
    gold: Math.min(C.gearGoldMax, gold) + Math.min(C.fortuneGoldMax, C.fortuneGoldPerLevel * lv.fortune),
    petDmg: pet,
    resist: Math.min(C.vigorResistMax, C.vigorResistPerLevel * lv.vigor),
    bondBoost: Math.min(C.bondPartyMax, C.bondPartyPerLevel * lv.bond),
    quality,
  };
}

/** The gear part of a hit's bonus, capped at +40%. */
export function gearBonus(p: Profile, stats: Stat[], hour: number): number {
  const statPart = Math.max(0, ...stats.map((st) => p.gearStatDmg[st] ?? 0));
  const timed = (hour < 9 ? p.dawn : 0) + (hour >= 20 ? p.dusk : 0);
  return Math.min(P2.combat.gearDmgMax, p.gearDmg + statPart + timed);
}

export interface HitInput {
  stats: Stat[];
  /** Base XP that counted for this task (no Spark, after caps). */
  hitBase: number;
  ts: number;
  seed: string;
  surge: boolean;
}

/** Damage one finished task deals to the boss, with your personal bonuses. */
export function hitFor(p: Profile, h: HitInput): { dmg: number; crit: boolean } {
  if (h.hitBase <= 0) return { dmg: 0, crit: false };
  const hour = new Date(h.ts).getHours();
  const match = h.stats.some((st) => p.main.includes(st)) ? P2.combat.classMatch : 0;
  const skill = Math.max(0, ...h.stats.map((st) => p.effects.dmgStat[st] ?? 0));
  let dmg = h.hitBase * (1 + p.might) * (1 + match) * (1 + gearBonus(p, h.stats, hour)) * (1 + skill);
  const crit = rng(`${h.seed}|crit`)() < p.crit;
  if (crit) dmg *= p.critMult;
  if (h.surge) dmg *= 3 + p.effects.surgeBonus;
  return { dmg: Math.round(dmg), crit };
}

export function surgeFits(tier: TierName, e: Effects): boolean {
  return tier === 'Hard' || tier === 'Epic' || (e.spellbind && tier === 'Medium');
}

/** XP bonus from active buffs at time `now`: the best Rally plus a Cheer. */
export function xpBuff(s: Pick<State, 'buffs'>, now: number): number {
  let rally = 0;
  let cheer = 0;
  for (const b of s.buffs) {
    if (b.start > now || b.until <= now) continue;
    if (b.kind === 'rally') rally = Math.max(rally, b.pct);
    if (b.kind === 'cheer') cheer = Math.max(cheer, b.pct);
  }
  return rally + cheer;
}
