// Party co-op on the player's side: applying what teammates sent (Cheers,
// Rescues, a Bard's Rally) and sending your own. The network part lives in
// store/party.ts; everything here is plain State in, State out.
//
// Privacy: teammates see your level, class, stat shape, boss damage and task
// categories. Task names never leave your device.

import { draft, type Result } from './actions';
import { dayKey } from './dates';
import { P2, RULES } from './rules';
import { uid } from './state';
import { say } from './wisp';
import type { MemberSummary, State } from './types';

/**
 * Take in the party's latest summaries. Applies teammates' Rallies, Cheers
 * and Rescues aimed at you, each once. Returns the same state if nothing new.
 */
export function ingestParty(state: State, week: string, members: MemberSummary[], prev: MemberSummary[], now = Date.now()): State {
  if (!state.party) return state;
  const me = state.party.uid;
  const others = members.filter((m) => m.uid !== me);
  const s = draft(state);
  s.partyView = { week, members: others, prev: prev.filter((m) => m.uid !== me), fetchedAt: now };
  const seen = new Set(s.social.seen);
  const today = s.today;
  if (s.social.received.day !== today) s.social.received = { day: today, cheers: 0 };
  for (const m of others) {
    for (const b of m.buffs) {
      if (b.kind !== 'rally' || b.until <= now || seen.has(b.id)) continue;
      seen.add(b.id);
      s.buffs.push({ ...b, from: m.name });
      say(s, 'party', { text: `${m.name} played Rally: +10% XP for the party until it fades.` }, [], { prompted: true });
    }
    for (const c of m.cheers) {
      if (c.to !== me || seen.has(c.id)) continue;
      seen.add(c.id);
      if (dayKey(new Date(c.at)) !== today || s.social.received.cheers >= P2.social.cheersPerDay) continue;
      s.social.received.cheers += 1;
      s.buffs.push({ id: c.id, kind: 'cheer', from: m.name, start: c.at, until: c.at + P2.social.cheerMinutes * 60_000, pct: P2.social.cheerXp });
      say(s, 'party', { text: `${m.name} cheered you on: +5% XP for the next hour.` }, [], { prompted: true });
    }
    for (const r of m.rescues) {
      if (r.to !== me || seen.has(r.id)) continue;
      seen.add(r.id);
      const bump = (x: number) => Math.min(RULES.momentum.max, x + P2.social.rescueMomentum);
      s.momentum = bump(s.momentum);
      const log = s.days[today];
      if (log) log.momentumStart = bump(log.momentumStart);
      say(s, 'party', { text: `${m.name} sent a Rescue. Your lantern burns brighter (+0.1 Momentum).` }, [], { prompted: true });
    }
  }
  s.social.seen = [...seen].slice(-300);
  s.buffs = s.buffs.filter((b) => b.until > now - 24 * 3600_000);
  return s;
}

/** Cheer a teammate's win (once per win). */
export function giveCheer(state: State, to: string, ref: string, now = Date.now()): Result {
  if (!state.party) return { state, error: 'Join a party to cheer teammates.' };
  if (state.social.cheers.some((c) => c.id === `${ref}:${state.party!.uid}`)) return { state, error: 'Already cheered that one.' };
  const s = draft(state);
  s.social.cheers.push({ id: `${ref}:${s.party!.uid}`, to, at: now });
  s.social.cheers = s.social.cheers.filter((c) => c.at > now - 8 * 24 * 3600_000);
  s.counters.cheersGiven += 1;
  return { state: s };
}

export function rescueGivenToday(s: State): boolean {
  return s.social.rescues.some((r) => dayKey(new Date(r.at)) === s.today);
}

/** Pick a teammate to Rescue: it's sent with the next task you finish. */
export function armRescue(state: State, to: string | null): Result {
  if (to && rescueGivenToday(state)) return { state, error: 'One Rescue a day. You already sent today’s.' };
  const s = draft(state);
  s.social.pendingRescue = to;
  return { state: s };
}

export function setParty(state: State, party: State['party']): Result {
  const s = draft(state);
  s.party = party;
  if (!party) {
    s.partyView = null;
    s.social.pendingRescue = null;
  }
  return { state: s };
}

export const newId = uid;
