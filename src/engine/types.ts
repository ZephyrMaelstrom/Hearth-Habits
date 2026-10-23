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
  /** Multiplier applied: Momentum x (1 + Harmony) x (1 + Trait bonus). */
  mult: number;
  xp: number;
  gold: number;
  stats: Stat[];
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
  | 'muted';

export type WispAction =
  | { type: 'roughDay' }
  | { type: 'editTask'; taskId: string }
  | { type: 'graduate'; taskId: string }
  | { type: 'moveTodo'; taskId: string }
  | { type: 'openTab'; tab: string }
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
}

export interface State {
  version: 1;
  profile: {
    name: string;
    tone: Tone;
    talk: number; // 1-5
    morningPlan: boolean;
    onboarded: boolean;
    createdDay: DayKey;
    deviceId: string;
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
}
