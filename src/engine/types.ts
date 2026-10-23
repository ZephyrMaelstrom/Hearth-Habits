// Core data model. Everything the game knows about a player lives in one
// serializable State object, so it can be saved locally and synced as one doc.

export const STATS = ['might', 'vigor', 'mind', 'craft', 'spirit', 'bond', 'fortune'] as const;
export type Stat = (typeof STATS)[number];

export type TierName = 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Epic';
export type TaskType = 'habit' | 'daily' | 'todo';
export type Tone = 'cheerful' | 'dry' | 'stoic' | 'gentle';

/** A local calendar day, 'YYYY-MM-DD'. */
export type DayKey = string;

export type DayMark = 'done' | 'missed' | 'rest' | 'excused' | 'vacation';

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  effort: number; // 1-5
  minutes: number;
  dread: number; // 1-5
  stats: Stat[]; // 1 or 2
  lifeSkill?: string;
  libraryId?: number;
  createdDay: DayKey;
  createdAt: number;
  order: number;
  archived?: boolean;
  // daily
  days?: number[]; // scheduled weekdays, 0 = Sunday
  restDays?: DayKey[]; // planned one-off rest days
  streak?: number;
  bestStreak?: number;
  history?: Record<DayKey, DayMark>; // last ~60 scheduled days
  graduated?: boolean;
  shrinkOfferedDay?: DayKey;
  graduationOfferedDay?: DayKey;
  // habit
  positive?: boolean;
  negative?: boolean;
  // to-do
  due?: DayKey | null;
  doneDay?: DayKey | null;
}

export type CompletionKind = 'complete' | 'habitPlus' | 'habitMinus';

export interface Completion {
  id: string;
  taskId: string;
  kind: CompletionKind;
  day: DayKey;
  ts: number;
  tier: TierName;
  /** Tier XP after habit-tap and same-day rules, before Spark and caps. */
  base: number;
  spark: boolean;
  /** Self-reported base XP that counted under the daily ceiling and weekly cap. */
  counted: number;
  /** Multiplier applied: Momentum x (1 + Harmony) x (1 + Trait bonus) x (1 + party buffs). */
  mult: number;
  xp: number;
  gold: number;
  stats: Stat[];
  // ---- Phase 2 (all optional so Phase 1 saves load unchanged)
  /** Where the earning came from: a task (default), a Vault entry or a Vault monthly bonus. */
  source?: 'task' | 'vault' | 'vaultBonus';
  /** Damage dealt to the weekly boss, with personal bonuses applied. */
  hit?: number;
  crit?: boolean;
  /** A to-do finished 7 or more days after it was due (double damage on the Procrastinaut). */
  old?: boolean;
  /** Arcane Surge was spent on this hit. */
  surge?: boolean;
  drop?: Drop | null;
  petId?: string | null;
  petXp?: number;
  manaGain?: number;
  /** A Rescue sent to this teammate with this task. */
  rescueTo?: string;
}

// ------------------------------------------------------------------ Phase 2

export const GEAR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet', 'weapon', 'offhand', 'trinket1', 'trinket2'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export type ItemSlot = 'head' | 'chest' | 'legs' | 'hands' | 'feet' | 'weapon' | 'offhand' | 'trinket';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type AffixKind = 'dmg' | 'statDmg' | 'dawn' | 'dusk' | 'hp' | 'crit' | 'mana' | 'gold' | 'petDmg';

export interface Affix {
  kind: AffixKind;
  value: number;
  stat?: Stat;
}

export interface Item {
  id: string;
  slot: ItemSlot;
  name: string;
  rarity: Rarity;
  ilvl: number;
  implicit: Affix;
  affixes: Affix[];
  day: DayKey;
  source: string;
}

export type ClassId = 'warrior' | 'mage' | 'cleric' | 'bard';
export type SkillId = 'shieldWall' | 'arcaneSurge' | 'mend' | 'rally';
export type Species = 'bear' | 'stag' | 'hare' | 'tortoise' | 'fox' | 'owl' | 'beaver' | 'butterfly' | 'wolf' | 'raccoon';
export type PotionColor = 'ember' | 'moss' | 'frost';
export type BossId = 'slothWyrm' | 'procrastinaut' | 'goldGremlin';

export type Drop =
  | { kind: 'item'; itemId: string }
  | { kind: 'egg'; species: Species }
  | { kind: 'potion'; potion: PotionColor }
  | { kind: 'food'; n: number };

export interface Pet {
  id: string;
  species: Species;
  potion: PotionColor;
  /** Total pet XP; the level is derived from it. */
  xp: number;
  day: DayKey;
}

/** A skill or potion used during a boss week. */
export interface Cast {
  id: string;
  skill: SkillId | 'potion';
  at: number;
  day: DayKey;
}

/** A timed XP or damage boost from yourself or a teammate. */
export interface Buff {
  id: string;
  kind: 'rally' | 'cheer' | 'warcry';
  from: string;
  start: number;
  until: number;
  /** XP bonus for rally and cheer; damage bonus for warcry (and rally with Crescendo). */
  pct: number;
  dmgPct?: number;
}

export interface Trophy {
  id: string;
  kind: 'boss' | 'coffer' | 'dragon' | 'epic';
  label: string;
  day: DayKey;
}

export type BountyKind = 'stat' | 'early' | 'tier' | 'allDailies' | 'todo' | 'overdue' | 'vault' | 'streak' | 'spread';

export interface Bounty {
  id: string;
  kind: BountyKind;
  label: string;
  target: number;
  stat?: Stat;
  taskId?: string;
  claimed: boolean;
}

export interface VaultEntry {
  id: string;
  day: DayKey;
  ts: number;
  amount: number;
  completionId?: string | null;
  crit?: boolean;
}

export interface Coffer {
  id: string;
  name: string;
  target: number;
  deadline: DayKey;
  createdDay: DayKey;
  entries: VaultEntry[];
  /** Percent milestones (25, 50, 75, 100) whose chests were paid. */
  chests: number[];
  /** Months whose planned amount was reached (the Hard bonus was paid). */
  monthBonus: string[];
  plan: { month: string; amount: number } | null;
  doneDay: DayKey | null;
  archived?: boolean;
}

export interface Debt {
  id: string;
  name: string;
  start: number;
  balance: number;
  apr: number | null;
  minPayment: number | null;
  createdDay: DayKey;
  entries: VaultEntry[];
  interest: { month: string; amount: number }[];
  slainDay: DayKey | null;
  archived?: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  doneDay: DayKey | null;
}

export interface Epic {
  id: string;
  title: string;
  deadline: DayKey;
  createdDay: DayKey;
  milestones: Milestone[];
  linked: string[];
  doneDay: DayKey | null;
  rewarded: boolean;
}

export interface BossResult {
  week: DayKey;
  boss: BossId;
  won: boolean;
  wonDay: DayKey | null;
  damage: number;
  strikes: number;
  party: boolean;
  members: number;
  gremlinGold: number;
}

/** What a player shares with their party each week. No task names, ever. */
export interface MemberSummary {
  uid: string;
  name: string;
  level: number;
  /** Level at the start of the week: boss HP doesn't grow when you level up mid-fight. */
  fightLevel?: number;
  cls: ClassId | null;
  title: string | null;
  shape: Record<Stat, number>;
  avatar: Record<string, string>;
  week: DayKey;
  /** First day this member could fight this week (unlock or join day). */
  joinDay: DayKey;
  lastOpen: DayKey;
  lanternLow: boolean;
  maxHp: number;
  /** Party-wide effects this member brings. */
  aura: { inspire: number; beacon: boolean; ward: boolean; warcry: number; crescendo: boolean; unbreakable: boolean; secondWind: boolean; ironRhythm: number; mendPct: number; cheerHeal: boolean; strikeResist: number };
  hits: { id: string; at: number; day: DayKey; dmg: number; stats: Stat[]; old?: boolean; pet?: boolean }[];
  days: Record<DayKey, { done: number; sched: number; oldTodos: number; vault: boolean; fortune: boolean }>;
  casts: Cast[];
  buffs: Buff[];
  cheers: { id: string; to: string; at: number }[];
  rescues: { id: string; to: string; at: number }[];
  recent: { id: string; at: number; tier: TierName; stats: Stat[] }[];
  updatedAt: number;
}

// ------------------------------------------------------------------ Phase 3

export interface AiSettings {
  /** Opt-in: Ember's morning plan and weekly review are written by Claude. */
  enabled: boolean;
  consentDay: DayKey | null;
}

/** What Ember knows about you. You can read, edit or wipe it any time. */
export interface Memory {
  goals: string;
  helps: string;
  notes: string;
}

export interface Reminders {
  /** Local hour the morning plan is ready (and pushed, if push is on). */
  morningHour: number;
  evening: boolean;
  eveningHour: number;
  /** No pushes from quietStart to quietEnd (local hours). */
  quietStart: number;
  quietEnd: number;
  push: boolean;
}

export interface AiSuggestion {
  type: 'moveTodo' | 'rest' | 'roughDay';
  taskId?: string;
}

/** What the hourly Ember job wrote for you, as received. */
export interface AiInbox {
  morning: { day: DayKey; text: string; suggestion: AiSuggestion | null; at: number } | null;
  weekly: { week: DayKey; text: string; at: number } | null;
}

export interface Tuning {
  bossHp: number;
  dropRate: number;
}

export interface PartyInfo {
  code: string;
  name: string;
  joined: DayKey;
  /** Your signed-in account id, which is your id inside the party. */
  uid: string;
}

export interface DayLog {
  day: DayKey;
  opened: boolean;
  momentumStart: number;
  selfCounted: number;
  xp: number;
  gold: number;
  sparkUsed: boolean;
  rough?: { keep: string[] };
  /** Filled in when the day is closed by the rollover. */
  scheduled?: number;
  done?: number;
  neg?: number;
  share?: number;
  vacation?: boolean;
  closed?: boolean;
  momentumEnd?: number;
  /** Open to-dos at least 7 days overdue when the day closed (Procrastinaut). */
  oldTodos?: number;
}

export interface Reward {
  id: string;
  title: string;
  price: number;
  claimed: number;
  createdAt: number;
}

export interface Trait {
  id: string;
  name: string;
  stat: Stat;
  bonus: number; // XP bonus on tasks with this stat, e.g. 0.02
  fromTask: string;
  day: DayKey;
}

export type WispKind =
  | 'welcome'
  | 'morning'
  | 'levelup'
  | 'streak'
  | 'slump'
  | 'unlock'
  | 'shrink'
  | 'graduate'
  | 'weekly'
  | 'cap'
  | 'muted'
  | 'boss'
  | 'achievement'
  | 'party';

export type WispAction =
  | { type: 'roughDay' }
  | { type: 'editTask'; taskId: string }
  | { type: 'graduate'; taskId: string }
  | { type: 'moveTodo'; taskId: string }
  | { type: 'openTab'; tab: string }
  | { type: 'restTask'; taskId: string }
  | { type: 'dismiss' };

export interface WispMessage {
  id: string;
  kind: WispKind;
  day: DayKey;
  ts: number;
  text: string;
  actions: { label: string; action: WispAction }[];
  read: boolean;
  dismissed: boolean;
  /** Messages the player asked for (settings, opt-in morning plan) don't use the daily budget. */
  prompted: boolean;
  /** Written by Claude (Phase 3) rather than a template. */
  ai?: boolean;
}

export interface Counters {
  perfectDays: number;
  bossWins: number;
  bossKinds: BossId[];
  flawless: number;
  hatched: number;
  cheersGiven: number;
  rescuesGiven: number;
  bountyFullDays: number;
  epicsDone: number;
  dragonsSlain: number;
}

export interface State {
  version: 2;
  profile: {
    name: string;
    tone: Tone;
    talk: number; // 1-5
    morningPlan: boolean;
    onboarded: boolean;
    createdDay: DayKey;
    deviceId: string;
    // ---- Phase 3
    /** IANA time zone, so the hourly Ember job knows your local time. */
    tz?: string;
    /** Life areas picked at onboarding. */
    focus?: Stat[];
    ai?: AiSettings;
    memory?: Memory;
    reminders?: Reminders;
  };
  xp: number;
  gold: number;
  statXp: Record<Stat, number>;
  momentum: number;
  week: { start: DayKey; selfCounted: number };
  today: DayKey;
  days: Record<DayKey, DayLog>;
  tasks: Task[];
  completions: Completion[];
  rewards: Reward[];
  traits: Trait[];
  owned: string[];
  equipped: Record<string, string>;
  rough: { month: string; used: number };
  vacationUntil: DayKey | null;
  wisp: {
    messages: WispMessage[];
    dismissals: Partial<Record<WispKind, number>>;
    muted: WispKind[];
    seenUnlocks: string[];
    celebrated: string[];
    lastWeekly: DayKey | null;
    lastMorning: DayKey | null;
    pendingUnlocks: string[];
  };
  lastLevel: number;
  updatedAt: number;

  // ---- Phase 2
  cls: { id: ClassId; day: DayKey; changes: number; lastChange: DayKey } | null;
  /** Skill-tree ranks by node id. */
  skills: Record<string, number>;
  mana: number;
  inventory: Item[];
  gear: Partial<Record<GearSlot, string>>;
  pets: Pet[];
  activePet: string | null;
  bag: { eggs: Partial<Record<Species, number>>; potions: Partial<Record<PotionColor, number>>; food: number; healing: number };
  trophies: Trophy[];
  titles: string[];
  title: string | null;
  achievements: Record<string, DayKey>;
  counters: Counters;
  bounties: { day: DayKey; list: Bounty[]; rerolled: boolean; bonusClaimed: boolean };
  vault: { coffers: Coffer[]; debts: Debt[]; month: string };
  epics: Epic[];
  epicChest: { day: DayKey | null; owed: number };
  combat: {
    week: DayKey;
    /** Day the boss first became available (level 3). */
    startDay: DayKey | null;
    casts: Cast[];
    surgeArmed: boolean;
    results: BossResult[];
  };
  buffs: Buff[];
  party: PartyInfo | null;
  /** The other members' summaries from the last sync, kept so a week can settle offline. */
  partyView: { week: DayKey; members: MemberSummary[]; prev: MemberSummary[]; fetchedAt: number } | null;
  social: {
    cheers: { id: string; to: string; at: number }[];
    rescues: { id: string; to: string; at: number }[];
    pendingRescue: string | null;
    /** Ids of cheers, rescues and teammate buffs already applied here. */
    seen: string[];
    received: { day: DayKey; cheers: number };
  };

  // ---- Phase 3
  ai: AiInbox;
  firstSteps: { done: string[]; dismissed: boolean };
}
