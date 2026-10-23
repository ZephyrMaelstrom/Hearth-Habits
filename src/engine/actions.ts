// Every change a player can make. Each action takes a State and returns a new one
// (the input is never mutated), so the UI, tests and sync all see the same thing.

import { addDays, daysBetween, weekStart } from './dates';
import { tierOfTask } from './pricing';
import { activeDailies, dailySlots, harmony, levelFromXp, traitBonus, TRAIT_NAMES, STAT_LABEL } from './progress';
import { P2, RULES, UNLOCKS } from './rules';
import { completionFor, habitTaps, liveStreak, round2, scheduledDailies, uid } from './state';
import { itemById, SHOP } from './shop';
import { dismiss as wispDismiss, say, unmute as wispUnmute } from './wisp';
import { UNLOCK_TEXT } from './unlocks';
import { hitFor, profile, surgeFits, xpBuff } from './combat';
import { dropText, removeDrop, rollTaskDrop } from './loot';
import { POTIONS, SPECIES, speciesById } from './content/pets';
import { pick, rng } from './rng';
import { ensureBounties } from './bounties';
import type { Completion, Stat, State, Task, TaskType, Tone, WispKind } from './types';

/** `events` are short lines for the player (loot found, a crit), shown as toasts. */
export type Result = { state: State; error?: string; events?: string[] };

export function draft(state: State): State {
  const s = structuredClone(state);
  s.updatedAt = Date.now();
  return s;
}

// ------------------------------------------------------------------ tasks

export interface TaskDraft {
  type: TaskType;
  title: string;
  effort: number;
  minutes: number;
  dread: number;
  stats: Stat[];
  lifeSkill?: string;
  libraryId?: number;
  days?: number[];
  due?: string | null;
  positive?: boolean;
  negative?: boolean;
}

export function addTask(state: State, d: TaskDraft): Result {
  const title = d.title.trim();
  if (!title) return { state, error: 'Give the task a name.' };
  if (d.type === 'daily') {
    const slots = dailySlots(levelFromXp(state.xp));
    if (activeDailies(state.tasks).length >= slots)
      return { state, error: `All ${slots} Daily slots are full. Graduate, archive or shrink one, or level up for another slot.` };
    if (!d.days?.length) return { state, error: 'Pick at least one day.' };
  }
  const s = draft(state);
  const order = s.tasks.reduce((m, t) => Math.max(m, t.order), 0) + 1;
  const t: Task = {
    id: uid(),
    type: d.type,
    title,
    effort: clamp(d.effort, 1, 5),
    minutes: Math.max(1, Math.round(d.minutes)),
    dread: clamp(d.dread, 1, 5),
    stats: d.stats.length ? d.stats.slice(0, 2) : ['spirit'],
    lifeSkill: d.lifeSkill,
    libraryId: d.libraryId,
    createdDay: s.today,
    createdAt: Date.now(),
    order,
  };
  if (d.type === 'daily') Object.assign(t, { days: [...(d.days ?? [])].sort(), restDays: [], streak: 0, bestStreak: 0, history: {} });
  if (d.type === 'habit') Object.assign(t, { positive: d.positive ?? true, negative: d.negative ?? false });
  if (d.type === 'todo') Object.assign(t, { due: d.due ?? null, doneDay: null });
  s.tasks.push(t);
  return { state: s };
}

export function updateTask(state: State, id: string, patch: Partial<TaskDraft>): Result {
  const s = draft(state);
  const t = s.tasks.find((x) => x.id === id);
  if (!t) return { state, error: 'Task not found.' };
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { state, error: 'Give the task a name.' };
    t.title = patch.title.trim();
  }
  if (patch.effort !== undefined) t.effort = clamp(patch.effort, 1, 5);
  if (patch.minutes !== undefined) t.minutes = Math.max(1, Math.round(patch.minutes));
  if (patch.dread !== undefined) t.dread = clamp(patch.dread, 1, 5);
  if (patch.stats?.length) t.stats = patch.stats.slice(0, 2);
  if (patch.days && t.type === 'daily') {
    if (!patch.days.length) return { state, error: 'Pick at least one day.' };
    t.days = [...patch.days].sort();
  }
  if (patch.due !== undefined && t.type === 'todo') t.due = patch.due;
  if (patch.positive !== undefined) t.positive = patch.positive;
  if (patch.negative !== undefined) t.negative = patch.negative;
  return { state: s };
}

export function archiveTask(state: State, id: string): Result {
  const s = draft(state);
  const t = s.tasks.find((x) => x.id === id);
  if (t) t.archived = true;
  return { state: s };
}

export function restoreTask(state: State, id: string): Result {
  const t = state.tasks.find((x) => x.id === id);
  if (t?.type === 'daily' && activeDailies(state.tasks).length >= dailySlots(levelFromXp(state.xp)))
    return { state, error: 'No free Daily slot to restore it into.' };
  const s = draft(state);
  const tt = s.tasks.find((x) => x.id === id);
  if (tt) tt.archived = false;
  return { state: s };
}

export function moveTask(state: State, id: string, dir: -1 | 1): Result {
  const s = draft(state);
  const t = s.tasks.find((x) => x.id === id);
  if (!t) return { state };
  const peers = s.tasks.filter((x) => x.type === t.type && !x.archived).sort((a, b) => a.order - b.order);
  const i = peers.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= peers.length) return { state };
  [peers[i].order, peers[j].order] = [peers[j].order, peers[i].order];
  return { state: s };
}

/** Mark a Daily as a planned rest day today (doesn't count against Momentum). */
export function restToday(state: State, id: string): Result {
  const s = draft(state);
  const t = s.tasks.find((x) => x.id === id);
  if (!t || t.type !== 'daily') return { state };
  if (completionFor(s, id, s.today)) return { state, error: 'Already done today.' };
  t.restDays = t.restDays?.includes(s.today) ? t.restDays.filter((d) => d !== s.today) : [...(t.restDays ?? []), s.today];
  return { state: s };
}

// ------------------------------------------------------------------ rewards for finishing

export interface AwardOpts {
  source?: 'task' | 'vault' | 'vaultBonus';
}

export function award(s: State, t: Task, kind: 'complete' | 'habitPlus', opts: AwardOpts = {}): Completion {
  const day = s.today;
  const log = s.days[day];
  const tier = tierOfTask(t);
  let base = tier.xp;
  let goldBase = tier.gold;
  if (kind === 'habitPlus' && habitTaps(s, t.id, day, 'habitPlus') >= RULES.habitTapsPaid) {
    base = 0;
    goldBase = 0;
  }
  if (t.type === 'todo' && t.createdDay === day) {
    base *= RULES.sameDayTodo;
    goldBase *= RULES.sameDayTodo;
  }
  const now = Date.now();
  const p = profile(s);
  const spark = !log.sparkUsed;
  const self = base + (spark ? RULES.spark : 0);
  const ceilingLeft = Math.max(0, RULES.dayCeiling - log.selfCounted);
  const weekLeft = Math.max(0, RULES.weekCap - s.week.selfCounted);
  const counted = Math.min(self, ceilingLeft, weekLeft);
  const mult = round2(log.momentumStart * (1 + harmony(s).bonus) * (1 + traitBonus(s, t.stats)) * (1 + xpBuff(s, now)));
  const xp = round2(counted * mult);
  const gold = self > 0 ? Math.round(goldBase * (counted / self) * log.momentumStart * (1 + p.gold)) : 0;
  const n = s.completions.filter((c) => c.taskId === t.id && c.day === day && c.kind === kind).length;
  const seed = `${t.id}|${day}|${kind}|${n}`;
  const c: Completion = {
    id: uid(),
    taskId: t.id,
    kind,
    day,
    ts: now,
    tier: tier.name,
    base,
    spark,
    counted,
    mult,
    xp,
    gold,
    stats: [...t.stats],
  };
  if (opts.source && opts.source !== 'task') c.source = opts.source;
  const level = levelFromXp(s.xp);
  log.selfCounted += counted;
  s.week.selfCounted += counted;
  log.xp = round2(log.xp + xp);
  log.gold += gold;
  if (spark) log.sparkUsed = true;
  s.xp = round2(s.xp + xp);
  s.gold += gold;
  for (const st of t.stats) s.statXp[st] = round2((s.statXp[st] ?? 0) + xp / t.stats.length);

  // ---- Phase 2: boss damage, loot, pet growth, Mana, rescues
  const hitBase = self > 0 ? counted * (base / self) : 0;
  let surge = false;
  if (s.combat.surgeArmed && hitBase > 0 && surgeFits(tier.name, p.effects)) {
    surge = true;
    s.combat.surgeArmed = false;
  }
  const h = hitFor(p, { stats: t.stats, hitBase, ts: now, seed, surge });
  if (h.dmg > 0) {
    c.hit = h.dmg;
    if (h.crit) c.crit = true;
    if (surge) c.surge = true;
  }
  if (t.type === 'todo' && t.due && daysBetween(t.due, day) >= P2.boss.procrastOldDays) c.old = true;
  if (level >= 3 && counted > 0) {
    const d = rollTaskDrop(s, seed, tier.name);
    if (d) c.drop = d;
  }
  const pet = s.pets.find((x) => x.id === s.activePet);
  if (pet && hitBase > 0 && t.stats.includes(speciesById(pet.species).stat)) {
    const g = Math.round(hitBase);
    pet.xp += g;
    c.petId = pet.id;
    c.petXp = g;
  }
  if (s.cls && p.effects.leyTap && hitBase > 0 && (tier.name === 'Hard' || tier.name === 'Epic')) {
    const g = Math.max(0, Math.min(p.maxMana - s.mana, p.effects.leyTap));
    if (g > 0) {
      s.mana += g;
      c.manaGain = g;
    }
  }
  if (s.social.pendingRescue && counted > 0) {
    s.social.rescues.push({ id: uid(), to: s.social.pendingRescue, at: now });
    c.rescueTo = s.social.pendingRescue;
    s.social.pendingRescue = null;
    s.counters.rescuesGiven += 1;
  }
  s.completions.push(c);
  return c;
}

const SYNTH: Record<'Medium' | 'Hard', { effort: number; minutes: number; dread: number }> = {
  Medium: { effort: 3, minutes: 20, dread: 3 },
  Hard: { effort: 4, minutes: 45, dread: 4 },
};

/** Pay a Vault entry or bonus as if it were a Fortune task of that tier (inside every cap). */
export function awardSynthetic(s: State, o: { id: string; title: string; tier: 'Medium' | 'Hard'; source: 'vault' | 'vaultBonus' }): Completion {
  const t: Task = { id: o.id, type: 'habit', title: o.title, ...SYNTH[o.tier], stats: ['fortune'], createdDay: s.today, createdAt: 0, order: 0 };
  return award(s, t, 'complete', { source: o.source });
}

/** Toast lines for a completion: loot, crits, surges, rescues. */
export function completionEvents(s: State, c: Completion): string[] {
  const out: string[] = [];
  if (c.surge) out.push(`Arcane Surge! ${c.hit} damage.`);
  else if (c.crit) out.push(`Critical hit! ${c.hit} damage.`);
  if (c.drop) out.push(`Loot: ${dropText(s, c.drop)}.`);
  if (c.rescueTo) out.push('Rescue sent. Their lantern burns brighter.');
  return out;
}

export function afterGain(s: State, before: { level: number; weekCounted: number }) {
  const level = levelFromXp(s.xp);
  if (level > before.level) {
    for (let L = before.level + 1; L <= level; L++) {
      const unlocks = UNLOCKS.filter((u) => u.level === L);
      say(
        s,
        'levelup',
        { level: L, unlock: unlocks.length ? `${unlocks.map((u) => u.label).join(' and ')} unlocked.` : nextSlotNote(L) },
        [],
        { key: `level:${L}` },
      );
      for (const unlock of unlocks) {
        if (s.wisp.seenUnlocks.includes(unlock.id)) continue;
        s.wisp.seenUnlocks.push(unlock.id);
        onUnlock(s, unlock.id);
        const u = UNLOCK_TEXT[unlock.id];
        if (u) say(s, 'unlock', { id: unlock.id, label: u.label, detail: u.detail }, u.actions, { key: `unlock:${unlock.id}` });
      }
    }
    s.lastLevel = level;
  }
  if (before.weekCounted < RULES.weekCap && s.week.selfCounted >= RULES.weekCap) {
    say(s, 'cap', { cap: RULES.weekCap.toLocaleString('en-US') }, [], { key: `cap:${s.week.start}` });
  }
}

/** One-time effects when a system opens. Mutates s. */
export function onUnlock(s: State, id: string) {
  if (id === 'boss' && !s.combat.startDay) s.combat.startDay = s.today;
  if (id === 'bounties') ensureBounties(s, s.today);
  if (id === 'pets' && !s.pets.length) {
    // a starter egg and potion, so the first pet doesn't wait on luck
    const r = rng(`${s.profile.deviceId}|starter`);
    const sp = pick(r, SPECIES).id;
    const po = pick(r, POTIONS).id;
    s.bag.eggs[sp] = (s.bag.eggs[sp] ?? 0) + 1;
    s.bag.potions[po] = (s.bag.potions[po] ?? 0) + 1;
  }
}

function nextSlotNote(level: number): string {
  if (level % RULES.slots.perLevels === 0 && dailySlots(level) > dailySlots(level - 1))
    return `A new Daily slot opened (${dailySlots(level)} now).`;
  return '';
}

export function snapshot(s: State) {
  return { level: levelFromXp(s.xp), weekCounted: s.week.selfCounted };
}

export function completeTask(state: State, id: string): Result {
  const t0 = state.tasks.find((x) => x.id === id);
  if (!t0 || t0.archived) return { state, error: 'Task not found.' };
  if (t0.type === 'habit') return tapHabit(state, id, 1);
  if (t0.type === 'daily' && completionFor(state, id, state.today)) return { state };
  if (t0.type === 'todo' && t0.doneDay) return { state };
  const s = draft(state);
  const t = s.tasks.find((x) => x.id === id)!;
  const before = snapshot(s);
  const c = award(s, t, 'complete');
  if (t.type === 'todo') t.doneDay = s.today;
  if (t.type === 'daily') {
    if (t.restDays?.includes(s.today)) t.restDays = t.restDays.filter((d) => d !== s.today);
    const streak = liveStreak(s, t);
    if ([7, 30, 100, 365].includes(streak)) say(s, 'streak', { days: streak, task: t.title }, [], { key: `streak:${t.id}:${streak}` });
  }
  afterGain(s, before);
  return { state: s, events: completionEvents(s, c) };
}

export function tapHabit(state: State, id: string, sign: 1 | -1): Result {
  const t0 = state.tasks.find((x) => x.id === id);
  if (!t0 || t0.type !== 'habit') return { state, error: 'Habit not found.' };
  const s = draft(state);
  const t = s.tasks.find((x) => x.id === id)!;
  if (sign === 1) {
    const before = snapshot(s);
    const c = award(s, t, 'habitPlus');
    afterGain(s, before);
    return { state: s, events: completionEvents(s, c) };
  } else {
    s.completions.push({
      id: uid(),
      taskId: t.id,
      kind: 'habitMinus',
      day: s.today,
      ts: Date.now(),
      tier: tierOfTask(t).name,
      base: 0,
      spark: false,
      counted: 0,
      mult: 0,
      xp: 0,
      gold: 0,
      stats: [...t.stats],
    });
  }
  return { state: s };
}

/** Undo a completion from today. Earlier days are settled and can't be changed. */
export function undoCompletion(state: State, completionId: string): Result {
  const c0 = state.completions.find((c) => c.id === completionId);
  if (!c0) return { state };
  if (c0.day !== state.today) return { state, error: 'Only today can be undone.' };
  const s = draft(state);
  const c = s.completions.find((x) => x.id === completionId)!;
  s.completions = s.completions.filter((x) => x.id !== completionId);
  const log = s.days[c.day];
  s.xp = round2(Math.max(0, s.xp - c.xp));
  s.gold = Math.max(0, s.gold - c.gold);
  for (const st of c.stats) s.statXp[st] = round2(Math.max(0, (s.statXp[st] ?? 0) - c.xp / c.stats.length));
  if (log) {
    log.selfCounted = Math.max(0, log.selfCounted - c.counted);
    log.xp = round2(Math.max(0, log.xp - c.xp));
    log.gold = Math.max(0, log.gold - c.gold);
    if (c.spark) log.sparkUsed = false;
  }
  if (weekStart(c.day) === s.week.start) s.week.selfCounted = Math.max(0, s.week.selfCounted - c.counted);
  const t = s.tasks.find((x) => x.id === c.taskId);
  if (t?.type === 'todo') t.doneDay = null;
  // Phase 2: take back loot, pet growth, Mana, a spent Surge and a sent Rescue
  if (c.drop) removeDrop(s, c.drop);
  if (c.petId && c.petXp) {
    const pet = s.pets.find((x) => x.id === c.petId);
    if (pet) pet.xp = Math.max(0, pet.xp - c.petXp);
  }
  if (c.manaGain) s.mana = Math.max(0, s.mana - c.manaGain);
  if (c.surge) s.combat.surgeArmed = true;
  if (c.rescueTo) {
    s.social.rescues = s.social.rescues.filter((r) => !(r.to === c.rescueTo && r.at === c.ts));
    s.social.pendingRescue = c.rescueTo;
    s.counters.rescuesGiven = Math.max(0, s.counters.rescuesGiven - 1);
  }
  s.lastLevel = levelFromXp(s.xp);
  return { state: s };
}

export function uncompleteTask(state: State, id: string): Result {
  const c = completionFor(state, id, state.today);
  if (!c) return { state };
  return undoCompletion(state, c.id);
}

export function undoLastHabit(state: State, id: string, kind: 'habitPlus' | 'habitMinus'): Result {
  const list = state.completions.filter((c) => c.taskId === id && c.day === state.today && c.kind === kind);
  const last = list[list.length - 1];
  return last ? undoCompletion(state, last.id) : { state };
}

// ------------------------------------------------------------------ hard days

export function startRoughDay(state: State): Result {
  const log = state.days[state.today];
  if (log?.rough) return { state, error: 'Rough-day mode is already on today.' };
  if (state.rough.used >= RULES.rough.perMonth) return { state, error: `All ${RULES.rough.perMonth} rough days this month are used.` };
  const s = draft(state);
  const keep = scheduledDailies(s, s.today)
    .filter((t) => !t.restDays?.includes(s.today))
    .slice(0, RULES.rough.keep)
    .map((t) => t.id);
  s.days[s.today].rough = { keep };
  s.rough.used += 1;
  return { state: s };
}

export function endRoughDay(state: State): Result {
  if (!state.days[state.today]?.rough) return { state };
  const s = draft(state);
  delete s.days[s.today].rough;
  s.rough.used = Math.max(0, s.rough.used - 1);
  return { state: s };
}

export function setVacation(state: State, until: string | null): Result {
  if (until && until < state.today) return { state, error: 'Pick a day from today on.' };
  if (until && until > addDays(state.today, RULES.vacationMaxDays - 1))
    return { state, error: `Vacation mode lasts up to ${RULES.vacationMaxDays} days at a time.` };
  const s = draft(state);
  s.vacationUntil = until;
  return { state: s };
}

export function moveTodoToTomorrow(state: State, id: string): Result {
  return updateTask(state, id, { due: addDays(state.today, 1) });
}

// ------------------------------------------------------------------ graduation

export function acceptGraduation(state: State, id: string): Result {
  if (state.traits.length >= RULES.graduation.maxTraits) return { state, error: 'All 5 Trait slots are full.' };
  const s = draft(state);
  const t = s.tasks.find((x) => x.id === id);
  if (!t || t.type !== 'daily' || t.graduated) return { state };
  t.graduated = true;
  const stat = t.stats[0];
  s.traits.push({ id: uid(), name: TRAIT_NAMES[stat], stat, bonus: RULES.graduation.bonus, fromTask: t.title, day: s.today });
  return { state: s };
}

// ------------------------------------------------------------------ gold

export function addReward(state: State, title: string, price: number): Result {
  if (!title.trim()) return { state, error: 'Name the reward.' };
  if (!(price > 0)) return { state, error: 'Set a price above 0.' };
  const s = draft(state);
  s.rewards.push({ id: uid(), title: title.trim(), price: Math.round(price), claimed: 0, createdAt: Date.now() });
  return { state: s };
}

export function claimReward(state: State, id: string): Result {
  const r = state.rewards.find((x) => x.id === id);
  if (!r) return { state };
  if (state.gold < r.price) return { state, error: `You need ${r.price - state.gold} more gold.` };
  const s = draft(state);
  s.gold -= r.price;
  s.rewards.find((x) => x.id === id)!.claimed += 1;
  return { state: s };
}

export function deleteReward(state: State, id: string): Result {
  const s = draft(state);
  s.rewards = s.rewards.filter((r) => r.id !== id);
  return { state: s };
}

/** Average gold per day over the last 7 closed days, used to suggest reward prices. */
export function goldPerDay(state: State): number {
  let total = 0;
  let n = 0;
  for (let i = 1; i <= 7; i++) {
    const log = state.days[addDays(state.today, -i)];
    if (log) {
      total += log.gold;
      n++;
    }
  }
  return n >= 3 && total > 0 ? total / n : 60; // a typical day earns about 60 gold
}

export function buyItem(state: State, id: string): Result {
  const item = itemById(id);
  if (!item) return { state };
  if (state.owned.includes(id)) return equipItem(state, id);
  if (state.gold < item.price) return { state, error: `You need ${item.price - state.gold} more gold.` };
  const s = draft(state);
  s.gold -= item.price;
  s.owned.push(id);
  s.equipped[item.slot] = id;
  return { state: s };
}

export function equipItem(state: State, id: string): Result {
  const item = SHOP.find((i) => i.id === id);
  if (!item || !state.owned.includes(id)) return { state };
  const s = draft(state);
  s.equipped[item.slot] = id;
  return { state: s };
}

// ------------------------------------------------------------------ profile and wisp

export function finishOnboarding(state: State, name: string, tone: Tone, picks: TaskDraft[]): Result {
  let s = draft(state);
  s.profile.name = name.trim() || 'Adventurer';
  s.profile.tone = tone;
  s.profile.onboarded = true;
  for (const p of picks) {
    const r = addTask(s, p);
    if (!r.error) s = r.state;
  }
  say(
    s,
    'welcome',
    { name: s.profile.name },
    [],
    { prompted: true, key: 'welcome' },
  );
  return { state: s };
}

export function updateProfile(state: State, patch: Partial<State['profile']>): Result {
  const s = draft(state);
  s.profile = { ...s.profile, ...patch, talk: clamp(patch.talk ?? s.profile.talk, 1, 5) };
  return { state: s };
}

export function dismissMessage(state: State, id: string, rejected = true): Result {
  const s = draft(state);
  wispDismiss(s, id, rejected);
  return { state: s };
}

export function markMessagesRead(state: State): Result {
  if (!state.wisp.messages.some((m) => !m.read)) return { state };
  const s = draft(state);
  for (const m of s.wisp.messages) m.read = true;
  return { state: s };
}

export function unmuteKind(state: State, kind: WispKind): Result {
  const s = draft(state);
  wispUnmute(s, kind);
  return { state: s };
}

export function statLabel(st: Stat) {
  return STAT_LABEL[st];
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
