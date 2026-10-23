import { useState, useSyncExternalStore } from 'react';
import * as A from '../engine/actions';
import { addDays, shortDay } from '../engine/dates';
import { reportText, testerReport } from '../engine/metrics';
import { RULES } from '../engine/rules';
import type { State, Tone } from '../engine/types';
import { KIND_LABEL } from '../engine/wisp';
import { canInstall, isStandalone, onInstallChange, promptInstall } from '../store/install';
import { act, replaceFromImport, resetAll, useGame } from '../store/store';
import { signIn, signOut, syncConfigured, syncInfo, useSync } from '../store/sync';

export const TONES: { id: Tone; label: string; sample: string }[] = [
  { id: 'cheerful', label: 'Cheerful', sample: '"30 days of walks in a row. That\'s how habits stick!"' },
  { id: 'dry', label: 'Dry', sample: '"Walks: 30 days straight. Suspiciously consistent."' },
  { id: 'stoic', label: 'Stoic', sample: '"Walks: 30 days. The habit holds."' },
  { id: 'gentle', label: 'Gentle', sample: '"30 days of walks. Quietly, it\'s becoming part of you."' },
];

const TALK = ['Silent unless asked', 'One note a day at most', 'Two notes a day (default)', 'Three notes a day', 'Four notes a day'];

export function Settings({ toast }: { toast: (m: string) => void }) {
  const s = useGame();
  const [name, setName] = useState(s.profile.name);
  const [until, setUntil] = useState(addDays(s.today, 6));
  const report = testerReport(s);
  const archived = s.tasks.filter((t) => t.archived);
  const run = (fn: (st: State) => A.Result, ok?: string) => {
    const err = act(fn);
    if (err || ok) toast(err ?? ok ?? '');
  };

  return (
    <main className="screen" aria-label="Settings">
      <h1>Settings</h1>

      <section className="card stack" aria-labelledby="you-h">
        <h2 id="you-h">You and Ember</h2>
        <div className="field">
          <label htmlFor="set-name">Name</label>
          <div className="row">
            <input id="set-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="btn small" onClick={() => run((st) => A.updateProfile(st, { name: name.trim() || st.profile.name }), 'Saved.')}>
              Save
            </button>
          </div>
        </div>
        <div className="field">
          <span className="label">Ember's tone</span>
          <div className="tone-grid">
            {TONES.map((t) => (
              <button key={t.id} type="button" className="tone" aria-pressed={s.profile.tone === t.id} onClick={() => run((st) => A.updateProfile(st, { tone: t.id }))}>
                <b className="small">{t.label}</b>
                <span className="tiny muted">{t.sample}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="between">
            <label htmlFor="set-talk">Talkativeness</label>
            <span className="small">{TALK[s.profile.talk - 1]}</span>
          </div>
          <input id="set-talk" className="slider" type="range" min={1} max={5} value={s.profile.talk} onChange={(e) => run((st) => A.updateProfile(st, { talk: Number(e.target.value) }))} />
          <span className="tiny muted">Counts notes Ember starts on her own. Your morning plan and weekly review don't count.</span>
        </div>
        <label className="between">
          <span>
            Morning plan
            <br />
            <span className="tiny muted">A short plan for the day when you first open the app.</span>
          </span>
          <input type="checkbox" className="check" checked={s.profile.morningPlan} onChange={(e) => run((st) => A.updateProfile(st, { morningPlan: e.target.checked }))} />
        </label>
        {s.wisp.muted.length > 0 && (
          <div className="stack">
            <span className="label">Muted notes</span>
            {s.wisp.muted.map((k) => (
              <div key={k} className="between">
                <span className="small">{KIND_LABEL[k]}</span>
                <button type="button" className="btn small" onClick={() => run((st) => A.unmuteKind(st, k), `${KIND_LABEL[k]} notes are back on.`)}>
                  Unmute
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card stack" aria-labelledby="vac-h">
        <h2 id="vac-h">Vacation mode</h2>
        <p className="small muted">Freezes Momentum and streaks for up to {RULES.vacationMaxDays} days. Rough days left this month: {RULES.rough.perMonth - s.rough.used}.</p>
        {s.vacationUntil ? (
          <div className="between">
            <span className="small">On until {shortDay(s.vacationUntil)}</span>
            <button type="button" className="btn small" onClick={() => run((st) => A.setVacation(st, null), 'Vacation mode is off.')}>
              End now
            </button>
          </div>
        ) : (
          <div className="row">
            <input type="date" className="input" aria-label="Vacation until" value={until} min={s.today} max={addDays(s.today, RULES.vacationMaxDays - 1)} onChange={(e) => setUntil(e.target.value)} />
            <button type="button" className="btn small" onClick={() => run((st) => A.setVacation(st, until), `Vacation mode on until ${shortDay(until)}.`)}>
              Start
            </button>
          </div>
        )}
      </section>

      <SyncCard toast={toast} />
      <InstallCard />

      <section className="card stack" aria-labelledby="test-h">
        <h2 id="test-h">Tester report (Gate 1)</h2>
        <p className="small muted">
          {report.window.from} to {report.window.to}
        </p>
        <div className="list">
          <div className="between">
            <span className="small">Days opened (target 12 of 14)</span>
            <b className="small" style={{ color: report.openedOk ? 'var(--good)' : undefined }}>
              {report.daysOpened} of 14
            </b>
          </div>
          <div className="between">
            <span className="small">Dailies done, week 1 then week 2</span>
            <b className="small" style={{ color: report.improvedOk ? 'var(--good)' : undefined }}>
              {report.week1.done} → {report.week2.done}
            </b>
          </div>
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            navigator.clipboard
              ?.writeText(reportText(report))
              .then(() => toast('Report copied. Paste it into a message to send it.'))
              .catch(() => toast('Copy failed. Use Export below instead.'))
          }
        >
          Copy report
        </button>
      </section>

      {archived.length > 0 && (
        <section className="card stack" aria-labelledby="arch-h">
          <h2 id="arch-h">Archived tasks</h2>
          <div className="list">
            {archived.map((t) => (
              <div key={t.id} className="between">
                <span className="small grow">{t.title}</span>
                <button type="button" className="btn small" onClick={() => run((st) => A.restoreTask(st, t.id), `Restored "${t.title}".`)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card stack" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="small muted">Saved on this device{syncConfigured ? ', and in the cloud when you sign in' : ''}.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn small" onClick={() => exportData(s)}>
            Export
          </button>
          <label className="btn small">
            Import
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  replaceFromImport(JSON.parse(await f.text()));
                  toast('Imported.');
                } catch {
                  toast('That file is not a Hearth & Habits export.');
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn small danger"
            onClick={() => {
              if (confirm('Erase everything on this device and start over? Export first if you want a copy.')) resetAll();
            }}
          >
            Start over
          </button>
        </div>
      </section>

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        Hearth &amp; Habits · Phase 1 build · rules from Phase 0 (weekly cap {RULES.weekCap.toLocaleString('en-US')}, Spark +{RULES.spark})
      </p>
    </main>
  );
}

function exportData(s: State) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hearth-habits-${s.today}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SyncCard({ toast }: { toast: (m: string) => void }) {
  useSync();
  const { status, userLabel, lastError } = syncInfo();
  return (
    <section className="card stack" aria-labelledby="sync-h">
      <h2 id="sync-h">Sync across devices</h2>
      {!syncConfigured && <p className="small muted">Sync isn't set up for this build yet. Your game is saved on this device; Export makes a backup.</p>}
      {syncConfigured && status === 'loading' && <p className="small muted">Connecting…</p>}
      {syncConfigured && (status === 'signed-out' || (status === 'error' && !userLabel)) && (
        <>
          <p className="small muted">Sign in to keep your game on every device and in the tester report.</p>
          <button type="button" className="btn primary" onClick={() => signIn().catch(() => toast('Sign-in failed.'))}>
            Sign in with Google
          </button>
        </>
      )}
      {syncConfigured && (status === 'synced' || status === 'syncing') && (
        <div className="between">
          <span className="small">
            {status === 'synced' ? 'Synced' : 'Syncing…'} as {userLabel}
          </span>
          <button type="button" className="btn small" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      )}
      {status === 'error' && <p className="small" style={{ color: 'var(--danger)' }}>Sync error: {lastError}</p>}
    </section>
  );
}

function InstallCard() {
  const installable = useSyncExternalStore(onInstallChange, canInstall, () => false);
  if (isStandalone()) return null;
  return (
    <section className="card stack" aria-labelledby="inst-h">
      <h2 id="inst-h">Install the app</h2>
      {installable ? (
        <button type="button" className="btn primary" onClick={() => promptInstall()}>
          Install Hearth &amp; Habits
        </button>
      ) : (
        <p className="small muted">
          iPhone: tap Share, then Add to Home Screen. Android: open the browser menu, then Install app or Add to Home screen.
        </p>
      )}
    </section>
  );
}
