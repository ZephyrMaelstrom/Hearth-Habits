// The Vault: Coffers (savings goals) and the Debt Dragon, from numbers you log
// yourself. No bank is connected and no money moves through the game.
//
// Rewards follow the habit, not the dollar amount: your first Vault entry each
// day pays like a Medium Fortune task, whether it's $5 or $500. Reaching a
// Coffer's planned amount for the month adds a Hard bonus. Coffers pay chests
// at 25, 50, 75 and 100%. The game never gives financial advice.

import { daysBetween, monthKey, parseDay } from './dates';
import { afterGain, awardSynthetic, completionEvents, draft, snapshot, undoCompletion, type Result } from './actions';
import { chestText, openChest } from './loot';
import { P2 } from './rules';
import { round2, uid } from './state';
import type { Coffer, DayKey, Debt, State } from './types';

export const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function saved(c: Coffer): number {
  return round2(c.entries.reduce((a, e) => a + e.amount, 0));
}

function monthsLeft(today: DayKey, deadline: DayKey): number {
  const a = parseDay(today);
  const b = parseDay(deadline);
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
}

/** How much to put in this month to stay on pace for the deadline. */
export function monthlyPlan(c: Coffer, today: DayKey): number {
  const remaining = Math.max(0, c.target - savedBefore(c, monthKey(today)));
  return Math.ceil((remaining / monthsLeft(today, c.deadline)) * 100) / 100;
}

function savedBefore(c: Coffer, month: string): number {
  return c.entries.filter((e) => monthKey(e.day) < month).reduce((a, e) => a + e.amount, 0);
}

export function savedThisMonth(c: Coffer, today: DayKey): number {
  const m = monthKey(today);
  return round2(c.entries.filter((e) => monthKey(e.day) === m).reduce((a, e) => a + e.amount, 0));
}

/** "At this pace" for a Coffer: average saved per day since it began. */
export function cofferPace(c: Coffer, today: DayKey): { perDay: number; finishIn: number | null } {
  const days = Math.max(1, daysBetween(c.createdDay, today) + 1);
  const perDay = saved(c) / days;
  const left = c.target - saved(c);
  return { perDay, finishIn: left <= 0 ? 0 : perDay > 0 ? Math.ceil(left / perDay) : null };
}

const firstEntryToday = (s: State) => !s.completions.some((c) => c.day === s.today && c.source === 'vault');

export function addCoffer(state: State, o: { name: string; target: number; deadline: DayKey }): Result {
  if (!o.name.trim()) return { state, error: 'Name the Coffer.' };
  if (!(o.target > 0)) return { state, error: 'Set a target above $0.' };
  if (!o.deadline || o.deadline <= state.today) return { state, error: 'Pick a date after today.' };
  const s = draft(state);
  const c: Coffer = { id: uid(), name: o.name.trim(), target: round2(o.target), deadline: o.deadline, createdDay: s.today, entries: [], chests: [], monthBonus: [], plan: null, doneDay: null };
  c.plan = { month: monthKey(s.today), amount: monthlyPlan(c, s.today) };
  s.vault.coffers.push(c);
  return { state: s };
}

export function addDebt(state: State, o: { name: string; balance: number; apr: number | null; minPayment: number | null }): Result {
  if (!o.name.trim()) return { state, error: 'Name the debt.' };
  if (!(o.balance > 0)) return { state, error: 'Enter the balance.' };
  if (o.apr !== null && (o.apr < 0 || o.apr > 100)) return { state, error: 'The rate should be between 0 and 100%.' };
  const s = draft(state);
  s.vault.debts.push({
    id: uid(),
    name: o.name.trim(),
    start: round2(o.balance),
    balance: round2(o.balance),
    apr: o.apr,
    minPayment: o.minPayment && o.minPayment > 0 ? round2(o.minPayment) : null,
    createdDay: s.today,
    entries: [],
    interest: [],
    slainDay: null,
  });
  return { state: s };
}

/** Log a deposit (positive) or withdrawal (negative) to a Coffer. */
export function logDeposit(state: State, cofferId: string, amount: number): Result {
  const c0 = state.vault.coffers.find((c) => c.id === cofferId);
  if (!c0) return { state };
  if (!amount || !isFinite(amount)) return { state, error: 'Enter an amount.' };
  const s = draft(state);
  const c = s.vault.coffers.find((x) => x.id === cofferId)!;
  const events: string[] = [];
  const entry = { id: uid(), day: s.today, ts: Date.now(), amount: round2(amount), completionId: null as string | null };
  const before = snapshot(s);
  if (amount > 0 && firstEntryToday(s)) {
    const comp = awardSynthetic(s, { id: `vault:${c.id}`, title: 'Vault deposit', tier: 'Medium', source: 'vault' });
    entry.completionId = comp.id;
    events.push(...completionEvents(s, comp));
  }
  c.entries.push(entry);
  if (amount > 0) {
    // the month's planned amount reached: a Hard bonus, once a month
    const m = monthKey(s.today);
    if (!c.plan || c.plan.month !== m) c.plan = { month: m, amount: monthlyPlan(c, s.today) };
    if (!c.monthBonus.includes(m) && c.plan.amount > 0 && savedThisMonth(c, s.today) >= c.plan.amount) {
      c.monthBonus.push(m);
      awardSynthetic(s, { id: `vaultbonus:${c.id}`, title: 'Monthly savings goal', tier: 'Hard', source: 'vaultBonus' });
      events.push(`${c.name}: this month's plan reached. Hard bonus paid.`);
    }
    // chests at 25 / 50 / 75 / 100%
    const pct = (saved(c) / c.target) * 100;
    for (const at of P2.vault.chestsAt) {
      if (pct >= at && !c.chests.includes(at)) {
        c.chests.push(at);
        const res = openChest(s, 'vault', `${c.id}|${at}`);
        events.push(`${c.name} ${at}%! ${chestText(s, 'vault', res)}`);
      }
    }
    if (pct >= 100 && !c.doneDay) {
      c.doneDay = s.today;
      s.trophies.push({ id: uid(), kind: 'coffer', label: `${c.name} filled`, day: s.today });
    }
  }
  afterGain(s, before);
  return { state: s, events };
}

/** Log a payment against a debt. Payments above the minimum land as critical hits. */
export function logPayment(state: State, debtId: string, amount: number): Result {
  const d0 = state.vault.debts.find((d) => d.id === debtId);
  if (!d0) return { state };
  if (d0.slainDay) return { state, error: 'This dragon is already slain.' };
  if (!(amount > 0)) return { state, error: 'Enter the payment.' };
  const s = draft(state);
  const d = s.vault.debts.find((x) => x.id === debtId)!;
  const paid = round2(Math.min(amount, d.balance));
  const crit = !!d.minPayment && paid > d.minPayment;
  const entry = { id: uid(), day: s.today, ts: Date.now(), amount: paid, crit, completionId: null as string | null };
  const events: string[] = [];
  const before = snapshot(s);
  if (firstEntryToday(s)) {
    const comp = awardSynthetic(s, { id: `vault:${d.id}`, title: 'Debt payment', tier: 'Medium', source: 'vault' });
    entry.completionId = comp.id;
    events.push(...completionEvents(s, comp));
  }
  d.entries.push(entry);
  d.balance = round2(d.balance - paid);
  events.unshift(crit ? `Critical hit! ${money(paid)} off the ${d.name} dragon.` : `${money(paid)} off the ${d.name} dragon.`);
  if (d.balance <= 0) {
    d.balance = 0;
    d.slainDay = s.today;
    s.counters.dragonsSlain += 1;
    if (!s.titles.includes('Dragonslayer')) s.titles.push('Dragonslayer');
    s.trophies.push({ id: uid(), kind: 'dragon', label: `${d.name} dragon slain`, day: s.today });
    events.push(`The ${d.name} dragon is slain! You earned the Dragonslayer title.`);
  }
  afterGain(s, before);
  return { state: s, events };
}

/** Remove one of today's entries (a typo), taking back what it paid. */
export function deleteEntry(state: State, kind: 'coffer' | 'debt', parentId: string, entryId: string): Result {
  const list = kind === 'coffer' ? state.vault.coffers : state.vault.debts;
  const parent = list.find((x) => x.id === parentId);
  const e = parent?.entries.find((x) => x.id === entryId);
  if (!parent || !e) return { state };
  if (e.day !== state.today) return { state, error: 'Only today’s entries can be removed.' };
  let s = state;
  if (e.completionId) s = undoCompletion(s, e.completionId).state;
  s = draft(s);
  if (kind === 'coffer') {
    const c = s.vault.coffers.find((x) => x.id === parentId)!;
    c.entries = c.entries.filter((x) => x.id !== entryId);
    if (c.doneDay && saved(c) < c.target) c.doneDay = null;
  } else {
    const d = s.vault.debts.find((x) => x.id === parentId)!;
    d.entries = d.entries.filter((x) => x.id !== entryId);
    d.balance = round2(d.balance + e.amount);
    if (d.slainDay === s.today) {
      d.slainDay = null;
      s.counters.dragonsSlain = Math.max(0, s.counters.dragonsSlain - 1);
    }
  }
  return { state: s };
}

export function archiveVault(state: State, kind: 'coffer' | 'debt', id: string): Result {
  const s = draft(state);
  const list: (Coffer | Debt)[] = kind === 'coffer' ? s.vault.coffers : s.vault.debts;
  const x = list.find((v) => v.id === id);
  if (x) x.archived = true;
  return { state: s };
}

/** At a new month: interest heals each dragon, and Coffer plans reset. Mutates s. */
export function vaultNewMonth(s: State, today: DayKey) {
  const m = monthKey(today);
  if (s.vault.month === m) return;
  for (const d of s.vault.debts) {
    if (d.slainDay || d.archived || !d.apr || d.balance <= 0 || d.interest.some((x) => x.month === m)) continue;
    const amount = round2((d.balance * d.apr) / 100 / 12);
    d.balance = round2(d.balance + amount);
    d.interest.push({ month: m, amount });
  }
  for (const c of s.vault.coffers) if (!c.archived && !c.doneDay) c.plan = { month: m, amount: monthlyPlan(c, today) };
  s.vault.month = m;
}

/** Two common payoff orders, laid out neutrally. The player chooses. */
export function payoffOrders(debts: Debt[]) {
  const open = debts.filter((d) => !d.slainDay && !d.archived);
  return {
    highestRate: [...open].sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0)).map((d) => d.name),
    smallestBalance: [...open].sort((a, b) => a.balance - b.balance).map((d) => d.name),
  };
}
