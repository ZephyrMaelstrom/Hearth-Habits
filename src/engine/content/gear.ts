// Gear: nine slots, Common to Rare, drops only. Gear changes how you fight and
// what you find, never the XP your tasks earn. Totals are capped in combat.ts
// (at most +40% damage, +40% of base HP and +10% gold from gear).

import { between, pick, weighted } from '../rng';
import { STAT_LABEL } from '../progress';
import { STATS, type Affix, type AffixKind, type DayKey, type GearSlot, type Item, type ItemSlot, type Rarity, type Stat } from '../types';

export const SLOT_LABEL: Record<GearSlot, string> = {
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  hands: 'Hands',
  feet: 'Feet',
  weapon: 'Weapon',
  offhand: 'Off-hand',
  trinket1: 'Trinket',
  trinket2: 'Trinket',
};

export const ITEM_SLOT_LABEL: Record<ItemSlot, string> = {
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  hands: 'Hands',
  feet: 'Feet',
  weapon: 'Weapon',
  offhand: 'Off-hand',
  trinket: 'Trinket',
};

export const ITEM_SLOTS: ItemSlot[] = ['head', 'chest', 'legs', 'hands', 'feet', 'weapon', 'offhand', 'trinket'];

/** Which equip slots an item can go in. */
export function slotsFor(slot: ItemSlot): GearSlot[] {
  return slot === 'trinket' ? ['trinket1', 'trinket2'] : [slot];
}

const BASES: Record<ItemSlot, string[]> = {
  head: ['Leather Cap', 'Iron Helm', 'Woven Hood', 'Bronze Circlet'],
  chest: ['Padded Vest', 'Chain Shirt', "Traveler's Coat", 'Scale Hauberk'],
  legs: ['Wool Trousers', 'Riveted Greaves', 'Ranger Leggings', 'Plated Tassets'],
  hands: ['Work Gloves', 'Iron Gauntlets', "Archer's Bracers", 'Silk Wraps'],
  feet: ['Trail Boots', 'Iron Sabatons', 'Soft Slippers', 'Riding Boots'],
  weapon: ['Oak Cudgel', 'Iron Sword', 'Ash Bow', 'Ember Wand', 'Hearth Hammer', 'Willow Staff'],
  offhand: ['Round Shield', 'Brass Lantern', 'Spell Tome', 'Hand Drum'],
  trinket: ['Copper Ring', 'Bone Charm', 'Silver Locket', 'Amber Pendant'],
};

export const RARITY: Record<Rarity, { label: string; mult: number; affixes: number; sell: number; color: string }> = {
  common: { label: 'Common', mult: 1, affixes: 0, sell: 3, color: '#B9B3A8' },
  uncommon: { label: 'Uncommon', mult: 1.25, affixes: 1, sell: 8, color: '#7CC48A' },
  rare: { label: 'Rare', mult: 1.5, affixes: 2, sell: 20, color: '#6FA8E8' },
};

/** Gear-drop rarity odds (the design's 55/28/12, Common to Rare only in the MVP). */
export const RARITY_ODDS: Record<'task' | 'bounty' | 'bonus', Record<Rarity, number>> = {
  task: { common: 55, uncommon: 28, rare: 12 },
  bounty: { common: 40, uncommon: 45, rare: 15 },
  bonus: { common: 0, uncommon: 70, rare: 30 },
};

/** Fortune nudges rarity upward: each level moves 0.4 points from Common, up to 15. */
export function rarityOdds(kind: keyof typeof RARITY_ODDS, fortuneLevel: number): Record<Rarity, number> {
  const base = { ...RARITY_ODDS[kind] };
  const shift = Math.min(15, 0.4 * fortuneLevel, base.common);
  base.common -= shift;
  base.uncommon += (shift * 2) / 3;
  base.rare += shift / 3;
  return base;
}

const AFFIX_WEIGHTS: Record<Exclude<AffixKind, 'dmg'>, number> = {
  statDmg: 30,
  hp: 15,
  crit: 12,
  mana: 10,
  gold: 10,
  dawn: 8,
  dusk: 8,
  petDmg: 7,
};

const PREFIX: Record<Exclude<AffixKind, 'dmg' | 'statDmg'>, string> = {
  dawn: 'Dawnlit',
  dusk: 'Duskforged',
  hp: 'Sturdy',
  crit: 'Keen',
  mana: 'Glowing',
  gold: 'Gilded',
  petDmg: 'Feral',
};
const STAT_PREFIX: Record<Stat, string> = {
  might: 'Mighty',
  vigor: 'Hale',
  mind: 'Clever',
  craft: 'Well-made',
  spirit: 'Serene',
  bond: 'Kindred',
  fortune: 'Lucky',
};
const SUFFIX: Record<Exclude<AffixKind, 'dmg' | 'statDmg'>, string> = {
  dawn: 'of Dawn',
  dusk: 'of Dusk',
  hp: 'of the Bear',
  crit: 'of Precision',
  mana: 'of the Well',
  gold: 'of Fortune',
  petDmg: 'of the Pack',
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function implicitFor(r: () => number, slot: ItemSlot, ilvl: number, mult: number): Affix {
  switch (slot) {
    case 'weapon':
      return { kind: 'dmg', value: r1((3 + ilvl * 0.15) * mult) };
    case 'chest':
      return { kind: 'hp', value: Math.round((8 + ilvl * 0.8) * mult) };
    case 'offhand':
      return { kind: 'hp', value: Math.round((6 + ilvl * 0.6) * mult) };
    case 'trinket': {
      const k = pick(r, ['crit', 'mana', 'gold'] as const);
      if (k === 'crit') return { kind: 'crit', value: r1((1 + ilvl * 0.05) * mult) };
      if (k === 'mana') return { kind: 'mana', value: Math.round((5 + ilvl * 0.3) * mult) };
      return { kind: 'gold', value: r1((1 + ilvl * 0.05) * mult) };
    }
    default:
      return { kind: 'hp', value: Math.round((4 + ilvl * 0.4) * mult) };
  }
}

function rollAffix(r: () => number, ilvl: number, taken: AffixKind[]): Affix {
  const weights = { ...AFFIX_WEIGHTS };
  for (const k of taken) if (k in weights && k !== 'statDmg') delete (weights as Record<string, number>)[k];
  const kind = weighted(r, weights);
  switch (kind) {
    case 'statDmg':
      return { kind, value: between(r, 4, 8) + Math.floor(ilvl / 25), stat: pick(r, STATS) };
    case 'hp':
      return { kind, value: between(r, 5, 12) + Math.floor(ilvl / 5) };
    case 'crit':
      return { kind, value: between(r, 1, 3) };
    case 'mana':
      return { kind, value: between(r, 5, 15) };
    case 'gold':
      return { kind, value: between(r, 1, 3) };
    case 'petDmg':
      return { kind, value: between(r, 10, 20) };
    default:
      return { kind, value: 10 }; // dawn, dusk
  }
}

function affixWord(a: Affix, part: 'prefix' | 'suffix'): string {
  if (a.kind === 'statDmg') return part === 'prefix' ? STAT_PREFIX[a.stat ?? 'might'] : `of ${STAT_LABEL[a.stat ?? 'might']}`;
  if (a.kind === 'dmg') return '';
  return part === 'prefix' ? PREFIX[a.kind] : SUFFIX[a.kind];
}

export function generateItem(
  r: () => number,
  o: { slot?: ItemSlot; rarity: Rarity; ilvl: number; day: DayKey; source: string; id: string },
): Item {
  const slot = o.slot ?? pick(r, ITEM_SLOTS);
  const base = pick(r, BASES[slot]);
  const mult = RARITY[o.rarity].mult;
  const implicit = implicitFor(r, slot, o.ilvl, mult);
  const affixes: Affix[] = [];
  for (let i = 0; i < RARITY[o.rarity].affixes; i++) affixes.push(rollAffix(r, o.ilvl, affixes.map((a) => a.kind)));
  let name = base;
  if (affixes[0]) name = `${affixWord(affixes[0], 'prefix')} ${base}`;
  if (affixes[1]) name = `${name} ${affixWord(affixes[1], 'suffix')}`;
  return { id: o.id, slot, name, rarity: o.rarity, ilvl: o.ilvl, implicit, affixes, day: o.day, source: o.source };
}

export function describeAffix(a: Affix): string {
  switch (a.kind) {
    case 'dmg':
      return `+${a.value}% damage`;
    case 'statDmg':
      return `+${a.value}% damage from ${STAT_LABEL[a.stat ?? 'might']} tasks`;
    case 'dawn':
      return `+${a.value}% damage from tasks done before 9 a.m.`;
    case 'dusk':
      return `+${a.value}% damage from tasks done after 8 p.m.`;
    case 'hp':
      return `+${a.value} max HP`;
    case 'crit':
      return `+${a.value}% critical-hit chance`;
    case 'mana':
      return `+${a.value}% max Mana`;
    case 'gold':
      return `+${a.value}% gold`;
    case 'petDmg':
      return `+${a.value}% pet damage`;
  }
}

export function itemLines(item: Item): string[] {
  return [describeAffix(item.implicit), ...item.affixes.map(describeAffix)];
}
