import { useState } from 'react';
import * as A from '../engine/actions';
import { LIBRARY } from '../engine/library';
import { dailySlots, STAT_LABEL } from '../engine/progress';
import { STATS, type Tone } from '../engine/types';
import { act } from '../store/store';
import { TONES } from './Settings';
import { scheduleText } from './TaskEditor';

/** One starter task per part of life, all light enough to start with. */
export const SUGGESTED = [1, 15, 29, 58, 60, 88, 73];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [tone, setTone] = useState<Tone>('cheerful');
  const [picks, setPicks] = useState<number[]>(SUGGESTED);
  const slots = dailySlots(1);
  const dailyCount = picks.filter((id) => LIBRARY.find((l) => l.id === id)?.type === 'daily').length;

  function toggle(id: number) {
    const t = LIBRARY.find((l) => l.id === id)!;
    if (picks.includes(id)) return setPicks(picks.filter((p) => p !== id));
    if (t.type === 'daily' && dailyCount >= slots) return;
    setPicks([...picks, id]);
  }

  function finish() {
    const drafts: A.TaskDraft[] = picks
      .map((id) => LIBRARY.find((l) => l.id === id)!)
      .map((t) => ({
        type: t.type,
        title: t.title,
        effort: t.effort,
        minutes: t.minutes,
        dread: t.dread,
        stats: [t.stat],
        days: t.days,
        libraryId: t.id,
        lifeSkill: t.skill ?? undefined,
        positive: true,
        negative: false,
      }));
    act((st) => A.finishOnboarding(st, name, tone, drafts));
  }

  if (step === 0) {
    return (
      <main className="onboard" aria-label="Welcome">
        <div className="orb glow" aria-hidden="true" style={{ width: 64, height: 64 }} />
        <h1>Hearth &amp; Habits</h1>
        <p className="muted">A role-playing game whose only fuel is your real life. Finish real tasks, and your hero, your stats and your hearth grow.</p>
        <div className="field">
          <label htmlFor="ob-name">What should Ember call you?</label>
          <input id="ob-name" className="input" value={name} autoComplete="given-name" onChange={(e) => setName(e.target.value)} placeholder="Your name or hero name" />
        </div>
        <div className="field">
          <span className="label">How should Ember talk to you?</span>
          <div className="tone-grid">
            {TONES.map((t) => (
              <button key={t.id} type="button" className="tone" aria-pressed={tone === t.id} onClick={() => setTone(t.id)}>
                <b className="small">{t.label}</b>
                <span className="tiny muted">{t.sample}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => setStep(1)}>
          Next: pick your first tasks
        </button>
      </main>
    );
  }

  return (
    <main className="onboard" aria-label="Pick your first tasks">
      <h1>Pick a few to start</h1>
      <p className="muted small">
        A light start beats a big one. These {SUGGESTED.length} cover each part of life; swap any of them. You can hold {slots} Dailies now and gain a slot every 5 levels.
      </p>
      {STATS.map((st) => (
        <section key={st} className="stack" aria-labelledby={`ob-${st}`}>
          <h2 id={`ob-${st}`}>{STAT_LABEL[st]}</h2>
          <div>
            {LIBRARY.filter((l) => l.stat === st).map((t) => {
              const on = picks.includes(t.id);
              const blocked = !on && t.type === 'daily' && dailyCount >= slots;
              return (
                <label key={t.id} className="pick" style={blocked ? { opacity: 0.5 } : undefined}>
                  <input type="checkbox" className="check" checked={on} disabled={blocked} onChange={() => toggle(t.id)} />
                  <span className="grow">
                    <span className="task-title">{t.title}</span>
                    <span className="task-meta">
                      <span className={`tier-${t.tier}`}>{t.tier}</span>
                      <span>{t.type === 'daily' ? scheduleText(t.days) : t.type === 'habit' ? 'Habit' : 'To-do'}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ))}
      <div className="sticky-foot stack">
        <span className="small muted" aria-live="polite">
          {picks.length} picked · Dailies {dailyCount} of {slots}
        </span>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setStep(0)}>
            Back
          </button>
          <button type="button" className="btn primary grow" disabled={!picks.length} onClick={finish}>
            Light the hearth
          </button>
        </div>
      </div>
    </main>
  );
}
