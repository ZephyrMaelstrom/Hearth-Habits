// Simple Epics: a months-long goal split into 3 to 10 milestone chapters, with a
// live "at this pace" projection. Each milestone pays a chest (one chest a day;
// extras arrive on following days). Finishing grants a trophy, plus a Rare item
// of your choice when the Epic ran at least 3 weeks.

import { addDays, daysBetween, shortDay } from './dates';
import { draft, type Result } from './actions';
import { chestText, dropText, grantRare, openChest } from './loot';
import { P2 } from './rules';
import { uid } from './state';
import type { DayKey, Epic, ItemSlot, State } from './types';

export function addEpic(state: State, o: { title: string; deadline: DayKey; milestones: string[]; linked: string[] }): Result {
  const ms = o.milestones.map((m) => m.trim()).filter(Boolean);
  if (!o.title.trim()) return { state, error: 'Name the goal.' };
  if (!o.deadline || o.deadline <= state.today) return { state, error: 'Pick a deadline after today.' };
  if (ms.length < P2.epics.minMilestones || ms.length > P2.epics.maxMilestones)
    return { state, error: `Split it into ${P2.epics.minMilestones} to ${P2.epics.maxMilestones} milestones.` };
  const s = draft(state);
  s.epics.push({
    id: uid(),
    title: o.title.trim(),
    deadline: o.deadline,
    createdDay: s.today,
    milestones: ms.map((title) => ({ id: uid(), title, doneDay: null })),
    linked: o.linked,
    doneDay: null,
    rewarded: false,
  });
  return { state: s };
}

export function toggleMilestone(state: State, epicId: string, msId: string): Result {
  const e0 = state.epics.find((e) => e.id === epicId);
  const m0 = e0?.milestones.find((m) => m.id === msId);
  if (!e0 || !m0) return { state };
  if (m0.doneDay && m0.doneDay !== state.today) return { state, error: 'Milestones from earlier days stay checked.' };
  const s = draft(state);
  const e = s.epics.find((x) => x.id === epicId)!;
  const m = e.milestones.find((x) => x.id === msId)!;
  const events: string[] = [];
  if (m.doneDay) {
    m.doneDay = null;
    if (e.doneDay === s.today && !e.rewarded) e.doneDay = null;
    return { state: s };
  }
  m.doneDay = s.today;
  if (s.epicChest.day !== s.today) {
    s.epicChest.day = s.today;
    const res = openChest(s, 'epic', `${e.id}|${m.id}`);
    events.push(chestText(s, 'epic', res));
  } else {
    s.epicChest.owed += 1;
    events.push('Milestone done. One milestone chest a day: this one arrives tomorrow.');
  }
  if (e.milestones.every((x) => x.doneDay)) {
    e.doneDay = s.today;
    events.push(`"${e.title}" is complete! Claim your reward.`);
  }
  return { state: s, events };
}

/** Whether a finished Epic earns gear, or a trophy only. */
export function epicEarnsGear(e: Epic): boolean {
  return !!e.doneDay && daysBetween(e.createdDay, e.doneDay) >= P2.epics.rewardMinDays;
}

export function claimEpic(state: State, epicId: string, slot: ItemSlot): Result {
  const e0 = state.epics.find((e) => e.id === epicId);
  if (!e0 || !e0.doneDay || e0.rewarded) return { state };
  const s = draft(state);
  const e = s.epics.find((x) => x.id === epicId)!;
  e.rewarded = true;
  s.counters.epicsDone += 1;
  s.trophies.push({ id: uid(), kind: 'epic', label: e.title, day: s.today });
  const events = [`Epic trophy: ${e.title}.`];
  if (epicEarnsGear(e)) {
    const d = grantRare(s, slot, `epic:${e.id}`);
    events.push(`Reward: ${dropText(s, d)}.`);
  }
  return { state: s, events };
}

export function updateEpic(state: State, epicId: string, patch: { title?: string; deadline?: DayKey }): Result {
  if (patch.deadline && patch.deadline <= state.today) return { state, error: 'Pick a deadline after today.' };
  const s = draft(state);
  const e = s.epics.find((x) => x.id === epicId);
  if (!e) return { state };
  if (patch.title?.trim()) e.title = patch.title.trim();
  if (patch.deadline) e.deadline = patch.deadline;
  return { state: s };
}

export function deleteEpic(state: State, epicId: string): Result {
  const s = draft(state);
  s.epics = s.epics.filter((e) => e.id !== epicId);
  return { state: s };
}

/** "At this pace you finish Apr 21, 9 days early." */
export function projection(e: Epic, today: DayKey): { text: string; day: DayKey | null; early: number | null } {
  const done = e.milestones.filter((m) => m.doneDay).length;
  const total = e.milestones.length;
  if (e.doneDay) return { text: `Finished ${shortDay(e.doneDay)}.`, day: e.doneDay, early: daysBetween(e.doneDay, e.deadline) };
  if (!done) return { text: `Due ${shortDay(e.deadline)}. Check off the first milestone to see your pace.`, day: null, early: null };
  const elapsed = Math.max(1, daysBetween(e.createdDay, today) + 1);
  const finish = addDays(e.createdDay, Math.ceil((elapsed / done) * total) - 1);
  const early = daysBetween(finish, e.deadline);
  const when = early > 0 ? `${early} day${early > 1 ? 's' : ''} early` : early === 0 ? 'right on time' : `${-early} day${early < -1 ? 's' : ''} late`;
  return { text: `At this pace you finish ${shortDay(finish)}, ${when}.`, day: finish, early };
}

/** Deliver one owed milestone chest on a new day. Mutates s. */
export function deliverOwedChest(s: State) {
  if (s.epicChest.owed <= 0 || s.epicChest.day === s.today) return;
  s.epicChest.owed -= 1;
  s.epicChest.day = s.today;
  openChest(s, 'epic', `${s.profile.deviceId}|owed|${s.today}`);
}

/** Completions of an Epic's linked tasks since it began (its "fuel"). */
export function epicFuel(s: State, e: Epic): number {
  return s.completions.filter((c) => e.linked.includes(c.taskId) && c.day >= e.createdDay && c.kind !== 'habitMinus').length;
}
