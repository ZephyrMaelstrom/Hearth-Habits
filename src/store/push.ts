// Push reminders on this device (web push with VAPID, no extra SDK).
// The subscription is saved to users/{uid}/push/{id}; the hourly Ember job
// reads it to send the morning plan and the optional evening reminder.
// iPhone and iPad: only works once the app is added to the Home Screen.

import { CHANNEL } from '../channel';
import { VAPID_PUBLIC_KEY } from '../push-config';
import { hash } from '../engine/rng';
import { fbHandle } from './sync';
import { isStandalone } from './install';

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe and save the subscription. Returns an error message, if any. */
export async function enablePush(): Promise<string | undefined> {
  const fb = fbHandle();
  if (!fb) return 'Sign in first (Sync across devices), so reminders know where to go.';
  if (!pushSupported()) return isIos() ? 'On iPhone, add the app to your Home Screen first, then turn reminders on from there.' : 'This browser can’t do push reminders.';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications are blocked. Allow them in your browser or phone settings, then try again.';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource }));
    const json = sub.toJSON();
    const id = `${CHANNEL}-${hash(json.endpoint ?? '')}`;
    await fb.fsMod.setDoc(fb.fsMod.doc(fb.db, 'users', fb.uid, 'push', id), { sub: json, channel: CHANNEL, ua: navigator.userAgent.slice(0, 160), updatedAt: Date.now() });
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const fb = fbHandle();
  const id = `${CHANNEL}-${hash(sub.endpoint)}`;
  await sub.unsubscribe().catch(() => undefined);
  if (fb) await fb.fsMod.deleteDoc(fb.fsMod.doc(fb.db, 'users', fb.uid, 'push', id)).catch(() => undefined);
}
