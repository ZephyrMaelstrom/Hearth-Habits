// Ember, the template-only wisp (Phase 1). A rules engine decides WHEN to speak;
// written templates in four tones decide HOW. No AI calls yet (that is Phase 3).
//
// The not-annoying rules, enforced here:
//  1. Quiet by default: unprompted messages per day = 0,1,2,3,4 for talkativeness 1-5.
//  2. Glow, don't pop: messages wait behind the glowing orb (the UI never pops them).
//  3. One nudge per task per day: shrink/graduation offers carry an offered-day stamp.
//  4. Dismiss a kind 3 times and it is muted, with one note saying how to undo it.
//  5. Never guilt: no template mentions failure or shame.
//  6. Every message has a point: a number, a choice or a button.

import type { State, Tone, WispAction, WispKind, WispMessage } from './types';
import { uid } from './state';

type Vars = Record<string, string | number>;
type Tpl = (v: Vars) => string;

const T: Record<Exclude<WispKind, 'morning'>, Record<Tone, Tpl>> = {
  welcome: {
    cheerful: (v) => `Hi ${v.name}! I'm Ember. Every task you finish feeds the fire, and I'll keep count with you.`,
    dry: (v) => `I'm Ember, ${v.name}. You do the tasks, I keep score. Fair trade.`,
    stoic: (v) => `I am Ember. Begin small, ${v.name}. The fire grows from what you keep.`,
    gentle: (v) => `Hello ${v.name}, I'm Ember. We'll start with a few things that matter and go from there.`,
  },
  levelup: {
    cheerful: (v) => `Level ${v.level}! ${v.unlock}`.trim(),
    dry: (v) => `Level ${v.level}. ${v.unlock}`.trim(),
    stoic: (v) => `Level ${v.level}. ${v.unlock}`.trim(),
    gentle: (v) => `You reached level ${v.level}. ${v.unlock}`.trim(),
  },
  streak: {
    cheerful: (v) => `${v.days} days of "${v.task}" in a row. That's how habits stick!`,
    dry: (v) => `"${v.task}": ${v.days} days straight. Suspiciously consistent.`,
    stoic: (v) => `"${v.task}": ${v.days} days. The habit holds.`,
    gentle: (v) => `${v.days} days of "${v.task}". Quietly, it's becoming part of you.`,
  },
  slump: {
    cheerful: (v) => `Momentum dipped two days running (${v.m}x). A rough day keeps just your top 3 Dailies and protects it. Want one?`,
    dry: (v) => `Momentum's sliding (${v.m}x). Rough-day mode: 3 Dailies, no penalty for the rest. Tempting?`,
    stoic: (v) => `Momentum ${v.m}x and falling. Narrow the day to three Dailies if you need to.`,
    gentle: (v) => `Momentum has eased to ${v.m}x. If today's heavy, a rough day keeps just your top 3 Dailies.`,
  },
  unlock: {
    cheerful: (v) => `New: ${v.label}. ${v.detail}`,
    dry: (v) => `Unlocked: ${v.label}. ${v.detail}`,
    stoic: (v) => `${v.label} is open. ${v.detail}`,
    gentle: (v) => `Something new: ${v.label}. ${v.detail}`,
  },
  shrink: {
    cheerful: (v) => `"${v.task}" has landed ${v.pct}% of the time lately. Smaller version or fewer days?`,
    dry: (v) => `"${v.task}": ${v.pct}% lately. Shrink it before it shrinks you.`,
    stoic: (v) => `"${v.task}" holds at ${v.pct}%. Make it smaller, or rarer.`,
    gentle: (v) => `"${v.task}" has been hard to fit in (${v.pct}% lately). A smaller version might feel better.`,
  },
  graduate: {
    cheerful: (v) => `"${v.task}" is basically automatic: ${v.pct}% for 4 weeks! Graduate it into the ${v.trait} trait and free the slot?`,
    dry: (v) => `"${v.task}": ${v.pct}% for 4 weeks. It's a habit now. Graduate it into ${v.trait}?`,
    stoic: (v) => `"${v.task}": ${v.pct}% for four weeks. It is part of you. Take ${v.trait}.`,
    gentle: (v) => `"${v.task}" has become part of your days (${v.pct}% for 4 weeks). Graduate it into ${v.trait}?`,
  },
  weekly: {
    cheerful: (v) => `Last week: ${v.done} of ${v.scheduled} Dailies, ${v.xp} XP, best stat ${v.stat}. ${v.pattern} ${v.tip}`.trim(),
    dry: (v) => `Week in numbers: ${v.done}/${v.scheduled} Dailies, ${v.xp} XP, ${v.stat} led. ${v.pattern} ${v.tip}`.trim(),
    stoic: (v) => `Last week: ${v.done} of ${v.scheduled} Dailies. ${v.xp} XP. ${v.stat} grew most. ${v.pattern} ${v.tip}`.trim(),
    gentle: (v) => `Your week: ${v.done} of ${v.scheduled} Dailies and ${v.xp} XP, with ${v.stat} growing most. ${v.pattern} ${v.tip}`.trim(),
  },
  cap: {
    cheerful: (v) => `You hit this week's ${v.cap} XP cap! Tasks still build streaks and Momentum; XP comes back Monday.`,
    dry: (v) => `Weekly cap reached (${v.cap}). Streaks still count. XP resets Monday.`,
    stoic: (v) => `The week's ${v.cap} XP is earned. Streaks and Momentum still count. XP returns Monday.`,
    gentle: (v) => `That's this week's ${v.cap} XP. Everything you do still counts for streaks and Momentum.`,
  },
  boss: {
    cheerful: (v) => (v.won ? `We beat the ${v.boss}! Your loot is in the bag.` : `The ${v.boss} got away with ${v.left}% of its HP left. A new boss arrives Monday.`),
    dry: (v) => (v.won ? `${v.boss}: defeated. Loot: bagged.` : `${v.boss} escaped at ${v.left}% HP. There's always Monday.`),
    stoic: (v) => (v.won ? `The ${v.boss} has fallen. Take your reward.` : `The ${v.boss} withdrew at ${v.left}% HP. Monday brings another.`),
    gentle: (v) => (v.won ? `You did it: the ${v.boss} is beaten. There's loot waiting for you.` : `The ${v.boss} slipped away at ${v.left}% HP. Nothing lost; a new boss comes Monday.`),
  },
  achievement: {
    cheerful: (v) => `Achievement: ${v.name} (${v.tier})!${v.title ? ` New title: ${v.title}.` : ''}`,
    dry: (v) => `${v.tier} achievement: ${v.name}.${v.title ? ` Title unlocked: ${v.title}.` : ''}`,
    stoic: (v) => `${v.name}. ${v.tier}.${v.title ? ` You may be called ${v.title}.` : ''}`,
    gentle: (v) => `You earned ${v.name} (${v.tier}).${v.title ? ` A new title is yours: ${v.title}.` : ''}`,
  },
  party: {
    cheerful: (v) => `${v.text}`,
    dry: (v) => `${v.text}`,
    stoic: (v) => `${v.text}`,
    gentle: (v) => `${v.text}`,
  },
  muted: {
    cheerful: (v) => `Got it, no more ${v.what} notes. You can turn them back on in Settings.`,
    dry: (v) => `Fine. No more ${v.what} notes. Settings has the undo.`,
    stoic: (v) => `I will stop the ${v.what} notes. Settings can restore them.`,
    gentle: (v) => `I'll stop sending ${v.what} notes. They're in Settings if you want them back.`,
  },
};

const MORNING_TAIL: Record<'heavy' | 'normal' | 'empty', Record<Tone, string>> = {
  heavy: {
    cheerful: "That's a lot. Push a to-do to tomorrow?",
    dry: 'Ambitious. Maybe push a to-do.',
    stoic: 'A heavy day. Consider moving a to-do.',
    gentle: "That's a full day. It's okay to move a to-do.",
  },
  normal: {
    cheerful: 'Looks doable!',
    dry: 'Doable.',
    stoic: 'Begin.',
    gentle: 'One thing at a time.',
  },
  empty: {
    cheerful: 'Nothing scheduled. Add a Daily and I will help you keep it.',
    dry: 'Empty board. Add a Daily or enjoy the quiet.',
    stoic: 'Nothing is scheduled. Choose something.',
    gentle: "Nothing scheduled today. Add something small if you'd like.",
  },
};

export function morningText(tone: Tone, v: { weekday: string; n: number; todos: number; hist: string; load: 'heavy' | 'normal' | 'empty' }) {
  if (v.load === 'empty') return MORNING_TAIL.empty[tone];
  const todo = v.todos ? ` and ${v.todos} to-do${v.todos > 1 ? 's' : ''}` : '';
  return `${v.weekday}: ${v.n} ${v.n === 1 ? 'Daily' : 'Dailies'}${todo}. ${v.hist} ${MORNING_TAIL[v.load][tone]}`.replace(/\s+/g, ' ').trim();
}

export const KIND_LABEL: Record<WispKind, string> = {
  welcome: 'welcome',
  morning: 'morning plan',
  levelup: 'level-up',
  streak: 'streak',
  slump: 'Momentum',
  unlock: 'unlock',
  shrink: 'shrink-a-task',
  graduate: 'graduation',
  weekly: 'weekly review',
  cap: 'weekly cap',
  muted: 'mute',
  boss: 'boss result',
  achievement: 'achievement',
  party: 'party',
};

const BUDGET = [0, 1, 2, 3, 4];

export function budgetFor(talk: number): number {
  return BUDGET[Math.min(5, Math.max(1, talk)) - 1];
}

export function unpromptedToday(s: State): number {
  return s.wisp.messages.filter((m) => m.day === s.today && !m.prompted).length;
}

interface SayOpts {
  prompted?: boolean;
  /** Once-ever key: the message is skipped if this key was used before. */
  key?: string;
  text?: string;
}

/** Queue a wisp message, respecting mutes, de-duplication and the daily budget. Mutates s. */
export function say(
  s: State,
  kind: WispKind,
  vars: Vars,
  actions: { label: string; action: WispAction }[] = [],
  opts: SayOpts = {},
): boolean {
  if (kind !== 'muted' && kind !== 'welcome' && s.wisp.muted.includes(kind)) return false;
  if (opts.key && s.wisp.celebrated.includes(opts.key)) return false;
  if (!opts.prompted && unpromptedToday(s) >= budgetFor(s.profile.talk)) {
    if (kind === 'unlock' && typeof vars.id === 'string' && !s.wisp.pendingUnlocks.includes(vars.id)) {
      s.wisp.pendingUnlocks.push(vars.id);
    }
    return false;
  }
  if (opts.key) s.wisp.celebrated.push(opts.key);
  const tone = s.profile.tone;
  const text = opts.text ?? (kind === 'morning' ? '' : T[kind][tone](vars));
  const msg: WispMessage = {
    id: uid(),
    kind,
    day: s.today,
    ts: Date.now(),
    text,
    actions,
    read: false,
    dismissed: false,
    prompted: !!opts.prompted,
  };
  s.wisp.messages.push(msg);
  if (s.wisp.messages.length > 60) s.wisp.messages = s.wisp.messages.slice(-60);
  return true;
}

/**
 * Close a message. `rejected` = the player waved it away (counts toward muting);
 * acting on a message or acknowledging it does not. Dismissing the same kind
 * three times mutes it. Mutates s.
 */
export function dismiss(s: State, id: string, rejected = true) {
  const m = s.wisp.messages.find((x) => x.id === id);
  if (!m || m.dismissed) return;
  m.dismissed = true;
  m.read = true;
  if (!rejected || m.kind === 'welcome' || m.kind === 'muted' || m.kind === 'levelup' || m.kind === 'boss') return;
  const n = (s.wisp.dismissals[m.kind] ?? 0) + 1;
  s.wisp.dismissals[m.kind] = n;
  if (n >= 3 && !s.wisp.muted.includes(m.kind)) {
    s.wisp.muted.push(m.kind);
    say(s, 'muted', { what: KIND_LABEL[m.kind] }, [], { prompted: true });
  }
}

export function unmute(s: State, kind: WispKind) {
  s.wisp.muted = s.wisp.muted.filter((k) => k !== kind);
  s.wisp.dismissals[kind] = 0;
}

export function activeMessages(s: State): WispMessage[] {
  return s.wisp.messages.filter((m) => !m.dismissed).slice(-8).reverse();
}

export function unreadCount(s: State): number {
  return s.wisp.messages.filter((m) => !m.read && !m.dismissed).length;
}
