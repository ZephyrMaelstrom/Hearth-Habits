// Phase 3: Ember's AI layer on the player's side, plus first steps.
//
// The split from the design doc holds: the rules engine decides WHEN Ember
// speaks and what about (rollover.ts makes the morning plan and weekly review
// messages from templates); the hourly Ember job asks Claude only HOW to say
// them, and its text replaces the template when it arrives. If AI is off,
// unavailable or late, the template stands.

import { draft, type Result } from './actions';
import { weekStart } from './dates';
import { completionFor } from './state';
import type { AiInbox, AiSuggestion, Memory, Reminders, State, WispAction } from './types';

const MEMORY_MAX = 400;

export function setAiEnabled(state: State, enabled: boolean): Result {
  const s = draft(state);
  s.profile.ai = { enabled, consentDay: enabled ? s.today : (s.profile.ai?.consentDay ?? null) };
  return { state: s, events: [enabled ? 'Ember will write your morning plan and weekly review with AI.' : 'Ember is back to written templates only.'] };
}

export function updateMemory(state: State, patch: Partial<Memory>): Result {
  const s = draft(state);
  const m = { goals: '', helps: '', notes: '', ...s.profile.memory };
  for (const k of ['goals', 'helps', 'notes'] as const) if (patch[k] !== undefined) m[k] = patch[k]!.slice(0, MEMORY_MAX);
  s.profile.memory = m;
  return { state: s };
}

export function wipeMemory(state: State): Result {
  const s = draft(state);
  s.profile.memory = { goals: '', helps: '', notes: '' };
  return { state: s, events: ['Ember’s memory is wiped.'] };
}

const inQuiet = (h: number, r: Reminders) => (r.quietStart <= r.quietEnd ? h >= r.quietStart && h < r.quietEnd : h >= r.quietStart || h < r.quietEnd);

export function quietAt(hour: number, r: Reminders): boolean {
  return inQuiet(hour, r);
}

export function updateReminders(state: State, patch: Partial<Reminders>): Result {
  const r = { ...state.profile.reminders!, ...patch };
  for (const k of ['morningHour', 'eveningHour', 'quietStart', 'quietEnd'] as const) r[k] = Math.min(23, Math.max(0, Math.round(r[k])));
  if (inQuiet(r.morningHour, r)) return { state, error: 'The morning plan time falls in your quiet hours.' };
  if (r.evening && inQuiet(r.eveningHour, r)) return { state, error: 'The evening reminder falls in your quiet hours.' };
  const s = draft(state);
  s.profile.reminders = r;
  markStepIn(s, 'reminders');
  return { state: s };
}

export function setTimeZone(state: State, tz: string): State {
  if (!tz || state.profile.tz === tz) return state;
  const s = structuredClone(state);
  s.profile.tz = tz;
  return s;
}

function suggestionActions(s: State, sug: AiSuggestion | null): { label: string; action: WispAction }[] {
  if (!sug) return [];
  const t = sug.taskId ? s.tasks.find((x) => x.id === sug.taskId && !x.archived) : undefined;
  if (sug.type === 'moveTodo' && t?.type === 'todo' && !t.doneDay) return [{ label: `Move "${t.title}" to tomorrow`, action: { type: 'moveTodo', taskId: t.id } }];
  if (sug.type === 'rest' && t?.type === 'daily' && !completionFor(s, t.id, s.today)) return [{ label: `Rest "${t.title}" today`, action: { type: 'restTask', taskId: t.id } }];
  if (sug.type === 'roughDay' && !s.days[s.today]?.rough) return [{ label: 'Take a rough day', action: { type: 'roughDay' } }];
  return [];
}

/** Take in what the Ember job wrote. Returns the same state when nothing is new. */
export function ingestAi(state: State, doc: Partial<AiInbox> | null | undefined): State {
  if (!doc) return state;
  const m = doc.morning;
  const w = doc.weekly;
  const freshMorning = !!m && m.day === state.today && m.at !== state.ai.morning?.at && typeof m.text === 'string' && m.text.length > 0;
  const freshWeekly = !!w && w.week === weekStart(state.today) && w.at !== state.ai.weekly?.at && typeof w.text === 'string' && w.text.length > 0;
  if (!freshMorning && !freshWeekly) return state;
  const s = structuredClone(state);
  if (freshMorning && m) {
    s.ai.morning = m;
    const msg = [...s.wisp.messages].reverse().find((x) => x.kind === 'morning' && x.day === s.today && !x.dismissed);
    if (msg) {
      msg.text = m.text;
      msg.ai = true;
      const acts = suggestionActions(s, m.suggestion);
      if (acts.length) msg.actions = acts;
    }
  }
  if (freshWeekly && w) {
    s.ai.weekly = w;
    const msg = [...s.wisp.messages].reverse().find((x) => x.kind === 'weekly' && x.day >= w.week && !x.dismissed);
    if (msg) {
      msg.text = w.text;
      msg.ai = true;
    }
  }
  return s;
}

// ------------------------------------------------------------------ first steps

export const FIRST_STEPS: { id: string; label: string }[] = [
  { id: 'task', label: 'Check off a task' },
  { id: 'ember', label: 'Tap Ember, the glowing orb' },
  { id: 'own', label: 'Add a task of your own' },
  { id: 'hero', label: 'Visit your Hero' },
  { id: 'reminders', label: 'Pick your morning plan time (Settings)' },
];
export const STEP_GOLD = 10;
export const STEPS_BONUS = 25;

/** Mark a first step done (pays 10 gold, and 25 more for all five). Mutates s. Returns toast lines. */
export function markStepIn(s: State, id: string): string[] {
  const fs = s.firstSteps;
  if (fs.dismissed || fs.done.includes(id) || !FIRST_STEPS.some((x) => x.id === id) || !s.profile.onboarded) return [];
  fs.done.push(id);
  s.gold += STEP_GOLD;
  const out = [`First step done: +${STEP_GOLD} gold.`];
  if (FIRST_STEPS.every((x) => fs.done.includes(x.id))) {
    s.gold += STEPS_BONUS;
    fs.dismissed = true;
    out.push(`All first steps done! +${STEPS_BONUS} gold. You know your way around.`);
  }
  return out;
}

export function markStep(state: State, id: string): Result {
  if (state.firstSteps.dismissed || state.firstSteps.done.includes(id)) return { state };
  const s = draft(state);
  const events = markStepIn(s, id);
  return { state: s, events };
}

export function dismissSteps(state: State): Result {
  const s = draft(state);
  s.firstSteps.dismissed = true;
  return { state: s };
}
