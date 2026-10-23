// Pets: 10 species x 3 hatching potions = 30 to collect. In the MVP every pet
// can take the battle-pet role: it attacks the weekly boss once on each day you
// finish 3 or more tasks. Pets never die or starve; an unfed pet just stops growing.

import { P2 } from '../rules';
import type { PotionColor, Species, Stat } from '../types';

export const SPECIES: { id: Species; name: string; emoji: string; stat: Stat }[] = [
  { id: 'bear', name: 'Bear', emoji: '🐻', stat: 'might' },
  { id: 'stag', name: 'Stag', emoji: '🦌', stat: 'might' },
  { id: 'hare', name: 'Hare', emoji: '🐇', stat: 'vigor' },
  { id: 'tortoise', name: 'Tortoise', emoji: '🐢', stat: 'vigor' },
  { id: 'fox', name: 'Fox', emoji: '🦊', stat: 'mind' },
  { id: 'owl', name: 'Owl', emoji: '🦉', stat: 'mind' },
  { id: 'beaver', name: 'Beaver', emoji: '🦫', stat: 'craft' },
  { id: 'butterfly', name: 'Butterfly', emoji: '🦋', stat: 'spirit' },
  { id: 'wolf', name: 'Wolf', emoji: '🐺', stat: 'bond' },
  { id: 'raccoon', name: 'Raccoon', emoji: '🦝', stat: 'fortune' },
];

export const POTIONS: { id: PotionColor; name: string; color: string }[] = [
  { id: 'ember', name: 'Ember', color: '#E0823A' },
  { id: 'moss', name: 'Moss', color: '#6E9E4A' },
  { id: 'frost', name: 'Frost', color: '#7FB3D9' },
];

export const speciesById = (id: Species) => SPECIES.find((s) => s.id === id)!;
export const potionById = (id: PotionColor) => POTIONS.find((p) => p.id === id)!;

/** Total pet XP needed to reach a level (20 x level to go from one level to the next). */
export function petXpForLevel(level: number): number {
  return (P2.pets.xpPerLevel / 2) * level * (level - 1);
}

export function petLevel(xp: number): number {
  let L = 1;
  while (L < P2.pets.maxLevel && petXpForLevel(L + 1) <= xp) L++;
  return L;
}

export function petAttack(level: number, bonusPct = 0): number {
  return Math.round((P2.pets.attackBase + P2.pets.attackPerLevel * level) * (1 + bonusPct));
}

export function petName(species: Species, potion: PotionColor): string {
  return `${potionById(potion).name} ${speciesById(species).name}`;
}
