// Player actions for the Phase 2 game layer: class and skills, gear, pets,
// consumables and titles. Like actions.ts, each takes a State and returns a new one.

import { daysBetween, addDays } from './dates';
import { CLASSES, pointsSpent, skillCost, skillPoints, TREES } from './content/classes';
import { RARITY, slotsFor } from './content/gear';
import { petName, petXpForLevel, SPECIES } from './content/pets';
import { profile } from './combat';
import { levelFromXp } from './progress';
import { P2, RULES } from './rules';
import { pick, rng } from './rng';
import { uid } from './state';
import type { ClassId, GearSlot, PotionColor, SkillId, Species, State } from './types';
import type { Result } from './actions';

function draft(state: State): State {
  const s = structuredClone(state);
  s.updatedAt = Date.now();
  return s;
}

// ------------------------------------------------------------------ class

/** Classes open at level 10, and no earlier than day 7 (after one full boss week). */
export function classReady(s: State): { ready: boolean; level: number; day: number; availableOn: string | null } {
  const level = levelFromXp(s.xp);
  const day = daysBetween(s.profile.createdDay, s.today) + 1;
  const ready = level >= RULES.classLevel && day >= RULES.classMinDay;
  const availableOn = level >= RULES.classLevel && !ready ? addDays(s.profile.createdDay, RULES.classMinDay - 1) : null;
  return { ready, level, day, availableOn };
}

/** What changing class costs right now. The first change is free. */
export function classChangeCost(s: State): { gold: number; waitDays: number } {
  if (!s.cls || s.cls.changes === 0) return { gold: 0, waitDays: 0 };
  const since = daysBetween(s.cls.lastChange, s.today);
  return { gold: P2.classChange.gold, waitDays: Math.max(0, P2.classChange.cooldownDays - since) };
}

export function chooseClass(state: State, id: ClassId): Result {
  if (!classReady(state).ready) return { state, error: `Classes open at level ${RULES.classLevel}, from day ${RULES.classMinDay}.` };
  if (state.cls?.id === id) return { state };
  const cost = classChangeCost(state);
  if (state.cls) {
    if (cost.waitDays > 0) return { state, error: `You can change class again in ${cost.waitDays} day${cost.waitDays > 1 ? 's' : ''}.` };
    if (state.gold < cost.gold) return { state, error: `Changing class costs ${cost.gold} gold.` };
  }
  const s = draft(state);
  if (s.cls) {
    s.gold -= cost.gold;
    s.cls = { id, day: s.cls.day, changes: s.cls.changes + 1, lastChange: s.today };
    s.skills = {};
    s.mana = Math.min(s.mana, profile(s).maxMana);
  } else {
    s.cls = { id, day: s.today, changes: 0, lastChange: s.today };
    s.mana = profile(s).maxMana;
  }
  return { state: s, events: [`You are now a ${CLASSES[id].name}.`] };
}

export function pointsLeft(s: State): number {
  return skillPoints(levelFromXp(s.xp)) - pointsSpent(s.skills);
}

export function spendPoint(state: State, nodeId: string): Result {
  if (!state.cls) return { state, error: 'Pick a class first.' };
  const node = TREES[state.cls.id].find((n) => n.id === nodeId);
  if (!node) return { state };
  const rank = state.skills[nodeId] ?? 0;
  if (rank >= node.max) return { state, error: `${node.name} is maxed.` };
  if (pointsLeft(state) <= 0) return { state, error: 'No skill points left. You earn one each level.' };
  if (node.req && (state.skills[node.req.id] ?? 0) < node.req.rank) {
    const req = TREES[state.cls.id].find((n) => n.id === node.req!.id);
    return { state, error: `Needs ${req?.name} rank ${node.req.rank} first.` };
  }
  const s = draft(state);
  s.skills[nodeId] = rank + 1;
  return { state: s };
}

export function resetTree(state: State): Result {
  if (!pointsSpent(state.skills)) return { state };
  if (state.gold < P2.classChange.treeReset) return { state, error: `Resetting costs ${P2.classChange.treeReset} gold.` };
  const s = draft(state);
  s.gold -= P2.classChange.treeReset;
  s.skills = {};
  s.mana = Math.min(s.mana, profile(s).maxMana);
  return { state: s };
}

export function castSkill(state: State, skill: SkillId, now = Date.now()): Result {
  if (!state.cls || CLASSES[state.cls.id].skill !== skill) return { state, error: 'That skill belongs to another class.' };
  const p = profile(state);
  const cost = skillCost(skill, p.effects);
  if (state.mana < cost) return { state, error: `Needs ${cost} Mana (you have ${Math.floor(state.mana)}).` };
  if (skill === 'arcaneSurge' && state.combat.surgeArmed) return { state, error: 'Arcane Surge is already waiting for your next big task.' };
  const s = draft(state);
  s.mana -= cost;
  s.combat.casts.push({ id: uid(), skill, at: now, day: s.today });
  let event = '';
  if (skill === 'arcaneSurge') {
    s.combat.surgeArmed = true;
    event = 'Arcane Surge ready: your next Hard or Epic task deals triple damage.';
  } else if (skill === 'rally') {
    const hours = P2.rally.hours + p.effects.encoreHours;
    s.buffs.push({ id: uid(), kind: 'rally', from: 'self', start: now, until: now + hours * 3600_000, pct: P2.rally.xp, dmgPct: p.effects.crescendo ? 0.1 : 0 });
    event = `Rally! +10% XP for ${hours} hours${s.party ? ' for your whole party' : ''}.`;
  } else if (skill === 'shieldWall') event = "Shield Wall up: the boss's next strike is blocked.";
  else if (skill === 'mend') event = 'Mend: the party is healed and back on its feet.';
  return { state: s, events: [event] };
}

export function usePotion(state: State, now = Date.now()): Result {
  if (state.bag.healing <= 0) return { state, error: 'No healing potions. The shop sells them.' };
  const s = draft(state);
  s.bag.healing -= 1;
  s.combat.casts.push({ id: uid(), skill: 'potion', at: now, day: s.today });
  return { state: s, events: ['Healing potion: +50% HP, and back up if you were Downed.'] };
}

// ------------------------------------------------------------------ gear

export function equipItem(state: State, itemId: string, slot?: GearSlot): Result {
  const it = state.inventory.find((i) => i.id === itemId);
  if (!it) return { state };
  const options = slotsFor(it.slot);
  const target = slot && options.includes(slot) ? slot : (options.find((o) => !state.gear[o]) ?? options[0]);
  const s = draft(state);
  for (const k of Object.keys(s.gear) as GearSlot[]) if (s.gear[k] === itemId) delete s.gear[k];
  s.gear[target] = itemId;
  return { state: s };
}

export function unequipSlot(state: State, slot: GearSlot): Result {
  if (!state.gear[slot]) return { state };
  const s = draft(state);
  delete s.gear[slot];
  return { state: s };
}

export function sellItem(state: State, itemId: string): Result {
  const it = state.inventory.find((i) => i.id === itemId);
  if (!it) return { state };
  const s = draft(state);
  for (const k of Object.keys(s.gear) as GearSlot[]) if (s.gear[k] === itemId) delete s.gear[k];
  s.inventory = s.inventory.filter((i) => i.id !== itemId);
  s.gold += RARITY[it.rarity].sell;
  return { state: s, events: [`Sold for ${RARITY[it.rarity].sell} gold.`] };
}

/** Sell every unequipped Common item at once. */
export function sellCommons(state: State): Result {
  const equipped = new Set(Object.values(state.gear));
  const sell = state.inventory.filter((i) => i.rarity === 'common' && !equipped.has(i.id));
  if (!sell.length) return { state, error: 'No unequipped Common gear to sell.' };
  const s = draft(state);
  const ids = new Set(sell.map((i) => i.id));
  s.inventory = s.inventory.filter((i) => !ids.has(i.id));
  const gold = sell.length * RARITY.common.sell;
  s.gold += gold;
  return { state: s, events: [`Sold ${sell.length} Common item${sell.length > 1 ? 's' : ''} for ${gold} gold.`] };
}

// ------------------------------------------------------------------ pets

export function hatchPet(state: State, species: Species, potion: PotionColor): Result {
  if (!(state.bag.eggs[species] ?? 0)) return { state, error: 'You need that egg first.' };
  if (!(state.bag.potions[potion] ?? 0)) return { state, error: 'You need that hatching potion first.' };
  if (state.pets.some((p) => p.species === species && p.potion === potion)) return { state, error: `You already have a ${petName(species, potion)}.` };
  const s = draft(state);
  s.bag.eggs[species] = (s.bag.eggs[species] ?? 0) - 1;
  s.bag.potions[potion] = (s.bag.potions[potion] ?? 0) - 1;
  const pet = { id: uid(), species, potion, xp: 0, day: s.today };
  s.pets.push(pet);
  if (!s.activePet) s.activePet = pet.id;
  s.counters.hatched += 1;
  return { state: s, events: [`Hatched a ${petName(species, potion)}!`] };
}

export function feedPet(state: State, petId: string): Result {
  const pet = state.pets.find((p) => p.id === petId);
  if (!pet) return { state };
  if (state.bag.food <= 0) return { state, error: 'No pet treats. They drop from tasks, or the shop has them.' };
  const cap = petXpForLevel(P2.pets.maxLevel);
  if (pet.xp >= cap) return { state, error: 'This pet is fully grown.' };
  const s = draft(state);
  s.bag.food -= 1;
  const p = s.pets.find((x) => x.id === petId)!;
  p.xp = Math.min(cap, p.xp + P2.pets.foodXp);
  return { state: s };
}

export function setActivePet(state: State, petId: string | null): Result {
  if (petId && !state.pets.some((p) => p.id === petId)) return { state };
  const s = draft(state);
  s.activePet = petId;
  return { state: s };
}

// ------------------------------------------------------------------ consumables and titles

export type Consumable = 'healing' | 'food' | 'egg';

export function buyConsumable(state: State, kind: Consumable): Result {
  const price = P2.shop[kind];
  if (state.gold < price) return { state, error: `You need ${price - state.gold} more gold.` };
  const s = draft(state);
  s.gold -= price;
  if (kind === 'healing') s.bag.healing += 1;
  else if (kind === 'food') s.bag.food += 1;
  else {
    const sp = pick(rng(`${s.profile.deviceId}|egg|${Date.now()}`), SPECIES);
    s.bag.eggs[sp.id] = (s.bag.eggs[sp.id] ?? 0) + 1;
    return { state: s, events: [`A ${sp.name} egg!`] };
  }
  return { state: s };
}

export function setTitle(state: State, title: string | null): Result {
  if (title && !state.titles.includes(title)) return { state };
  const s = draft(state);
  s.title = title;
  return { state: s };
}

export const rarityLabel = (r: keyof typeof RARITY) => RARITY[r].label;
