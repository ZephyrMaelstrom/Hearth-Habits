// Optional cloud sync with Firebase (Google sign-in + Firestore).
// Off until src/firebase-config.ts holds a config. The Firebase SDK is loaded
// only when sync is configured, so the app stays small and works offline.
//
// Model: one document per player, users/{uid}/state/main, holding the whole
// State as JSON. Newest updatedAt wins. Each player also writes a small
// testers/{uid} summary so Gate 1 can be checked in the Firebase console.

import { useSyncExternalStore } from 'react';
import { firebaseConfig } from '../firebase-config';
import { testerReport } from '../engine/metrics';
import type { State } from '../engine/types';

export type SyncStatus = 'off' | 'loading' | 'signed-out' | 'syncing' | 'synced' | 'error';

export const syncConfigured = !!firebaseConfig;

let status: SyncStatus = syncConfigured ? 'loading' : 'off';
let userLabel = '';
let lastError = '';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setStatus = (s: SyncStatus) => {
  status = s;
  emit();
};

// The Firebase modules are loaded lazily, so they're held loosely typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fb: any = null;
let uid: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushed = 0;

export function useSync() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => `${status}|${userLabel}|${lastError}`,
  );
}

export function syncInfo() {
  return { status, userLabel, lastError };
}

export async function initSync(getLocal: () => State, onRemote: (s: State) => void) {
  if (!firebaseConfig) return;
  try {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);
    fb = { auth, db, authMod, fsMod };
    await authMod.getRedirectResult(auth).catch(() => undefined);
    authMod.onAuthStateChanged(auth, async (user: { uid: string; email: string | null; displayName: string | null } | null) => {
      uid = user?.uid ?? null;
      userLabel = user?.email ?? user?.displayName ?? '';
      if (!user) return setStatus('signed-out');
      setStatus('syncing');
      const ref = fsMod.doc(db, 'users', user.uid, 'state', 'main');
      try {
        const snap = await fsMod.getDoc(ref);
        const local = getLocal();
        if (snap.exists()) {
          const remote = JSON.parse(snap.data().data) as State;
          // A fresh, not-yet-set-up device always takes the saved game, even though
          // its own blank state is technically newer.
          if (!local.profile.onboarded || (remote.updatedAt ?? 0) > (local.updatedAt ?? 0)) onRemote(remote);
          else await write(local);
        } else {
          await write(local);
        }
        fsMod.onSnapshot(ref, (snap) => {
          const raw = snap.data()?.data;
          if (!snap.exists() || snap.metadata.hasPendingWrites || typeof raw !== 'string') return;
          const remote = JSON.parse(raw) as State;
          if ((remote.updatedAt ?? 0) > (getLocal().updatedAt ?? 0)) onRemote(remote);
        });
        setStatus('synced');
      } catch (e) {
        fail(e);
      }
    });
  } catch (e) {
    fail(e);
  }
}

function fail(e: unknown) {
  lastError = e instanceof Error ? e.message : String(e);
  setStatus('error');
}

async function write(s: State) {
  if (!fb || !uid) return;
  const { fsMod, db } = fb;
  lastPushed = s.updatedAt;
  await fsMod.setDoc(fsMod.doc(db, 'users', uid, 'state', 'main'), {
    data: JSON.stringify(s),
    updatedAt: s.updatedAt,
  });
  const r = testerReport(s);
  await fsMod.setDoc(
    fsMod.doc(db, 'testers', uid),
    {
      name: r.name,
      firstDay: r.firstDay,
      window: `${r.window.from} to ${r.window.to}`,
      daysOpened: r.daysOpened,
      week1Done: r.week1.done,
      week2Done: r.week2.done,
      openedOk: r.openedOk,
      improvedOk: r.improvedOk,
      level: r.level,
      updatedAt: s.updatedAt,
    },
    { merge: true },
  );
}

/** Called on every local change; batches writes to one every 1.5 s. */
export function pushLater(s: State) {
  if (!fb || !uid || s.updatedAt === lastPushed) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    setStatus('syncing');
    write(s)
      .then(() => setStatus('synced'))
      .catch(fail);
  }, 1500);
}

export async function signIn() {
  if (!fb) return;
  const { auth, authMod } = fb;
  const provider = new authMod.GoogleAuthProvider();
  try {
    await authMod.signInWithPopup(auth, provider);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('popup')) await authMod.signInWithRedirect(auth, provider);
    else fail(e);
  }
}

export async function signOut() {
  if (!fb) return;
  await fb.authMod.signOut(fb.auth);
}
