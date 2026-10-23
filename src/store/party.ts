// Party sync over Firestore. A party is parties/{code} (name, owner, member
// ids); each member writes their own weekly summary to
// parties/{code}/members/{uid}. Summaries carry damage, Daily completion
// counts, skills used, cheers and rescues, never task names.
//
// Everyone runs the same fight resolver on the same summaries, so there is no
// server to pay for. Firestore rules (firestore.rules) only let members read a
// party's summaries and only let each player write their own.

import { useSyncExternalStore } from 'react';
import { addDays, weekStart } from '../engine/dates';
import { selfSummary } from '../engine/boss';
import { ingestParty, setParty } from '../engine/social';
import { P2 } from '../engine/rules';
import type { MemberSummary, State } from '../engine/types';
import { act, getState, subscribe } from './store';
import { fbHandle, onAuthChange } from './sync';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

let status: 'off' | 'connecting' | 'live' | 'error' = 'off';
let lastError = '';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function usePartyStatus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => `${status}|${lastError}`,
  );
}

export function partyStatus() {
  return { status, lastError, signedIn: !!fbHandle() };
}

function setStatus(s: typeof status, err = '') {
  status = s;
  lastError = err;
  emit();
}

function newCode(): string {
  const a = new Uint32Array(6);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
}

const friendly = (e: unknown) => {
  const code = String((e as { code?: string })?.code ?? '');
  if (code === 'permission-denied') return "Firestore's rules don't allow parties yet. Publish the latest firestore.rules (see docs/SETUP.md).";
  if (code === 'unavailable') return "Couldn't reach the party server. Check your connection.";
  return e instanceof Error ? e.message : String(e);
};

// ------------------------------------------------------------------ create, join, leave

export async function createParty(name: string): Promise<string | undefined> {
  const fb = fbHandle();
  if (!fb) return 'Sign in first (Settings, Sync across devices).';
  if (!name.trim()) return 'Name your party.';
  const { db, fsMod, uid } = fb;
  try {
    let code = newCode();
    for (let i = 0; i < 4 && (await fsMod.getDoc(fsMod.doc(db, 'parties', code))).exists(); i++) code = newCode();
    await fsMod.setDoc(fsMod.doc(db, 'parties', code), { name: name.trim().slice(0, 40), owner: uid, members: [uid], createdAt: Date.now() });
    act((s) => setParty(s, { code, name: name.trim().slice(0, 40), joined: s.today, uid }));
    await connect();
    return undefined;
  } catch (e) {
    return friendly(e);
  }
}

export async function joinParty(rawCode: string): Promise<string | undefined> {
  const fb = fbHandle();
  if (!fb) return 'Sign in first (Settings, Sync across devices).';
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return 'Party codes are 6 letters and numbers.';
  const { db, fsMod, uid } = fb;
  try {
    const ref = fsMod.doc(db, 'parties', code);
    const snap = await fsMod.getDoc(ref);
    if (!snap.exists()) return 'No party with that code.';
    const data = snap.data() as { name: string; members: string[] };
    if (!data.members.includes(uid)) {
      if (data.members.length >= P2.social.partyMax) return `That party is full (${P2.social.partyMax} max).`;
      await fsMod.updateDoc(ref, { members: fsMod.arrayUnion(uid) });
    }
    act((s) => setParty(s, { code, name: data.name, joined: s.today, uid }));
    await connect();
    return undefined;
  } catch (e) {
    return friendly(e);
  }
}

export async function leaveParty(): Promise<string | undefined> {
  const s = getState();
  const fb = fbHandle();
  if (!s.party) return undefined;
  disconnect();
  if (fb) {
    const { db, fsMod, uid } = fb;
    try {
      await fsMod.deleteDoc(fsMod.doc(db, 'parties', s.party.code, 'members', uid));
      await fsMod.updateDoc(fsMod.doc(db, 'parties', s.party.code), { members: fsMod.arrayRemove(uid) });
    } catch (e) {
      act((st) => setParty(st, null));
      return friendly(e);
    }
  }
  act((st) => setParty(st, null));
  return undefined;
}

// ------------------------------------------------------------------ live sync

let unsubs: (() => void)[] = [];
let connectedCode: string | null = null;
let lastPublished = '';
let publishTimer: ReturnType<typeof setTimeout> | null = null;

function disconnect() {
  unsubs.forEach((u) => u());
  unsubs = [];
  connectedCode = null;
  lastPublished = '';
  setStatus('off');
}

function payload(s: State, uid: string) {
  const week = weekStart(s.today);
  return { cur: selfSummary(s, uid, week), prev: selfSummary(s, uid, addDays(week, -7)) };
}

async function publish() {
  const s = getState();
  const fb = fbHandle();
  if (!s.party || !fb || fb.uid !== s.party.uid || connectedCode !== s.party.code) return;
  const p = payload(s, fb.uid);
  // updatedAt changes on every save; leave it out when deciding whether anything changed
  const key = JSON.stringify({ ...p, cur: { ...p.cur, updatedAt: 0 }, prev: { ...p.prev, updatedAt: 0 } });
  if (key === lastPublished) return;
  lastPublished = key;
  try {
    await fb.fsMod.setDoc(fb.fsMod.doc(fb.db, 'parties', s.party.code, 'members', fb.uid), { data: JSON.stringify(p), updatedAt: Date.now() });
  } catch (e) {
    lastPublished = '';
    setStatus('error', friendly(e));
  }
}

function publishSoon() {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(publish, 1500);
}

function split(docs: { cur: MemberSummary; prev: MemberSummary | null }[], week: string) {
  const prevWeek = addDays(week, -7);
  const cur: MemberSummary[] = [];
  const prev: MemberSummary[] = [];
  for (const d of docs) {
    if (d.cur.week === week) {
      cur.push(d.cur);
      if (d.prev) prev.push(d.prev);
    } else {
      // hasn't opened the app this week yet: still in the fight, with nothing done
      if (d.cur.week === prevWeek) prev.push(d.cur);
      cur.push({ ...d.cur, week, joinDay: week, hits: [], days: {}, casts: [], buffs: d.cur.buffs, cheers: [], rescues: [], recent: [] });
    }
  }
  return { cur, prev };
}

async function connect() {
  const s = getState();
  const fb = fbHandle();
  if (!s.party || !fb) return disconnect();
  if (fb.uid !== s.party.uid) return setStatus('error', 'This party belongs to a different signed-in account.');
  if (connectedCode === s.party.code) return;
  disconnect();
  connectedCode = s.party.code;
  setStatus('connecting');
  const { db, fsMod } = fb;
  const code = s.party.code;
  unsubs.push(
    fsMod.onSnapshot(
      fsMod.doc(db, 'parties', code),
      (snap: { exists: () => boolean; data: () => { members: string[]; name: string } }) => {
        if (!snap.exists() || !snap.data().members.includes(fb.uid)) {
          disconnect();
          act((st) => setParty(st, null));
        }
      },
      (e: unknown) => setStatus('error', friendly(e)),
    ),
  );
  unsubs.push(
    fsMod.onSnapshot(
      fsMod.collection(db, 'parties', code, 'members'),
      (qs: { docs: { data: () => { data?: string } }[] }) => {
        const docs: { cur: MemberSummary; prev: MemberSummary | null }[] = [];
        for (const d of qs.docs) {
          try {
            const raw = d.data().data;
            if (typeof raw === 'string') docs.push(JSON.parse(raw));
          } catch {
            /* skip a malformed summary */
          }
        }
        const week = weekStart(getState().today);
        const { cur, prev } = split(docs, week);
        act((st) => ({ state: ingestParty(st, week, cur, prev) }));
        setStatus('live');
      },
      (e: unknown) => setStatus('error', friendly(e)),
    ),
  );
  publishSoon();
}

/** Start keeping the party in sync: on sign-in, on joining, and on every change. */
export function initParty() {
  onAuthChange(() => connect());
  let lastCode = getState().party?.code ?? null;
  subscribe(() => {
    const code = getState().party?.code ?? null;
    if (code !== lastCode) {
      lastCode = code;
      connect();
    }
    if (code) publishSoon();
  });
}
