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
import { CLOUD_DOC, IS_PREVIEW } from '../channel';
import { ingestAi } from '../engine/companion';
import { act, applyTuning } from './store';

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

const authListeners = new Set<(uid: string | null) => void>();

/** Called with the signed-in account id (or null) now and on every change. */
export function onAuthChange(fn: (uid: string | null) => void) {
  authListeners.add(fn);
  fn(uid);
  return () => authListeners.delete(fn);
}

/** Firestore access for other modules (parties), once signed in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fbHandle(): { db: any; fsMod: any; uid: string } | null {
  return fb && uid ? { db: fb.db, fsMod: fb.fsMod, uid } : null;
}

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
    // remote tuning is public; read it whether or not anyone signs in
    fsMod
      .getDoc(fsMod.doc(db, 'content', 'tuning'))
      .then((snap: { exists: () => boolean; data: () => unknown }) => snap.exists() && applyTuning(snap.data()))
      .catch(() => undefined);
    await authMod.getRedirectResult(auth).catch(fail);
    connect = async () => {
      const user = auth.currentUser as { uid: string } | null;
      if (!user) return;
      setStatus('syncing');
      const ref = fsMod.doc(db, 'users', user.uid, 'state', CLOUD_DOC);
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
        unlistenAi?.();
        unlistenAi = fsMod.onSnapshot(
          fsMod.doc(db, 'users', user.uid, 'ai', CLOUD_DOC),
          (snap: { data: () => unknown }) => {
            const data = snap.data();
            if (data) act((st) => ({ state: ingestAi(st, data as Parameters<typeof ingestAi>[1]) }));
          },
          () => undefined,
        );
        unlisten?.();
        unlisten = fsMod.onSnapshot(ref, (snap) => {
          const raw = snap.data()?.data;
          if (!snap.exists() || snap.metadata.hasPendingWrites || typeof raw !== 'string') return;
          const remote = JSON.parse(raw) as State;
          if ((remote.updatedAt ?? 0) > (getLocal().updatedAt ?? 0)) onRemote(remote);
        });
        lastError = '';
        setStatus('synced');
      } catch (e) {
        fail(e);
      }
    };
    authMod.onAuthStateChanged(auth, async (user: { uid: string; email: string | null; displayName: string | null } | null) => {
      uid = user?.uid ?? null;
      userLabel = user?.email ?? user?.displayName ?? '';
      authListeners.forEach((l) => l(uid));
      if (!user) {
        unlisten?.();
        unlisten = null;
        unlistenAi?.();
        unlistenAi = null;
        // keep a failed redirect sign-in's message on screen
        return setStatus(lastError ? 'error' : 'signed-out');
      }
      await connect?.();
    });
  } catch (e) {
    fail(e);
  }
}

let connect: (() => Promise<void>) | null = null;
let unlisten: (() => void) | null = null;
let unlistenAi: (() => void) | null = null;

/** Tries the cloud save again for the signed-in player (after fixing a setup problem). */
export async function retrySync() {
  lastError = '';
  await connect?.();
}

function fail(e: unknown) {
  lastError = friendlyError(e);
  setStatus('error');
}

/**
 * Turns the setup mistakes testers are likely to hit into plain instructions.
 * The raw Firebase code is kept on the end so a problem can be pinned down exactly.
 */
export function friendlyError(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? '');
  const msg = e instanceof Error ? e.message : String(e);
  const tag = code ? ` [${code}]` : '';
  if (code === 'auth/unauthorized-domain')
    return `This site isn't on Firebase's list of allowed sites. In the Firebase console, open Authentication → Settings → Authorized domains and add ${location.hostname}.${tag}`;
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found')
    return `Google sign-in isn't switched on. In the Firebase console, open Authentication (click Get started if you see it) → Sign-in method → Google → Enable → Save.${tag}`;
  if (code === 'permission-denied' || /insufficient permissions/i.test(msg))
    return `Firestore's rules are blocking saves. Paste the rules from firestore.rules into Firestore Database → Rules and publish.${tag}`;
  if (/database .*does not exist/i.test(msg) || code === 'not-found')
    return `The Firestore database wasn't found. In the Firebase console, open Firestore Database and check a database named (default) exists in project ${firebaseConfig?.projectId ?? ''}.${tag}`;
  if (code === 'unavailable' || code === 'auth/network-request-failed')
    return `Couldn't reach the cloud save. If you're online, a missing Firestore database can also cause this. Your game is still saved on this device.${tag}`;
  return msg;
}

async function write(s: State) {
  if (!fb || !uid) return;
  const { fsMod, db } = fb;
  lastPushed = s.updatedAt;
  await fsMod.setDoc(fsMod.doc(db, 'users', uid, 'state', CLOUD_DOC), {
    data: JSON.stringify(s),
    updatedAt: s.updatedAt,
  });
  if (IS_PREVIEW) return; // the Gate 1 tester summary comes from the main app only
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
    // closing the popup is a choice, not an error
    if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return;
    // blocked popups (common in installed apps) fall back to a full-page redirect
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) await authMod.signInWithRedirect(auth, provider);
    else fail(e);
  }
}

export async function signOut() {
  if (!fb) return;
  await fb.authMod.signOut(fb.auth);
}
