// Day rollover: when the app opens on a new local day, every day since the last
// visit is closed in order. Closing a day settles Momentum, streaks and history,
// then the wisp runs its daily checks.

import { addDays, dayKey, monthKey, weekday, weekStart, WEEKDAY_NAMES, daysBetween } from './dates';
import { RULES } from './rules';
import { completionFor, isScheduled, round2, scheduledDailies } from './state';
import { STAT_LABEL, TRAIT_NAMES } from './progress';
import { morningText, say } from './wisp';
import { tierOfTask } from './pricing';
import { STATS, type DayKey, type DayLog, type DayMark, type State, type Stat } from './types';

export function momentumTarget(share: number, neg: number): number {
  const m = RULES.momentum;
  return Math.min(m.max, m.t0 + m.t1 * share) - m.negPenalty * neg;
}

export function nextMomentum(M: number, share: number, neg: number): number {
  const m = RULES.momentum;
  const next = M + m.step * (momentumTarget(share, neg) - M);
  return Math.max(m.min, Math.min(m.max, next));
}

function blankLog(s: State, day: DayKey): DayLog {
  return { day, opened: false, momentumStart: s.momentum, selfCounted: 0, xp: 0, gold: 0, sparkUsed: false };
}

function onVacation(s: State, day: DayKey): boolean {
  return !!s.vacationUntil && day <= s.vacationUntil;
}

/** Settle one past day. Mutates s. */
export function closeDay(s: State, day: DayKey) {
  const log = s.days[day] ?? blankLog(s, day);
  if (log.closed) return;
  const vacation = onVacation(s, day);
  let counted = 0;
  let done = 0;
  for (const t of s.tasks) {
    if (!isScheduled(t, day)) continue;
    const isDone = !!completionFor(s, t.id, day);
    let mark: DayMark;
    if (isDone) mark = 'done';
    else if (t.restDays?.includes(day)) mark = 'rest';
    else if (vacation) mark = 'vacation';
    else if (log.rough && !log.rough.keep.includes(t.id)) mark = 'excused';
    else mark = 'missed';
    if (mark === 'done' || mark === 'missed') counted++;
    if (mark === 'done') done++;
    t.history = { ...(t.history ?? {}), [day]: mark };
    if (mark === 'done') {
      t.streak = (t.streak ?? 0) + 1;
      t.bestStreak = Math.max(t.bestStreak ?? 0, t.streak);
    } else if (mark === 'missed') {
      t.streak = 0;
    }
    const keys = Object.keys(t.history).sort();
    if (keys.length > RULES.historyDays) for (const k of keys.slice(0, keys.length - RULES.historyDays)) delete t.history[k];
  }
  const neg = s.completions.filter((c) => c.day === day && c.kind === 'habitMinus').length;
  const share = counted ? done / counted : 1;
  if (!vacation) s.momentum = nextMomentum(s.momentum, share, neg);
  s.days[day] = { ...log, scheduled: counted, done, neg, share: round2(share), vacation, closed: true, momentumEnd: s.momentum };
}

/**
 * Bring the state up to `now`: close every day since the last visit, reset the
 * week and month counters, open today's log and run the wisp's daily checks.
 * Returns the same object when nothing changed.
 */
export function rollover(state: State, now: Date = new Date()): State {
  const today = dayKey(now);
  if (state.today === today && state.days[today]?.opened) return state;
  const s: State = structuredClone(state);
  if (s.today !== today) {
    let d = s.today < addDays(today, -60) ? addDays(today, -60) : s.today;
    while (d < today) {
      closeDay(s, d);
      d = addDays(d, 1);
    }
    s.today = today;
  }
  if (weekStart(today) !== s.week.start) s.week = { start: weekStart(today), selfCounted: 0 };
  if (monthKey(today) !== s.rough.month) s.rough = { month: monthKey(today), used: 0 };
  if (s.vacationUntil && today > s.vacationUntil) s.vacationUntil = null;
  s.days[today] = { ...(s.days[today] ?? blankLog(s, today)), opened: true, momentumStart: s.days[today]?.momentumStart ?? s.momentum };

  prune(s, today);
  dailyWisp(s, today);
  s.updatedAt = now.getTime();
  return s;
}

function prune(s: State, today: DayKey) {
  const keepDays = addDays(today, -120);
  for (const k of Object.keys(s.days)) if (k < keepDays) delete s.days[k];
  const keepComp = addDays(today, -RULES.completionDays);
  s.completions = s.completions.filter((c) => c.day >= keepComp);
}

// ------------------------------------------------------------------ wisp checks

function recentRate(history: Record<DayKey, DayMark> | undefined, today: DayKey, windowDays: number) {
  let sched = 0;
  let done = 0;
  for (let i = 1; i <= windowDays; i++) {
    const m = history?.[addDays(today, -i)];
    if (m === 'done' || m === 'missed') sched++;
    if (m === 'done') done++;
  }
  return { sched, done, rate: sched ? done / sched : 0 };
}

function dailyWisp(s: State, today: DayKey) {
  if (!s.profile.onboarded) return;

  // pending unlock explanations from days that ran out of budget
  for (const id of [...s.wisp.pendingUnlocks]) {
    const u = UNLOCK_TEXT[id];
    if (u && say(s, 'unlock', { id, label: u.label, detail: u.detail }, u.actions)) {
      s.wisp.pendingUnlocks = s.wisp.pendingUnlocks.filter((x) => x !== id);
    }
  }

  // slump: Momentum fell two days running and sits below 1.0
  const y1 = s.days[addDays(today, -1)]?.momentumEnd;
  const y2 = s.days[addDays(today, -2)]?.momentumEnd;
  const y3 = s.days[addDays(today, -3)]?.momentumEnd ?? RULES.momentum.start;
  if (y1 !== undefined && y2 !== undefined && y1 < y2 - 0.004 && y2 < y3 - 0.004 && s.momentum < 1) {
    const canRough = s.rough.used < RULES.rough.perMonth && scheduledDailies(s, today).length > RULES.rough.keep;
    say(s, 'slump', { m: s.momentum.toFixed(2) }, canRough ? [{ label: 'Take a rough day', action: { type: 'roughDay' } }] : [], {
      key: `slump:${today}`,
    });
  }

  // graduation and shrink offers, at most one of each per day
  const dailies = s.tasks.filter((t) => t.type === 'daily' && !t.archived && !t.graduated);
  const g = RULES.graduation;
  if (s.traits.length < g.maxTraits) {
    const cand = dailies.find((t) => {
      const r = recentRate(t.history, today, g.windowDays);
      const recentlyOffered = t.graduationOfferedDay && daysBetween(t.graduationOfferedDay, today) < 7;
      return !recentlyOffered && tierOfTask(t).name !== 'Trivial' && r.sched >= g.minScheduled && r.rate >= g.rate;
    });
    if (cand) {
      const r = recentRate(cand.history, today, g.windowDays);
      const trait = TRAIT_NAMES[cand.stats[0]];
      if (
        say(s, 'graduate', { task: cand.title, pct: Math.round(r.rate * 100), trait }, [
          { label: 'Graduate it', action: { type: 'graduate', taskId: cand.id } },
          { label: 'Not yet', action: { type: 'dismiss' } },
        ])
      )
        cand.graduationOfferedDay = today;
    }
  }
  const sh = RULES.shrink;
  const shrinkCand = dailies.find((t) => {
    const r = recentRate(t.history, today, sh.windowDays);
    const recentlyOffered = t.shrinkOfferedDay && daysBetween(t.shrinkOfferedDay, today) < sh.windowDays;
    return !recentlyOffered && r.sched >= sh.minScheduled && r.rate < sh.rate;
  });
  if (shrinkCand) {
    const r = recentRate(shrinkCand.history, today, sh.windowDays);
    if (
      say(s, 'shrink', { task: shrinkCand.title, pct: Math.round(r.rate * 100) }, [
        { label: 'Edit it', action: { type: 'editTask', taskId: shrinkCand.id } },
        { label: 'Not now', action: { type: 'dismiss' } },
      ])
    )
      shrinkCand.shrinkOfferedDay = today;
  }

  // weekly review on the first visit of a new week
  if (s.wisp.lastWeekly !== s.week.start) {
    const prevStart = addDays(s.week.start, -7);
    const review = weeklyReview(s, prevStart);
    if (review) say(s, 'weekly', review, [], { prompted: true });
    s.wisp.lastWeekly = s.week.start;
  }

  // opt-in morning plan
  if (s.profile.morningPlan && s.wisp.lastMorning !== today) {
    s.wisp.lastMorning = today;
    const plan = morningPlan(s, today);
    say(s, 'morning', {}, plan.actions, { prompted: true, text: plan.text });
  }
}

export function weeklyReview(s: State, start: DayKey) {
  let scheduled = 0;
  let done = 0;
  let xp = 0;
  let worst: { day: DayKey; share: number } | null = null;
  const statGain: Record<Stat, number> = Object.fromEntries(STATS.map((k) => [k, 0])) as Record<Stat, number>;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const log = s.days[d];
    if (!log) continue;
    scheduled += log.scheduled ?? 0;
    done += log.done ?? 0;
    xp += log.xp;
    if (log.scheduled && (worst === null || (log.share ?? 1) < worst.share)) worst = { day: d, share: log.share ?? 1 };
  }
  for (const c of s.completions) {
    if (c.day < start || c.day > addDays(start, 6) || c.kind === 'habitMinus') continue;
    for (const st of c.stats) statGain[st] += c.xp / c.stats.length;
  }
  if (!scheduled && !xp) return null;
  const best = STATS.reduce((a, b) => (statGain[b] > statGain[a] ? b : a), STATS[0]);
  const pattern = worst && worst.share < 0.7 ? `${WEEKDAY_NAMES[weekday(worst.day)]} was the hardest day.` : 'No weak day stood out.';
  const tip =
    worst && worst.share < 0.5
      ? `Try a planned rest day on ${WEEKDAY_NAMES[weekday(worst.day)]}s?`
      : done === scheduled && scheduled > 0
        ? 'Every Daily done. Ready to add one?'
        : '';
  return { done, scheduled, xp: Math.round(xp), stat: STAT_LABEL[best], pattern, tip };
}

export function morningPlan(s: State, today: DayKey) {
  const dailies = scheduledDailies(s, today).filter((t) => !t.restDays?.includes(today));
  const todos = s.tasks.filter((t) => t.type === 'todo' && !t.archived && !t.doneDay && t.due && t.due <= today);
  // completion share on the same weekday over the last 4 weeks
  const shares: number[] = [];
  for (let w = 1; w <= 4; w++) {
    const log = s.days[addDays(today, -7 * w)];
    if (log?.closed && log.scheduled) shares.push(log.share ?? 0);
  }
  const avg = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null;
  const wd = WEEKDAY_NAMES[weekday(today)];
  const hist = avg === null ? '' : `You usually finish ${Math.round(avg * 100)}% on ${wd}s.`;
  const total = dailies.length + todos.length;
  const expectedMisses = avg === null ? 0 : dailies.length * (1 - avg);
  const load: 'heavy' | 'normal' | 'empty' = total === 0 ? 'empty' : expectedMisses >= 2 && todos.length > 0 ? 'heavy' : 'normal';
  const actions: { label: string; action: import('./types').WispAction }[] = [];
  if (load === 'heavy') actions.push({ label: `Move "${todos[0].title}" to tomorrow`, action: { type: 'moveTodo', taskId: todos[0].id } });
  return { text: morningText(s.profile.tone, { weekday: wd, n: dailies.length, todos: todos.length, hist, load }), actions };
}

export const UNLOCK_TEXT: Record<string, { label: string; detail: string; actions: { label: string; action: import('./types').WispAction }[] }> = {
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
  class: {
    label: 'class choice is close',
    detail: 'Classes arrive in the next update. Your stats carry over.',
    actions: [],
  },
};
