// Phase 1 gold shop: cosmetics for the hero portrait. Gold buys looks, never power.

export type Slot = 'cloak' | 'hat' | 'item';

export interface ShopItem {
  id: string;
  slot: Slot;
  name: string;
  price: number;
  color?: string;
}

export const SHOP: ShopItem[] = [
  { id: 'cloak-ember', slot: 'cloak', name: 'Ember cloak', price: 0, color: '#C9772E' },
  { id: 'cloak-moss', slot: 'cloak', name: 'Moss cloak', price: 60, color: '#5E7F3E' },
  { id: 'cloak-river', slot: 'cloak', name: 'River cloak', price: 60, color: '#3E6E9E' },
  { id: 'cloak-dusk', slot: 'cloak', name: 'Dusk cloak', price: 90, color: '#6B4E8E' },
  { id: 'cloak-frost', slot: 'cloak', name: 'Frost cloak', price: 120, color: '#BFD3E0' },
  { id: 'cloak-crimson', slot: 'cloak', name: 'Crimson cloak', price: 150, color: '#9E3B3B' },
  { id: 'hat-none', slot: 'hat', name: 'No hat', price: 0 },
  { id: 'hat-hood', slot: 'hat', name: 'Wanderer hood', price: 120 },
  { id: 'hat-circlet', slot: 'hat', name: 'Silver circlet', price: 180 },
  { id: 'hat-antlers', slot: 'hat', name: 'Druid antlers', price: 260 },
  { id: 'hat-wizard', slot: 'hat', name: 'Starry wizard hat', price: 320 },
  { id: 'hat-crown', slot: 'hat', name: 'Hearth crown', price: 400 },
  { id: 'item-none', slot: 'item', name: 'Empty hands', price: 0 },
  { id: 'item-lantern', slot: 'item', name: 'Lantern', price: 200 },
  { id: 'item-staff', slot: 'item', name: 'Oak staff', price: 240 },
  { id: 'item-tome', slot: 'item', name: 'Field tome', price: 240 },
];

export const itemById = (id: string) => SHOP.find((i) => i.id === id);
