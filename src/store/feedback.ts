// Beta feedback: one document per note in the feedback collection, readable
// only by the developer in the Firebase console. No task names are attached.

import { CHANNEL } from '../channel';
import { levelFromXp } from '../engine/progress';
import type { State } from '../engine/types';
import { fbHandle } from './sync';

export async function sendFeedback(s: State, text: string): Promise<string | undefined> {
  const fb = fbHandle();
  if (!fb) return 'Sign in first (Sync across devices).';
  try {
    await fb.fsMod.addDoc(fb.fsMod.collection(fb.db, 'feedback'), {
      uid: fb.uid,
      text: text.trim().slice(0, 1500),
      level: levelFromXp(s.xp),
      day: s.today,
      daysPlayed: Object.values(s.days).filter((d) => d.opened).length,
      channel: CHANNEL,
      ua: navigator.userAgent.slice(0, 160),
      at: Date.now(),
    });
    return undefined;
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? '');
    return code === 'permission-denied' ? 'Feedback needs the latest Firestore rules (see docs/SETUP.md).' : 'Could not send. Check your connection.';
  }
}
