// What Ember says when each system opens.

import type { WispAction } from './types';

export const UNLOCK_TEXT: Record<string, { label: string; detail: string; actions: { label: string; action: WispAction }[] }> = {
  rewards: {
    label: 'Rewards and the gold shop',
    detail: 'Spend gold on real treats you price yourself, or on looks for your hero.',
    actions: [{ label: 'Open Rewards', action: { type: 'openTab', tab: 'rewards' } }],
  },
  hero: {
    label: 'your stat shape',
    detail: 'Each stat grows from tasks in that part of life. Keep the shape balanced to earn Harmony, +10% XP.',
    actions: [{ label: 'Open Hero', action: { type: 'openTab', tab: 'hero' } }],
  },
  bounties: {
    label: 'daily bounties',
    detail: 'Three small goals each morning, drawn from your own list. Each one pays a chest, and all three pay a bonus chest.',
    actions: [{ label: 'See them on Today', action: { type: 'openTab', tab: 'today' } }],
  },
  boss: {
    label: 'the weekly boss',
    detail: 'Every task you finish hits it, and loot starts dropping. It only strikes back on nights you finish less than 70% of your Dailies.',
    actions: [{ label: 'Meet the boss', action: { type: 'openTab', tab: 'quest' } }],
  },
  pets: {
    label: 'pets',
    detail: "Here's an egg and a hatching potion to start. Your battle pet hits the boss on days you finish 3 or more tasks.",
    actions: [{ label: 'Hatch it', action: { type: 'openTab', tab: 'hero:pets' } }],
  },
  party: {
    label: 'parties',
    detail: 'Team up with 2 to 6 friends against one boss. Cheer their wins, and rescue them when their lantern runs low.',
    actions: [{ label: 'Start a party', action: { type: 'openTab', tab: 'quest' } }],
  },
  vault: {
    label: 'the Vault',
    detail: 'Savings goals and debts become quests. Your first entry each day pays like a Medium task, whatever the amount.',
    actions: [{ label: 'Open the Vault', action: { type: 'openTab', tab: 'treasury' } }],
  },
  epics: {
    label: 'Epics',
    detail: 'Turn a months-long goal into milestones with a finish-date projection. Each milestone pays a chest.',
    actions: [{ label: 'Plan an Epic', action: { type: 'openTab', tab: 'quest' } }],
  },
  class: {
    label: 'class choice',
    detail: 'Warrior, Mage, Cleric or Bard. Tasks that match your class hit 25% harder, and you get a skill tree.',
    actions: [{ label: 'Choose a class', action: { type: 'openTab', tab: 'hero:class' } }],
  },
};
