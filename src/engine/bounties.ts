// Daily bounties: three small objectives each morning, drawn from your own
// task list (never extra homework). One reroll a day. Each pays a bounty
// chest; all three pay a bonus chest. Only tasks that paid (inside the caps) count.

import { addDays } from './dates';
import { openChest, chestText } from './loot';
import { STAT_LABEL } from './progress';
import { tierOfTask } from './pricing';
import { P2 } from './rules';
import { rng, weighted } from './rng';
import { completionFor, scheduledDailies, uid } from './state';
import { STATS, type Bounty, type BountyKind, type Completion, type DayKey, type Stat, type State } from './types';

function paidToday(s: State): Completion[] {
  return s.completions.filter((c) => c.day === s.today && c.kind !== 'habitMinus' && c.counted > 0);
}

function openTodos(s: State) {
  return s.tasks.filter((t) => t.type === 'todo' && !t.archived && !t.doneDay);
}

interface Candidate {
  kind: BountyKind;
  weight: number;
  make: (r: () => number) => Omit<Bounty, 'id' | 'claimed'> | null;
}

function candidates(s: State, day: DayKey): Candidate[] {
  const dailies = scheduledDailies(s, day).filter((t) => !t.restDays?.includes(day));
  const habits = s.tasks.filter((t) => t.type === 'habit' && !t.archived && t.positive !== false);
  const todos = openTodos(s);
  const pool = [...dailies, ...habits, ...todos];
  const statCount: Partial<Record<Stat, number>> = {};
  for (const t of pool) for (const st of t.stats) statCount[st] = (statCount[st] ?? 0) + 1;
  const statsAvail = STATS.filter((st) => (statCount[st] ?? 0) > 0);
  const hasMedium = pool.some((t) => ['Medium', 'Hard', 'Epic'].includes(tierOfTask(t).name));
  const overdue = todos.filter((t) => t.due && t.due < day);
  const streaky = dailies.filter((t) => (t.streak ?? 0) >= 3);
  const hasVault = s.vault.coffers.some((c) => !c.archived && !c.doneDay) || s.vault.debts.some((d) => !d.archived && !d.slainDay);
  const out: Candidate[] = [];
  if (statsAvail.length)
    out.push({
      kind: 'stat',
      weight: 3,
      make: (r) => {
        const stat = statsAvail[Math.floor(r() * statsAvail.length)];
        const target = (statCount[stat] ?? 0) >= 2 && r() < 0.5 ? 2 : 1;
        return { kind: 'stat', stat, target, label: `Finish ${target} ${STAT_LABEL[stat]} task${target > 1 ? 's' : ''}` };
      },
    });
  if (pool.length >= 2) out.push({ kind: 'early', weight: 2, make: () => ({ kind: 'early', target: 2, label: 'Finish 2 tasks before noon' }) });
  if (hasMedium) out.push({ kind: 'tier', weight: 2, make: () => ({ kind: 'tier', target: 1, label: 'Finish a Medium or harder task' }) });
  if (dailies.length >= 2) out.push({ kind: 'allDailies', weight: 2, make: () => ({ kind: 'allDailies', target: dailies.length, label: 'Finish every Daily today' }) });
  if (todos.length) out.push({ kind: 'todo', weight: 1.5, make: () => ({ kind: 'todo', target: 1, label: 'Check off a to-do' }) });
  if (overdue.length) out.push({ kind: 'overdue', weight: 2, make: () => ({ kind: 'overdue', target: 1, label: 'Clear an overdue to-do' }) });
  if (hasVault) out.push({ kind: 'vault', weight: 1.5, make: () => ({ kind: 'vault', target: 1, label: 'Log a Vault entry' }) });
  if (streaky.length)
    out.push({
      kind: 'streak',
      weight: 1.5,
      make: (r) => {
        const t = streaky[Math.floor(r() * streaky.length)];
        return { kind: 'streak', taskId: t.id, target: 1, label: `Keep "${t.title}" going` };
      },
    });
  if (statsAvail.length >= 3) out.push({ kind: 'spread', weight: 1.5, make: () => ({ kind: 'spread', target: 3, label: 'Finish tasks in 3 different stats' }) });
  return out;
}

function draw(s: State, day: DayKey, seed: string, n: number, exclude: BountyKind[]): Bounty[] {
  const r = rng(seed);
  let cands = candidates(s, day).filter((c) => !exclude.includes(c.kind));
  const out: Bounty[] = [];
  while (out.length < n && cands.length) {
    const weights = Object.fromEntries(cands.map((c) => [c.kind, c.weight])) as Record<BountyKind, number>;
    const kind = weighted(r, weights);
    const c = cands.find((x) => x.kind === kind)!;
    const b = c.make(r);
    if (b) out.push({ ...b, id: uid(), claimed: false });
    cands = cands.filter((x) => x.kind !== kind);
  }
  return out;
}

/** Make sure today's bounties exist (once the system is unlocked). Mutates s. */
export function ensureBounties(s: State, day: DayKey) {
  if (s.bounties.day === day) return;
  s.bounties = { day, list: draw(s, day, `${s.profile.deviceId}|${day}|bounties`, P2.bounties.count, []), rerolled: false, bonusClaimed: false };
}

export function bountyProgress(s: State, b: Bounty): { have: number; target: number; done: boolean } {
  const paid = paidToday(s);
  let have = 0;
  switch (b.kind) {
    case 'stat':
      have = paid.filter((c) => b.stat && c.stats.includes(b.stat)).length;
      break;
    case 'early':
      have = paid.filter((c) => new Date(c.ts).getHours() < P2.bounties.earlyHour).length;
      break;
    case 'tier':
      have = paid.filter((c) => c.tier === 'Medium' || c.tier === 'Hard' || c.tier === 'Epic').length;
      break;
    case 'allDailies': {
      const rough = s.days[s.today]?.rough;
      const due = scheduledDailies(s, s.today).filter((t) => !t.restDays?.includes(s.today) && (!rough || rough.keep.includes(t.id)));
      have = due.filter((t) => completionFor(s, t.id, s.today)).length;
      return { have, target: Math.max(1, due.length), done: due.length > 0 && have >= due.length };
    }
    case 'todo':
      have = paid.filter((c) => s.tasks.find((t) => t.id === c.taskId)?.type === 'todo').length;
      break;
    case 'overdue':
      have = paid.filter((c) => {
        const t = s.tasks.find((x) => x.id === c.taskId);
        return t?.type === 'todo' && !!t.due && t.due < c.day;
      }).length;
      break;
    case 'vault':
      have = s.completions.filter((c) => c.day === s.today && c.source === 'vault').length;
      break;
    case 'streak':
      have = b.taskId && completionFor(s, b.taskId, s.today) ? 1 : 0;
      break;
    case 'spread':
      have = new Set(paid.flatMap((c) => c.stats)).size;
      break;
  }
  return { have: Math.min(have, b.target), target: b.target, done: have >= b.target };
}

type Res = { state: State; error?: string; events?: string[] };

export function claimBounty(state: State, id: string): Res {
  const b0 = state.bounties.list.find((x) => x.id === id);
  if (!b0 || b0.claimed) return { state };
  if (!bountyProgress(state, b0).done) return { state, error: 'Not finished yet.' };
  const s = structuredClone(state);
  s.updatedAt = Date.now();
  const b = s.bounties.list.find((x) => x.id === id)!;
  b.claimed = true;
  const res = openChest(s, 'bounty', `${s.profile.deviceId}|${s.today}|${b.kind}|${b.label}`);
  return { state: s, events: [chestText(s, 'bounty', res)] };
}

export function claimBonusChest(state: State): Res {
  const bb = state.bounties;
  if (bb.bonusClaimed || !bb.list.length || !bb.list.every((b) => b.claimed)) return { state };
  const s = structuredClone(state);
  s.updatedAt = Date.now();
  s.bounties.bonusClaimed = true;
  s.counters.bountyFullDays += 1;
  const res = openChest(s, 'bonus', `${s.profile.deviceId}|${s.today}|bonus`);
  return { state: s, events: [chestText(s, 'bonus', res)] };
}

export function rerollBounty(state: State, id: string): Res {
  if (state.bounties.rerolled) return { state, error: 'One reroll a day. This one is used.' };
  const old = state.bounties.list.find((b) => b.id === id);
  if (!old || old.claimed) return { state };
  const s = structuredClone(state);
  s.updatedAt = Date.now();
  const fresh = draw(s, s.today, `${s.profile.deviceId}|${s.today}|reroll`, 1, s.bounties.list.map((b) => b.kind));
  if (!fresh.length) return { state, error: 'No other bounty fits your list today.' };
  s.bounties.list = s.bounties.list.map((b) => (b.id === id ? fresh[0] : b));
  s.bounties.rerolled = true;
  return { state: s };
}

/** Yesterday's key, for tests and display. */
export const yesterday = (s: Pick<State, 'today'>) => addDays(s.today, -1);
