import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../src/engine/library';
import { tierFor } from '../src/engine/pricing';
import { xpForLevel, levelFromXp, dailySlots, harmony } from '../src/engine/progress';
import { nextMomentum, rollover } from '../src/engine/rollover';
import { newState } from '../src/engine/state';
import * as A from '../src/engine/actions';
import { testerReport } from '../src/engine/metrics';
import { RULES } from '../src/engine/rules';
import type { State, Stat } from '../src/engine/types';

const MON = new Date(2026, 9, 26, 9); // Monday, Oct 26 2026
const day = (n: number) => new Date(2026, 9, 26 + n, 9);
const ALL = [0, 1, 2, 3, 4, 5, 6];

function onboarded(now = MON): State {
  return A.finishOnboarding(newState(now), 'Tester', 'cheerful', []).state;
}

function ok(r: A.Result): State {
  expect(r.error).toBeUndefined();
  return r.state;
}

function add(s: State, type: 'daily' | 'habit' | 'todo', title: string, e: number, m: number, d: number, stats: Stat[] = ['mind']) {
  return ok(A.addTask(s, { type, title, effort: e, minutes: m, dread: d, stats, days: type === 'daily' ? ALL : undefined }));
}

const taskId = (s: State, title: string) => s.tasks.find((t) => t.title === title)!.id;

describe('pricing', () => {
  it('prices all 100 library tasks exactly as Phase 0 did', () => {
    expect(LIBRARY).toHaveLength(100);
    for (const t of LIBRARY) expect(tierFor(t.effort, t.minutes, t.dread).name, t.title).toBe(t.tier);
  });
  it('matches the tier calculator examples', () => {
    expect(tierFor(1, 1, 1).name).toBe('Trivial');
    expect(tierFor(2, 20, 2).name).toBe('Easy');
    expect(tierFor(4, 30, 4).name).toBe('Hard');
    expect(tierFor(5, 50, 4).name).toBe('Epic');
    expect(tierFor(4, 30, 5)).toMatchObject({ name: 'Hard', xp: 35, gold: 14, score: 11 });
  });
});

describe('levels and stats', () => {
  it('follows XP to next level = 30 x level', () => {
    expect(xpForLevel(10)).toBe(1350);
    expect(xpForLevel(30)).toBe(13050);
    expect(xpForLevel(100)).toBe(148500);
    expect(levelFromXp(1349.99)).toBe(9);
    expect(levelFromXp(1350)).toBe(10);
  });
  it('opens a Daily slot every 5 levels, 6 to 15', () => {
    expect(dailySlots(1)).toBe(6);
    expect(dailySlots(5)).toBe(7);
    expect(dailySlots(99)).toBe(15);
  });
  it('turns Harmony on only for a balanced shape with a top stat at level 5+', () => {
    const s = newState(MON);
    expect(harmony(s).active).toBe(false); // everything at level 1
    for (const k of Object.keys(s.statXp) as Stat[]) s.statXp[k] = xpForLevel(5);
    expect(harmony(s).active).toBe(true);
    s.statXp.craft = xpForLevel(2);
    expect(harmony(s).active).toBe(false);
  });
});

describe('Momentum', () => {
  it('reproduces the workbook Momentum tab to 3 decimals', () => {
    const shares = [0.9, 1, 0.8, 1, 0.9, 1, 0.85, 0.4, 0.3, 0.5, 0.2, 0.6, 0.5, 0.4, 0.9, 1, 0.9, 0.8, 1, 0.9];
    const expected = [1, 1.025, 1.044, 1.05, 1.063, 1.072, 1.079, 1.084, 1.016, 0.948, 0.93, 0.867, 0.885, 0.883, 0.865, 0.923, 0.968, 1.001, 1.018, 1.039, 1.054];
    let M = 1;
    const got = [M];
    for (const sh of shares) got.push((M = nextMomentum(M, sh, 0)));
    got.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 3));
  });
  it('stays inside 0.55 to 1.10', () => {
    let M = 1;
    for (let i = 0; i < 60; i++) M = nextMomentum(M, 1, 0);
    expect(M).toBeLessThanOrEqual(1.1);
    for (let i = 0; i < 60; i++) M = nextMomentum(M, 0, 3);
    expect(M).toBeGreaterThanOrEqual(0.55);
  });
});

describe('earning XP', () => {
  it('pays a typical day: 150 base + 30 Spark at Momentum 1.06 = 190.8 XP', () => {
    let s = onboarded();
    s.days[s.today].momentumStart = 1.06;
    s.week.selfCounted = 600;
    for (let i = 1; i <= 5; i++) s = add(s, 'daily', `Medium ${i}`, 3, 20, 2); // 3+2+2 = 7 Medium
    s = add(s, 'habit', 'Water', 2, 1, 3); // 2+3+0 = 5 Easy
    s = add(s, 'todo', 'Old to-do', 3, 20, 2);
    s.tasks.find((t) => t.title === 'Old to-do')!.createdDay = '2026-10-20';
    for (let i = 1; i <= 5; i++) s = ok(A.completeTask(s, taskId(s, `Medium ${i}`)));
    for (let i = 0; i < 3; i++) s = ok(A.tapHabit(s, taskId(s, 'Water'), 1));
    s = ok(A.completeTask(s, taskId(s, 'Old to-do')));
    expect(s.days[s.today].selfCounted).toBe(180);
    expect(s.xp).toBeCloseTo(190.8, 1);
    expect(s.week.selfCounted).toBe(780);
  });

  it('gives the Daily Spark once a day and takes it back on undo', () => {
    let s = add(onboarded(), 'daily', 'Walk', 2, 20, 2);
    s = add(s, 'daily', 'Read', 2, 15, 1);
    s = ok(A.completeTask(s, taskId(s, 'Walk')));
    expect(s.completions[0]).toMatchObject({ spark: true, counted: 40 });
    s = ok(A.completeTask(s, taskId(s, 'Read')));
    expect(s.completions[1]).toMatchObject({ spark: false, counted: 5, tier: 'Trivial' });
    s = ok(A.uncompleteTask(s, taskId(s, 'Walk')));
    expect(s.days[s.today].sparkUsed).toBe(false);
    expect(s.days[s.today].selfCounted).toBe(5);
    expect(s.xp).toBeCloseTo(5, 5);
  });

  it('pays only the first 3 taps of a habit each day', () => {
    let s = add(onboarded(), 'habit', 'Water', 2, 1, 3);
    for (let i = 0; i < 5; i++) s = ok(A.tapHabit(s, taskId(s, 'Water'), 1));
    expect(s.completions.map((c) => c.base)).toEqual([10, 10, 10, 0, 0]);
  });

  it('halves a to-do created and finished the same day', () => {
    let s = add(onboarded(), 'todo', 'Quick', 3, 20, 2);
    s = ok(A.completeTask(s, taskId(s, 'Quick')));
    expect(s.completions[0].base).toBe(10);
  });

  it('caps a spam day at the 300 daily ceiling', () => {
    let s = onboarded();
    for (let i = 0; i < 40; i++) s = add(s, 'habit', `Fake ${i}`, 5, 90, 5);
    for (let i = 0; i < 40; i++) s = ok(A.tapHabit(s, taskId(s, `Fake ${i}`), 1));
    expect(s.days[s.today].selfCounted).toBe(300);
    expect(s.xp).toBeCloseTo(300, 5);
  });

  it('stops counting at the 1,400 weekly cap and says so once', () => {
    let s = add(onboarded(), 'habit', 'Epic thing', 5, 90, 5);
    s.profile.talk = 5; // level 2 and its unlock note would otherwise use the 2-message budget
    s.week.selfCounted = 1370;
    s = ok(A.tapHabit(s, taskId(s, 'Epic thing'), 1));
    expect(s.completions[0].counted).toBe(30);
    expect(s.week.selfCounted).toBe(RULES.weekCap);
    s = ok(A.tapHabit(s, taskId(s, 'Epic thing'), 1));
    expect(s.completions[1].counted).toBe(0);
    expect(s.wisp.messages.filter((m) => m.kind === 'cap')).toHaveLength(1);
  });

  it('holds a week of spamming to the weekly cap', () => {
    let s = onboarded();
    for (let i = 0; i < 40; i++) s = add(s, 'habit', `Fake ${i}`, 5, 90, 5);
    for (let d = 0; d < 7; d++) {
      s = rollover(s, day(d));
      for (let i = 0; i < 40; i++) s = ok(A.tapHabit(s, taskId(s, `Fake ${i}`), 1));
    }
    const weekXp = Object.values(s.days).reduce((a, l) => a + l.xp, 0);
    expect(weekXp).toBeLessThanOrEqual(RULES.weekCap * RULES.momentum.max + 0.01);
  });
});

describe('rollover', () => {
  it('settles Momentum, streaks and history day by day', () => {
    let s = add(onboarded(), 'daily', 'Walk', 2, 20, 2);
    const id = taskId(s, 'Walk');
    s = ok(A.completeTask(s, id));
    s = rollover(s, day(1));
    expect(s.momentum).toBeCloseTo(1.025, 4);
    expect(s.tasks[0].streak).toBe(1);
    expect(s.days[s.today].momentumStart).toBeCloseTo(1.025, 4);
    s = rollover(s, day(2)); // day 1 missed
    expect(s.momentum).toBeCloseTo(1.025 + 0.25 * (0.55 - 1.025), 4);
    expect(s.tasks[0].streak).toBe(0);
    expect(s.tasks[0].history?.['2026-10-27']).toBe('missed');
  });

  it('closes several missed days at once', () => {
    let s = add(onboarded(), 'daily', 'Walk', 2, 20, 2);
    s = rollover(s, day(4));
    let M = 1;
    for (let i = 0; i < 4; i++) M = nextMomentum(M, 0, 0);
    expect(s.momentum).toBeCloseTo(M, 3);
  });

  it('does not count rest days or excused rough-day Dailies against Momentum', () => {
    let s = onboarded();
    for (const n of ['A', 'B', 'C', 'D', 'E']) s = add(s, 'daily', n, 2, 20, 2);
    s = ok(A.restToday(s, taskId(s, 'E')));
    s = ok(A.startRoughDay(s)); // keeps A, B, C; D excused; E resting
    for (const n of ['A', 'B', 'C']) s = ok(A.completeTask(s, taskId(s, n)));
    s = rollover(s, day(1));
    const log = s.days['2026-10-26'];
    expect(log).toMatchObject({ scheduled: 3, done: 3, share: 1 });
    expect(s.tasks.find((t) => t.title === 'D')!.history?.['2026-10-26']).toBe('excused');
    expect(s.tasks.find((t) => t.title === 'E')!.history?.['2026-10-26']).toBe('rest');
    expect(s.rough.used).toBe(1);
  });

  it('freezes Momentum on vacation', () => {
    let s = add(onboarded(), 'daily', 'Walk', 2, 20, 2);
    s = ok(A.setVacation(s, '2026-10-30'));
    s = rollover(s, day(3));
    expect(s.momentum).toBe(1);
    expect(s.tasks[0].streak).toBe(0);
    expect(s.tasks[0].history?.['2026-10-27']).toBe('vacation');
  });

  it('resets the weekly cap on Monday and rough days each month', () => {
    let s = onboarded();
    s.week.selfCounted = 900;
    s = rollover(s, day(6)); // Sunday
    expect(s.week.selfCounted).toBe(900);
    s = rollover(s, day(7)); // Monday
    expect(s.week).toEqual({ start: '2026-11-02', selfCounted: 0 });
    expect(s.rough.month).toBe('2026-11');
  });
});

describe('slots and graduation', () => {
  it('refuses a 7th Daily at level 1', () => {
    let s = onboarded();
    for (let i = 0; i < 6; i++) s = add(s, 'daily', `D${i}`, 2, 20, 2);
    const r = A.addTask(s, { type: 'daily', title: 'D7', effort: 2, minutes: 20, dread: 2, stats: ['mind'], days: ALL });
    expect(r.error).toMatch(/slots are full/);
  });

  it('offers graduation after 4 weeks at 95%+, and the Trait frees the slot', () => {
    let s = add(onboarded(), 'daily', 'Walk', 2, 20, 2, ['might']);
    for (let d = 0; d < 29; d++) {
      s = rollover(s, day(d));
      s = ok(A.completeTask(s, taskId(s, 'Walk')));
    }
    s = rollover(s, day(29));
    const offer = s.wisp.messages.find((m) => m.kind === 'graduate');
    expect(offer).toBeTruthy();
    s = ok(A.acceptGraduation(s, taskId(s, 'Walk')));
    expect(s.traits[0]).toMatchObject({ name: 'Iron Will', stat: 'might', bonus: 0.02 });
    expect(s.tasks[0].graduated).toBe(true);
  });
});

describe('wisp', () => {
  it('keeps unprompted messages within the talkativeness budget', () => {
    let s = onboarded();
    s.profile.talk = 3;
    for (let i = 0; i < 5; i++) s = add(s, 'daily', `D${i}`, 2, 20, 2);
    // force several level-ups in one go
    s.xp = xpForLevel(6) - 1;
    s = ok(A.completeTask(s, taskId(s, 'D0')));
    const unprompted = s.wisp.messages.filter((m) => m.day === s.today && !m.prompted);
    expect(unprompted.length).toBeLessThanOrEqual(2);
  });

  it('mutes a kind after three dismissals and says how to undo it', () => {
    let s = onboarded();
    s.profile.talk = 5;
    for (let i = 0; i < 3; i++) {
      s.wisp.messages.push({ id: `x${i}`, kind: 'streak', day: s.today, ts: 0, text: '', actions: [], read: false, dismissed: false, prompted: true });
      s = ok(A.dismissMessage(s, `x${i}`));
    }
    expect(s.wisp.muted).toContain('streak');
    expect(s.wisp.messages.some((m) => m.kind === 'muted')).toBe(true);
  });
});

describe('tester report', () => {
  it('counts days opened and Dailies by week', () => {
    let s = add(onboarded(), 'daily', 'Walk', 2, 20, 2);
    for (let d = 0; d < 14; d++) {
      s = rollover(s, day(d));
      if (d >= 3) s = ok(A.completeTask(s, taskId(s, 'Walk')));
    }
    s = rollover(s, day(14));
    const r = testerReport(s);
    expect(r.daysOpened).toBe(14);
    expect(r.week1).toEqual({ done: 4, scheduled: 7 });
    expect(r.week2).toEqual({ done: 7, scheduled: 7 });
    expect(r.openedOk && r.improvedOk).toBe(true);
  });
});

describe('onboarding suggestions', () => {
  it('suggest one task per stat: 6 Dailies (filling the 6 slots) and 1 habit', async () => {
    const { SUGGESTED } = await import('../src/ui/Onboarding');
    const picks = SUGGESTED.map((id) => LIBRARY.find((l) => l.id === id)!);
    expect(new Set(picks.map((p) => p.stat)).size).toBe(7);
    expect(picks.filter((p) => p.type === 'daily')).toHaveLength(6);
    expect(picks.filter((p) => p.type === 'habit')).toHaveLength(1);
  });
});
