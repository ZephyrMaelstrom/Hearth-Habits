import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as A from '../src/engine/actions';
import * as C from '../src/engine/companion';
import { memberBossHp } from '../src/engine/content/bosses';
import { LIBRARY } from '../src/engine/library';
import { rollover } from '../src/engine/rollover';
import { migrate, newState } from '../src/engine/state';
import { setTuning, tuning } from '../src/engine/tuning';
import { xpForLevel } from '../src/engine/progress';
import type { State } from '../src/engine/types';
import { localTime } from '../server/lib/time';
import { dueFor, eveningText, inQuiet } from '../server/lib/schedule';
import { costOf, crisisInMemory, CRISIS_TEXT, parseReply, planContext, reviewContext, SYSTEM_PROMPT } from '../server/lib/prompts';
import { gate3, gate3Markdown } from '../server/lib/metrics';
import { suggestionsFor, SUGGESTED } from '../src/ui/Onboarding';
import { at, MON, setupPlayer } from './sim';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MON());
});
afterEach(() => {
  vi.useRealTimers();
  setTuning(null);
});

const ok = (r: A.Result): State => {
  expect(r.error).toBeUndefined();
  return r.state;
};

function player(): State {
  const s = setupPlayer({ plan: 'typical', level: 6 });
  s.profile.tz = 'America/Chicago';
  s.profile.ai = { enabled: true, consentDay: s.today };
  s.profile.reminders = { morningHour: 8, evening: true, eveningHour: 20, quietStart: 22, quietEnd: 7, push: true };
  return s;
}

const local = (day: string, hour: number, weekday: number) => ({ day, hour, weekday, wall: new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`) });
const avail = { aiAvailable: true, pushAvailable: true, hasDevice: true };

describe('local time', () => {
  it("reads the player's wall clock from their time zone, across a DST change", () => {
    const a = localTime(new Date('2026-11-03T14:30:00Z'), 'America/Chicago');
    expect(a).toMatchObject({ day: '2026-11-03', hour: 8, weekday: 2 });
    const dst = localTime(new Date('2026-11-01T12:00:00Z'), 'America/Chicago'); // clocks fell back at 2 a.m.
    expect(dst.hour).toBe(6);
    expect(localTime(new Date('2026-11-03T14:30:00Z'), 'Not/AZone').day).toBe('2026-11-03'); // falls back to Chicago
  });
});

describe('what the hourly job owes a player', () => {
  it('writes the morning plan once, in a 3-hour window from the chosen time', () => {
    const s = player();
    expect(dueFor(s, local(s.today, 7, 1), {}, avail).morningAi).toBe(false);
    expect(dueFor(s, local(s.today, 8, 1), {}, avail)).toMatchObject({ morningAi: true, morningPush: true });
    expect(dueFor(s, local(s.today, 10, 1), {}, avail).morningAi).toBe(true); // a late run still catches it
    expect(dueFor(s, local(s.today, 11, 1), {}, avail).morningAi).toBe(false);
    expect(dueFor(s, local(s.today, 9, 1), { morning: { day: s.today }, lastMorningPush: s.today }, avail)).toMatchObject({ morningAi: false, morningPush: false });
  });

  it('respects opt-ins, quiet hours and players who are away', () => {
    const s = player();
    s.profile.ai = { enabled: false, consentDay: null };
    expect(dueFor(s, local(s.today, 8, 1), {}, avail).morningAi).toBe(false);
    const q = player();
    q.profile.reminders = { ...q.profile.reminders!, morningHour: 6, quietStart: 22, quietEnd: 7 };
    expect(inQuiet(6, q.profile.reminders!)).toBe(true);
    expect(dueFor(q, local(q.today, 6, 1), {}, avail).morningPush).toBe(false);
    const away = player();
    const later = '2026-11-02';
    expect(dueFor(away, local(later, 8, 1), {}, avail).morningAi).toBe(false); // 7 days idle: no AI
    expect(dueFor(away, local(later, 8, 1), {}, avail).morningPush).toBe(true); // a gentle push is still fine
    expect(dueFor(away, local('2026-11-12', 8, 4), {}, avail).morningPush).toBe(false); // 17 days: Ember stops
  });

  it('writes the weekly review once a week from Monday morning, and the evening reminder only with Dailies open', () => {
    const s = player();
    expect(dueFor(s, local(s.today, 7, 1), {}, avail).weeklyAi).toBe(false);
    expect(dueFor(s, local(s.today, 8, 1), {}, avail).weeklyAi).toBe(true);
    expect(dueFor(s, local(s.today, 8, 1), { weekly: { week: s.today } }, avail).weeklyAi).toBe(false);
    expect(dueFor(s, local(s.today, 20, 1), {}, avail).eveningPush).toBe(true);
    expect(eveningText(s, s.today)).toMatch(/^6 Dailies left today\./);
    let done = s;
    for (const t of s.tasks.filter((x) => x.type === 'daily')) done = A.completeTask(done, t.id).state;
    expect(dueFor(done, local(s.today, 20, 1), {}, avail).eveningPush).toBe(false);
  });
});

describe('talking to Claude', () => {
  it("sends only this player's own data, trimmed, with the rules engine's draft", () => {
    const s = player();
    s.profile.memory = { goals: 'x'.repeat(900), helps: 'Mornings', notes: '' };
    const ctx = planContext(s, s.today);
    expect(ctx.dailies.map((d) => d.id)).toEqual(s.tasks.filter((t) => t.type === 'daily').map((t) => t.id));
    expect(ctx.memory!.goals.length).toBeLessThanOrEqual(400);
    expect(ctx.rulesEngineDraft).toMatch(/Dailies/);
    expect(JSON.stringify(ctx)).not.toMatch(/deviceId|email/);
    expect(SYSTEM_PROMPT).toMatch(/988/);
    const r = reviewContext(s, '2026-10-19');
    expect(r.note).toBe('WEEKLY REVIEW');
  });

  it('accepts a good reply and rejects or repairs bad ones', () => {
    const ids = { todoIds: ['t1'], dailyIds: ['d1'], dailyCount: 5 };
    expect(parseReply('{"text":"Tuesday: 6 Dailies. You usually finish 5.","suggestion":{"type":"moveTodo","taskId":"t1"}}', 'morning', ids)).toEqual({
      text: 'Tuesday: 6 Dailies. You usually finish 5.',
      suggestion: { type: 'moveTodo', taskId: 't1' },
    });
    expect(parseReply('```json\n{"text":"Hi.","suggestion":{"type":"rest","taskId":"nope"}}\n```', 'morning', ids)?.suggestion).toBeNull();
    expect(parseReply('not json at all', 'morning', ids)).toBeNull();
    expect(parseReply('{"text":"As an AI language model, here is your plan."}', 'morning', ids)).toBeNull();
    const long = parseReply(JSON.stringify({ text: `${'A long sentence about your day. '.repeat(20)}` }), 'morning', ids)!;
    expect(long.text.length).toBeLessThanOrEqual(260);
  });

  it('skips the AI and shows crisis resources if the player wrote about self-harm', () => {
    const s = player();
    s.profile.memory = { goals: '', helps: '', notes: 'some days I want to hurt myself' };
    expect(crisisInMemory(s)).toBe(true);
    expect(CRISIS_TEXT).toMatch(/988/);
    s.profile.memory = { goals: 'Run a 5K', helps: 'kill the backlog early', notes: '' };
    expect(crisisInMemory(s)).toBe(false);
  });

  it('prices a call at Claude Haiku 5.5 rates', () => {
    expect(costOf({ input_tokens: 1_000_000 })).toBeCloseTo(0.1, 6);
    expect(costOf({ output_tokens: 1_000_000 })).toBeCloseTo(0.5, 6);
    expect(costOf({ cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(0.135, 6);
  });
});

describe("Ember's notes in the app", () => {
  it("replaces today's template morning plan with the AI text, and turns its suggestion into a button", () => {
    let s = player();
    vi.setSystemTime(at(1, 8));
    s = rollover(s, at(1, 8));
    const todo = ok(A.addTask(s, { type: 'todo', title: 'Call the bank', effort: 2, minutes: 10, dread: 3, stats: ['fortune'], due: s.today }));
    const tid = todo.tasks.at(-1)!.id;
    const out = C.ingestAi(todo, { morning: { day: todo.today, text: 'Tuesday looks full. Push the bank call?', suggestion: { type: 'moveTodo', taskId: tid }, at: 1 } });
    const msg = out.wisp.messages.find((m) => m.kind === 'morning' && m.day === out.today)!;
    expect(msg.text).toBe('Tuesday looks full. Push the bank call?');
    expect(msg.ai).toBe(true);
    expect(msg.actions[0].action).toEqual({ type: 'moveTodo', taskId: tid });
    expect(C.ingestAi(out, { morning: { day: out.today, text: 'x', suggestion: null, at: 1 } })).toBe(out); // already have it
    expect(C.ingestAi(out, { morning: { day: '2020-01-01', text: 'old', suggestion: null, at: 2 } })).toBe(out); // stale
  });

  it('keeps reminder times out of quiet hours', () => {
    const s = player();
    expect(C.updateReminders(s, { morningHour: 5, quietStart: 22, quietEnd: 7 }).error).toMatch(/quiet/);
    expect(ok(C.updateReminders(s, { morningHour: 7 })).profile.reminders!.morningHour).toBe(7);
  });

  it('pays first steps (10 gold each, 25 more for all five) and skips them for Phase 2 saves past level 3', () => {
    let s = A.finishOnboarding(newState(MON()), 'New', 'gentle', []).state;
    const gold = s.gold;
    for (const id of ['task', 'ember', 'own', 'hero']) s = C.markStep(s, id).state;
    expect(s.gold).toBe(gold + 40);
    const last = C.markStep(s, 'reminders');
    expect(last.state.gold).toBe(gold + 50 + C.STEPS_BONUS);
    expect(last.state.firstSteps.dismissed).toBe(true);
    const v2 = { ...newState(MON()), xp: xpForLevel(5) } as Partial<State>;
    delete v2.firstSteps;
    expect(migrate(v2, MON()).firstSteps.dismissed).toBe(true);
  });
});

describe('onboarding and tuning', () => {
  it('leans starter picks toward chosen life areas and still fits 6 Daily slots', () => {
    const picks = suggestionsFor(['might', 'spirit']);
    const lib = picks.map((id) => LIBRARY.find((l) => l.id === id)!);
    expect(lib.filter((l) => l.type === 'daily').length).toBeLessThanOrEqual(6);
    expect(lib.filter((l) => l.stat === 'might').length).toBe(2);
    expect(lib.filter((l) => l.stat === 'spirit').length).toBe(2);
    expect(suggestionsFor([])).toEqual(SUGGESTED);
  });

  it('applies remote tuning within 0.5x to 2x', () => {
    const hp = memberBossHp(10);
    setTuning({ bossHp: 1.2, dropRate: 9 });
    expect(tuning()).toEqual({ bossHp: 1.2, dropRate: 2 });
    expect(memberBossHp(10)).toBe(Math.round((hp / 1) * 1.2));
    setTuning({ bossHp: 'lots' });
    expect(tuning().bossHp).toBe(1);
  });
});

describe('Gate 3 numbers', () => {
  it('computes day-7 and day-30 retention, the Daily share and AI cost per active player', () => {
    const mk = (created: string, openedDays: string[], done = 4, sched = 5) => {
      const s = newState(new Date(`${created}T09:00:00`));
      s.profile.onboarded = true;
      s.profile.createdDay = created;
      s.days = {};
      for (const d of openedDays) s.days[d] = { day: d, opened: true, momentumStart: 1, selfCounted: 0, xp: 0, gold: 0, sparkUsed: false, closed: true, done, scheduled: sched };
      return s;
    };
    const today = '2026-12-31';
    const kept = mk('2026-11-01', ['2026-11-01', '2026-11-09', '2026-12-02', '2026-12-25', '2026-12-30']);
    const lost = mk('2026-11-01', ['2026-11-01', '2026-11-02']);
    const fresh = mk('2026-12-28', ['2026-12-28', '2026-12-30']);
    const g = gate3([kept, lost, fresh], today, { month: '2026-12', costUsd: 0.12, calls: 40 });
    expect(g.d7).toEqual({ eligible: 2, retained: 1, rate: 0.5 });
    expect(g.d30).toEqual({ eligible: 2, retained: 1, rate: 0.5 });
    expect(g.active7).toBe(2);
    expect(g.ai.perActive).toBeCloseTo(0.06, 5);
    expect(g.pass).toEqual({ d7: true, d30: true, dailies: true, ai: true });
    expect(gate3Markdown(g, 'main app')).toMatch(/Day-7 retention \| 30% \| 50%/);
  });
});
