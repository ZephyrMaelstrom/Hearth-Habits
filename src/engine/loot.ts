// Loot: what drops from tasks and what's inside chests. Rolls are seeded (see
// rng.ts) so undoing and redoing a task can't re-roll its loot.

import { generateItem, ITEM_SLOT_LABEL, RARITY, rarityOdds } from './content/gear';
import { POTIONS, potionById, SPECIES, speciesById } from './content/pets';
import { statLevels, levelFromXp } from './progress';
import { P2 } from './rules';
import { pick, rng, weighted } from './rng';
import { uid } from './state';
import type { DayKey, Drop, Item, ItemSlot, Rarity, State, TierName } from './types';

function makeItem(s: State, r: () => number, rarity: Rarity, source: string, slot?: ItemSlot): Item {
  return generateItem(r, { rarity, ilvl: levelFromXp(s.xp), day: s.today, source, id: uid(), slot });
}

/** Put a drop in the bag. Gear past the inventory limit is sold on the spot. */
export function grantDrop(s: State, d: Drop, item?: Item): Drop {
  switch (d.kind) {
    case 'item':
      if (!item) return d;
      if (s.inventory.length >= P2.inventoryMax) {
        s.gold += RARITY[item.rarity].sell;
        return { kind: 'item', itemId: '' };
      }
      s.inventory.push(item);
      return d;
    case 'egg':
      s.bag.eggs[d.species] = (s.bag.eggs[d.species] ?? 0) + 1;
      return d;
    case 'potion':
      s.bag.potions[d.potion] = (s.bag.potions[d.potion] ?? 0) + 1;
      return d;
    case 'food':
      s.bag.food += d.n;
      return d;
  }
}

/** Take a drop back out (when its task is undone). */
export function removeDrop(s: State, d: Drop) {
  switch (d.kind) {
    case 'item':
      if (!d.itemId) return;
      for (const k of Object.keys(s.gear) as (keyof State['gear'])[]) if (s.gear[k] === d.itemId) delete s.gear[k];
      s.inventory = s.inventory.filter((i) => i.id !== d.itemId);
      return;
    case 'egg':
      s.bag.eggs[d.species] = Math.max(0, (s.bag.eggs[d.species] ?? 0) - 1);
      return;
    case 'potion':
      s.bag.potions[d.potion] = Math.max(0, (s.bag.potions[d.potion] ?? 0) - 1);
      return;
    case 'food':
      s.bag.food = Math.max(0, s.bag.food - d.n);
      return;
  }
}

function rollKind(s: State, r: () => number, rarityKind: 'task' | 'bounty' | 'bonus', kinds: Record<Drop['kind'], number>, source: string): { drop: Drop; item?: Item } {
  const kind = weighted(r, kinds);
  if (kind === 'item') {
    const rarity = weighted(r, rarityOdds(rarityKind, statLevels(s).fortune));
    const item = makeItem(s, r, rarity, source);
    return { drop: { kind: 'item', itemId: item.id }, item };
  }
  if (kind === 'egg') return { drop: { kind: 'egg', species: pick(r, SPECIES).id } };
  if (kind === 'potion') return { drop: { kind: 'potion', potion: pick(r, POTIONS).id } };
  return { drop: { kind: 'food', n: r() < 0.3 ? 2 : 1 } };
}

/** Roll a task's loot. Returns null most of the time. Mutates s when something drops. */
export function rollTaskDrop(s: State, seed: string, tier: TierName): Drop | null {
  const r = rng(`${seed}|drop`);
  if (r() >= P2.dropChance[tier]) return null;
  const { drop, item } = rollKind(s, r, 'task', P2.dropKinds, 'task');
  return grantDrop(s, drop, item);
}

export type ChestKind = 'bounty' | 'bonus' | 'vault' | 'epic' | 'boss';

export const CHEST_LABEL: Record<ChestKind, string> = {
  bounty: 'Bounty chest',
  bonus: 'Bonus chest',
  vault: 'Vault chest',
  epic: 'Milestone chest',
  boss: 'Boss chest',
};

/** Open a chest: some gold plus loot. Mutates s and returns what was inside. */
export function openChest(s: State, kind: ChestKind, seed: string, slot?: ItemSlot): { gold: number; drops: Drop[] } {
  const r = rng(`${seed}|chest|${kind}`);
  const drops: Drop[] = [];
  let gold = 0;
  const add = (x: { drop: Drop; item?: Item }) => drops.push(grantDrop(s, x.drop, x.item));
  const gearOnly = { item: 1, egg: 0, potion: 0, food: 0 };
  const extras = { item: 0, egg: 1, potion: 1, food: 1 };
  switch (kind) {
    case 'bounty':
      gold = 5;
      add(rollKind(s, r, 'bounty', { item: 0.7, egg: 0.1, potion: 0.1, food: 0.1 }, 'bounty'));
      break;
    case 'bonus':
      gold = 10;
      add(rollKind(s, r, 'bonus', gearOnly, 'bounty'));
      break;
    case 'vault':
    case 'epic':
      gold = 10;
      add(rollKind(s, r, 'bounty', gearOnly, kind));
      if (r() < 0.3) add(rollKind(s, r, 'bounty', extras, kind));
      break;
    case 'boss': {
      const item = makeItem(s, r, 'rare', 'boss', slot);
      add({ drop: { kind: 'item', itemId: item.id }, item });
      if (r() < P2.boss.eggChance) add({ drop: { kind: 'egg', species: pick(r, SPECIES).id } });
      break;
    }
  }
  s.gold += gold;
  return { gold, drops };
}

/** A Rare item for a chosen slot (finished Epics). */
export function grantRare(s: State, slot: ItemSlot, source: string): Drop {
  const r = rng(`${source}|${s.today}|${slot}`);
  const item = makeItem(s, r, 'rare', source, slot);
  return grantDrop(s, { kind: 'item', itemId: item.id }, item);
}

export function dropText(s: Pick<State, 'inventory'>, d: Drop): string {
  switch (d.kind) {
    case 'item': {
      if (!d.itemId) return 'Gear found, but your bag is full, so it was sold';
      const it = s.inventory.find((i) => i.id === d.itemId);
      return it ? `${RARITY[it.rarity].label} ${ITEM_SLOT_LABEL[it.slot].toLowerCase()}: ${it.name}` : 'New gear';
    }
    case 'egg':
      return `${speciesById(d.species).name} egg`;
    case 'potion':
      return `${potionById(d.potion).name} hatching potion`;
    case 'food':
      return d.n > 1 ? `${d.n} pet treats` : 'Pet treat';
  }
}

export function chestText(s: Pick<State, 'inventory'>, kind: ChestKind, res: { gold: number; drops: Drop[] }): string {
  const parts = res.drops.map((d) => dropText(s, d));
  if (res.gold) parts.push(`${res.gold} gold`);
  return `${CHEST_LABEL[kind]}: ${parts.join(', ')}.`;
}

export const dayOf = (s: Pick<State, 'today'>): DayKey => s.today;
