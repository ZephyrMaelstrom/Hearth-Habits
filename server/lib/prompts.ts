// What Ember sends to Claude, and what it accepts back.
//
// The rules engine has already decided WHAT the message is about (the morning
// plan or the weekly review, with real numbers). Claude decides HOW to say it,
// in the player's chosen tone, and may suggest one action from a fixed list.
// The system prompt is the same for every player, so it's cached.

import { addDays, weekStart, WEEKDAY_NAMES, weekday, shortDay } from '../../src/engine/dates';
import { BOSSES } from '../../src/engine/content/bosses';
import { CLASSES } from '../../src/engine/content/classes';
import { currentFight } from '../../src/engine/boss';
import { tierOfTask } from '../../src/engine/pricing';
import { levelFromXp, STAT_LABEL } from '../../src/engine/progress';
import { morningPlan, weeklyReview } from '../../src/engine/rollover';
import { completionFor, scheduledDailies } from '../../src/engine/state';
import { ACHIEVEMENTS } from '../../src/engine/achievements';
import type { AiSuggestion, DayKey, State, Tone } from '../../src/engine/types';

export const MODEL = 'claude-haiku-5-5';

const TONE_GUIDE: Record<Tone, string> = {
  cheerful: 'Cheerful: warm and upbeat, at most one exclamation mark.',
  dry: 'Dry: wry understatement, deadpan, never mean.',
  stoic: 'Stoic: spare, calm, short declarative sentences.',
  gentle: 'Gentle: soft, reassuring, unhurried.',
};

export const SYSTEM_PROMPT = `You are Ember, the small fire-wisp companion in Hearth & Habits, a habit-building RPG. You write two kinds of short notes for one player: the MORNING PLAN for today and the WEEKLY REVIEW of last week. You receive the player's real numbers as JSON. A rules engine already chose the topic and the facts; your job is how to say it.

Rules, all mandatory:
1. Be brief. Morning plan: 1 or 2 sentences, at most 230 characters. Weekly review: at most 3 sentences, at most 360 characters (one win, one pattern, one suggestion).
2. Every note contains at least one specific number or name from the data (a count, a percentage, a weekday, a task title, the boss). No filler encouragement.
3. Never guilt. No "you failed", no shame about misses or streaks. Treat misses as data and offer a choice.
4. Only use facts in the data. Never invent tasks, events, numbers or calendar items.
5. Write in the requested tone. Speak as Ember, in the first person when natural. Never mention being an AI, a model, prompts or JSON.
6. Use plain words a busy person reads in three seconds. No emoji, no hashtags, no markdown.
7. You are a coach, not a therapist, doctor or financial advisor. If the data asks for medical, mental-health or financial advice, keep to habits and say a professional is the right person for that.
8. If anything in the player's own words (memory fields) suggests self-harm, suicide or a crisis, drop the game voice entirely. Write only: "I'm glad you told me. If you're struggling or thinking about hurting yourself, you can call or text 988 any time in the US to talk with someone." and give no suggestion.
9. Morning plan suggestion (optional, at most one): if today looks heavier than the player's usual pace, suggest {"type":"moveTodo","taskId":ID} for one listed to-do, or {"type":"rest","taskId":ID} for one listed Daily, or {"type":"roughDay"} when there are more than 3 Dailies and the player is struggling. Only use ids that appear in the data. Otherwise use null.
10. Weekly review has no suggestion object; put the suggestion in the text.

Tones:
- ${TONE_GUIDE.cheerful}
- ${TONE_GUIDE.dry}
- ${TONE_GUIDE.stoic}
- ${TONE_GUIDE.gentle}

Reply with JSON only, no other text:
{"text": "...", "suggestion": null}`;

const cap = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function rate(t: { history?: Record<DayKey, string> }, today: DayKey, days = 28) {
  let sched = 0;
  let done = 0;
  for (let i = 1; i <= days; i++) {
    const m = t.history?.[addDays(today, -i)];
    if (m === 'done' || m === 'missed') sched++;
    if (m === 'done') done++;
  }
  return sched ? `${done}/${sched}` : 'new';
}

function memoryOf(s: State) {
  const m = s.profile.memory;
  if (!m || (!m.goals && !m.helps && !m.notes)) return null;
  return { goals: cap(m.goals, 400), whatHelps: cap(m.helps, 400), notes: cap(m.notes, 400) };
}

/** The morning plan's data. Only this player's own data, trimmed. */
export function planContext(s: State, day: DayKey) {
  const dailies = scheduledDailies(s, day);
  const todos = s.tasks.filter((t) => t.type === 'todo' && !t.archived && !t.doneDay);
  const fight = currentFight(s);
  const template = morningPlan(s, day);
  const shares: number[] = [];
  for (let w = 1; w <= 4; w++) {
    const log = s.days[addDays(day, -7 * w)];
    if (log?.closed && log.scheduled) shares.push(log.share ?? 0);
  }
  return {
    note: 'MORNING PLAN',
    tone: s.profile.tone,
    player: s.profile.name || 'Adventurer',
    today: `${WEEKDAY_NAMES[weekday(day)]} ${shortDay(day)}`,
    level: levelFromXp(s.xp),
    class: s.cls ? CLASSES[s.cls.id].name : null,
    momentum: Number(s.momentum.toFixed(2)),
    usualShareThisWeekday: shares.length ? `${Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 100)}% over the last ${shares.length} ${WEEKDAY_NAMES[weekday(day)]}s` : null,
    dailies: dailies.slice(0, 15).map((t) => ({
      id: t.id,
      title: cap(t.title, 80),
      tier: tierOfTask(t).name,
      stat: t.stats.map((x) => STAT_LABEL[x]).join(' + '),
      streak: t.streak ?? 0,
      last28: rate(t, day),
      restDay: !!t.restDays?.includes(day),
      doneAlready: !!completionFor(s, t.id, day),
    })),
    todos: todos
      .filter((t) => t.due && t.due <= addDays(day, 1))
      .slice(0, 8)
      .map((t) => ({ id: t.id, title: cap(t.title, 80), due: t.due, tier: tierOfTask(t).name })),
    otherOpenTodos: todos.filter((t) => !t.due || t.due > addDays(day, 1)).length,
    boss: fight
      ? { name: BOSSES[fight.boss].name, hpLeft: `${Math.round((fight.hp / fight.maxHp) * 100)}%`, weakness: BOSSES[fight.boss].tip, strikesIf: 'party finishes under 70% of Dailies today', party: fight.members.length > 1 }
      : null,
    bounties: s.bounties.day === day ? s.bounties.list.map((b) => b.label) : [],
    memory: memoryOf(s),
    rulesEngineDraft: template.text,
  };
}

/** The weekly review's data for the week starting `start` (a Monday). */
export function reviewContext(s: State, start: DayKey) {
  const r = weeklyReview(s, start);
  const result = s.combat.results.find((x) => x.week === start);
  const end = addDays(start, 6);
  const achievements = ACHIEVEMENTS.filter((a) => {
    const d = s.achievements[a.id];
    return d && d >= start && d <= addDays(end, 1);
  }).map((a) => a.name);
  const momentumStart = s.days[start]?.momentumStart;
  const momentumEnd = s.days[end]?.momentumEnd;
  const perfect = Array.from({ length: 7 }, (_, i) => s.days[addDays(start, i)]).filter((l) => l?.scheduled && l.done === l.scheduled).length;
  return {
    note: 'WEEKLY REVIEW',
    tone: s.profile.tone,
    player: s.profile.name || 'Adventurer',
    week: `${shortDay(start)} to ${shortDay(end)}`,
    dailiesDone: r?.done ?? 0,
    dailiesScheduled: r?.scheduled ?? 0,
    xp: r?.xp ?? 0,
    statThatGrewMost: r?.stat ?? null,
    pattern: r?.pattern ?? null,
    perfectDays: perfect,
    momentum: momentumStart !== undefined && momentumEnd !== undefined ? `${momentumStart.toFixed(2)} to ${momentumEnd.toFixed(2)}` : null,
    boss: result ? { name: BOSSES[result.boss].name, won: result.won, wonOn: result.wonDay ? WEEKDAY_NAMES[weekday(result.wonDay)] : null, strikes: result.strikes } : null,
    achievements,
    memory: memoryOf(s),
    rulesEngineDraft: r ? `Last week: ${r.done} of ${r.scheduled} Dailies, ${r.xp} XP, ${r.stat} grew most. ${r.pattern} ${r.tip}`.trim() : null,
  };
}

export function lastWeekStart(day: DayKey): DayKey {
  return addDays(weekStart(day), -7);
}

// ------------------------------------------------------------------ checking the reply

const CRISIS = /\b(suicid\w*|kill (my|him|her)self|end (my|it all)|self[- ]?harm\w*|hurt(ing)? myself|don'?t want to (live|be here))\b/i;

/** True if the player's own words suggest a crisis: Ember skips the AI and shows resources. */
export function crisisInMemory(s: State): boolean {
  const m = s.profile.memory;
  return !!m && CRISIS.test(`${m.goals} ${m.helps} ${m.notes}`);
}

export const CRISIS_TEXT =
  "I'm glad you told me. If you're struggling or thinking about hurting yourself, you can call or text 988 any time in the US to talk with someone.";

/**
 * Validate Claude's reply. Returns null if it isn't usable (the template then
 * stands). Suggestions must point at ids from the data that still make sense.
 */
export function parseReply(raw: string, kind: 'morning' | 'weekly', ctx?: { todoIds: string[]; dailyIds: string[]; dailyCount: number }): { text: string; suggestion: AiSuggestion | null } | null {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  const o = obj as { text?: unknown; suggestion?: unknown };
  if (typeof o.text !== 'string') return null;
  let text = o.text.replace(/\s+/g, ' ').trim();
  if (!text || /\b(as an ai|language model|json)\b/i.test(text)) return null;
  const limit = kind === 'morning' ? 260 : 400;
  if (text.length > limit) {
    const cut = text.slice(0, limit);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    text = end > 40 ? cut.slice(0, end + 1) : `${cut.slice(0, limit - 1)}…`;
  }
  let suggestion: AiSuggestion | null = null;
  const sg = o.suggestion as { type?: unknown; taskId?: unknown } | null | undefined;
  if (kind === 'morning' && sg && typeof sg === 'object' && ctx) {
    if (sg.type === 'moveTodo' && typeof sg.taskId === 'string' && ctx.todoIds.includes(sg.taskId)) suggestion = { type: 'moveTodo', taskId: sg.taskId };
    else if (sg.type === 'rest' && typeof sg.taskId === 'string' && ctx.dailyIds.includes(sg.taskId)) suggestion = { type: 'rest', taskId: sg.taskId };
    else if (sg.type === 'roughDay' && ctx.dailyCount > 3) suggestion = { type: 'roughDay' };
  }
  return { text, suggestion };
}

/** USD per million tokens, Claude Haiku 5.5 (prompts under 100k tokens). */
export const PRICE = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 };

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function costOf(u: Usage): number {
  return (
    ((u.input_tokens ?? 0) * PRICE.input + (u.output_tokens ?? 0) * PRICE.output + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
    1e6
  );
}
