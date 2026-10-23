// Phase 3 settings: Ember's AI (opt-in, with consent and a visible memory),
// reminders (morning plan time, evening reminder, quiet hours, push), and
// beta feedback.

import { useEffect, useState } from 'react';
import { setAiEnabled, updateMemory, updateReminders, wipeMemory } from '../engine/companion';
import { levelFromXp } from '../engine/progress';
import type { State } from '../engine/types';
import { act, useGame } from '../store/store';
import { disablePush, enablePush, pushState, type PushState } from '../store/push';
import { sendFeedback } from '../store/feedback';
import { syncInfo, useSync } from '../store/sync';

type Toast = (m: string) => void;

export const hourLabel = (h: number) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function useSignedIn() {
  useSync();
  const st = syncInfo().status;
  return st === 'synced' || st === 'syncing';
}

export function EmberAiCard({ toast }: { toast: Toast }) {
  const s = useGame();
  const signedIn = useSignedIn();
  const ai = s.profile.ai ?? { enabled: false, consentDay: null };
  const mem = s.profile.memory ?? { goals: '', helps: '', notes: '' };
  const [goals, setGoals] = useState(mem.goals);
  const [helps, setHelps] = useState(mem.helps);
  const [notes, setNotes] = useState(mem.notes);
  const save = () => {
    act((st) => updateMemory(st, { goals, helps, notes }));
    toast('Saved. Ember will use this from the next plan.');
  };
  return (
    <section className="card stack" aria-labelledby="ai-h">
      <h2 id="ai-h">Ember's AI</h2>
      <label className="between">
        <span className="stack" style={{ gap: 2 }}>
          <span>Write my morning plan and weekly review with AI</span>
          <span className="tiny muted">
            {ai.enabled ? `On since ${ai.consentDay ?? 'today'}.` : 'Off: Ember uses her written templates.'} {!signedIn && 'Needs sign-in (Sync across devices).'}
          </span>
        </span>
        <input type="checkbox" className="check" checked={ai.enabled} onChange={(e) => act((st) => setAiEnabled(st, e.target.checked))} aria-label="Ember's AI" />
      </label>
      <p className="tiny muted">
        When it's on, your task titles, stats, recent days and the notes below are sent to Anthropic's Claude only to write your plan and review. Hearth &amp; Habits never uses them to train anything. The rules engine still decides when Ember speaks; AI only decides how she says it.
      </p>
      <details>
        <summary className="small">What Ember knows about you</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="mem-goals">Your goals</label>
            <textarea id="mem-goals" className="input" maxLength={400} value={goals} placeholder="Run a 5K by spring. Get to bed by 11." onChange={(e) => setGoals(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mem-helps">What helps you</label>
            <textarea id="mem-helps" className="input" maxLength={400} value={helps} placeholder="Short tasks first. Mornings are easier than evenings." onChange={(e) => setHelps(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mem-notes">Anything else</label>
            <textarea id="mem-notes" className="input" maxLength={400} value={notes} placeholder="I work 7 to 3 on weekdays." onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" className="btn small primary" onClick={save}>
              Save
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                act(wipeMemory);
                setGoals('');
                setHelps('');
                setNotes('');
              }}
            >
              Wipe it
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}

export function RemindersCard({ toast }: { toast: Toast }) {
  const s = useGame();
  const signedIn = useSignedIn();
  const r = s.profile.reminders!;
  const [push, setPush] = useState<PushState | 'checking'>('checking');
  useEffect(() => {
    pushState()
      .then(setPush)
      .catch(() => setPush('unsupported'));
  }, []);
  const set = (patch: Partial<State['profile']['reminders'] & object>) => {
    const err = act((st) => updateReminders(st, patch));
    if (err) toast(err);
  };
  const togglePush = async () => {
    if (push === 'on') {
      await disablePush();
      set({ push: false });
      setPush('off');
      return toast('Reminders are off on this device.');
    }
    const err = await enablePush();
    if (err) return toast(err);
    set({ push: true });
    setPush('on');
    toast('Reminders are on for this device.');
  };
  return (
    <section className="card stack" aria-labelledby="rem-h">
      <h2 id="rem-h">Reminders</h2>
      <div className="field">
        <label htmlFor="rem-morning">Morning plan ready at</label>
        <select id="rem-morning" className="input" value={r.morningHour} onChange={(e) => set({ morningHour: Number(e.target.value) })}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </div>
      <label className="between">
        <span className="stack" style={{ gap: 2 }}>
          <span>Evening reminder</span>
          <span className="tiny muted">Only on days with Dailies still open. One a day at most.</span>
        </span>
        <input type="checkbox" className="check" checked={r.evening} onChange={(e) => set({ evening: e.target.checked })} aria-label="Evening reminder" />
      </label>
      {r.evening && (
        <div className="field">
          <label htmlFor="rem-evening">Evening reminder at</label>
          <select id="rem-evening" className="input" value={r.eveningHour} onChange={(e) => set({ eveningHour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="two">
        <div className="field">
          <label htmlFor="rem-qs">Quiet from</label>
          <select id="rem-qs" className="input" value={r.quietStart} onChange={(e) => set({ quietStart: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rem-qe">Until</label>
          <select id="rem-qe" className="input" value={r.quietEnd} onChange={(e) => set({ quietEnd: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="between">
        <span className="stack" style={{ gap: 2 }}>
          <span>Push notifications on this device</span>
          <span className="tiny muted">
            {push === 'on' && 'On. The morning plan arrives at your chosen time (within the hour).'}
            {push === 'off' && (signedIn ? 'Off.' : 'Needs sign-in (Sync across devices).')}
            {push === 'blocked' && 'Blocked in your browser or phone settings.'}
            {push === 'needs-install' && 'On iPhone, add the app to your Home Screen first, then turn this on from there.'}
            {push === 'unsupported' && 'This browser can’t do push notifications.'}
            {push === 'checking' && 'Checking…'}
          </span>
        </span>
        <button type="button" className={`btn small ${push === 'on' ? '' : 'primary'}`} disabled={push !== 'on' && push !== 'off'} onClick={togglePush}>
          {push === 'on' ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </section>
  );
}

export function FeedbackCard({ toast }: { toast: Toast }) {
  const s = useGame();
  const signedIn = useSignedIn();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="card stack" aria-labelledby="fb-h">
      <h2 id="fb-h">Send feedback</h2>
      <p className="tiny muted">Bugs, confusing bits, what you love. It goes straight to the developer with your level ({levelFromXp(s.xp)}) and app version, never your task names.</p>
      <textarea className="input" aria-label="Your feedback" maxLength={1500} value={text} placeholder="The boss card confused me because…" onChange={(e) => setText(e.target.value)} />
      <button
        type="button"
        className="btn small primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={!signedIn || busy || text.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          const err = await sendFeedback(s, text);
          setBusy(false);
          if (err) return toast(err);
          setText('');
          toast('Thank you! Feedback sent.');
        }}
      >
        {signedIn ? 'Send' : 'Sign in to send'}
      </button>
    </section>
  );
}
