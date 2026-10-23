import { useState } from 'react';
import * as A from '../engine/actions';
import { LIBRARY } from '../engine/library';
import { dailySlots, STAT_HINT, STAT_LABEL } from '../engine/progress';
import { STATS, type Stat, type Tone } from '../engine/types';
import { setAiEnabled, updateReminders } from '../engine/companion';
import { act } from '../store/store';
import { hourLabel } from './SettingsCompanion';
import { TONES } from './Settings';
import { scheduleText } from './TaskEditor';

/** One starter task per part of life, all light enough to start with. */
export const SUGGESTED = [1, 15, 29, 58, 60, 88, 73];

/**
 * The starter picks, leaning toward the life areas the player chose: one extra
 * light Daily per chosen area, swapped in for a Daily from an area they didn't
 * choose, so the total still fits the 6 starting slots.
 */
export function suggestionsFor(focus: Stat[]): number[] {
  const base = [...SUGGESTED];
  const lib = (id: number) => LIBRARY.find((l) => l.id === id)!;
  for (const st of focus.slice(0, 3)) {
    const extra = LIBRARY.find((l) => l.stat === st && l.type === 'daily' && (l.tier === 'Trivial' || l.tier === 'Easy') && !base.includes(l.id));
    const drop = [...base].reverse().find((id) => lib(id).type === 'daily' && !focus.includes(lib(id).stat));
    if (!extra || drop === undefined) continue;
    base.splice(base.indexOf(drop), 1);
    base.push(extra.id);
  }
  return base;
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [tone, setTone] = useState<Tone>('cheerful');
  const [focus, setFocus] = useState<Stat[]>([]);
  const [morningHour, setMorningHour] = useState(8);
  const [ai, setAi] = useState(false);
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
    act((st) => A.updateProfile(st, { focus }));
    act((st) => updateReminders(st, { morningHour }));
    if (ai) act((st) => setAiEnabled(st, true));
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
          Next
        </button>
      </main>
    );
  }

  if (step === 1) {
    return (
      <main className="onboard" aria-label="What matters to you">
        <h1>What matters most right now?</h1>
        <p className="muted small">Pick up to three parts of life. Your starter tasks will lean that way, and every part still counts.</p>
        <div className="stack" role="group" aria-label="Life areas">
          {STATS.map((st) => {
            const on = focus.includes(st);
            return (
              <button
                key={st}
                type="button"
                className="tone"
                aria-pressed={on}
                onClick={() => setFocus(on ? focus.filter((x) => x !== st) : focus.length >= 3 ? [...focus.slice(1), st] : [...focus, st])}
              >
                <b className="small">{STAT_LABEL[st]}</b>
                <span className="tiny muted">{STAT_HINT[st]}</span>
              </button>
            );
          })}
        </div>
        <div className="field">
          <label htmlFor="ob-hour">When should Ember have your morning plan ready?</label>
          <select id="ob-hour" className="input" value={morningHour} onChange={(e) => setMorningHour(Number(e.target.value))}>
            {[5, 6, 7, 8, 9, 10, 11].map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <label className="row card" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" className="check" checked={ai} onChange={(e) => setAi(e.target.checked)} />
          <span className="stack" style={{ gap: 2 }}>
            <b className="small">Let Ember write my plan with AI</b>
            <span className="tiny muted">Optional. Your tasks, stats and recent days are sent to Anthropic's Claude to write your morning plan and weekly review. Needs sign-in. You can turn it off any time.</span>
          </span>
        </label>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setStep(0)}>
            Back
          </button>
          <button
            type="button"
            className="btn primary grow"
            onClick={() => {
              setPicks(suggestionsFor(focus));
              setStep(2);
            }}
          >
            Next: pick your first tasks
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="onboard" aria-label="Pick your first tasks">
      <h1>Pick a few to start</h1>
      <p className="muted small">
        A light start beats a big one. These {picks.length} cover each part of life{focus.length ? `, leaning toward ${focus.map((x) => STAT_LABEL[x]).join(', ')}` : ''}; swap any of them. You can hold {slots} Dailies now and gain a slot every 5 levels.
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
          <button type="button" className="btn ghost" onClick={() => setStep(1)}>
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
