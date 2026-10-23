import { useMemo, useState } from 'react';
import * as A from '../engine/actions';
import { markStep } from '../engine/companion';
import { LIBRARY, type LibraryTask } from '../engine/library';
import { tierFor } from '../engine/pricing';
import { STAT_LABEL } from '../engine/progress';
import { addDays, WEEKDAY_SHORT } from '../engine/dates';
import { completionFor } from '../engine/state';
import { STATS, type Stat, type TaskType } from '../engine/types';
import { act, useGame } from '../store/store';
import { Icon, Sheet, StatChips } from './components';

const TYPES: { id: TaskType; label: string; hint: string }[] = [
  { id: 'daily', label: 'Daily', hint: 'On set days. Counts toward Momentum.' },
  { id: 'habit', label: 'Habit', hint: 'Tap + or − whenever it happens.' },
  { id: 'todo', label: 'To-do', hint: 'Once. Finishing it the day you add it pays half.' },
];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function scheduleText(days?: number[]) {
  if (!days?.length) return '';
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '0,6') return 'Weekends';
  return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

export function TaskEditor({ taskId, onClose, toast }: { taskId?: string; onClose: () => void; toast: (m: string) => void }) {
  const s = useGame();
  const existing = taskId ? s.tasks.find((t) => t.id === taskId) : undefined;
  const [tab, setTab] = useState<'own' | 'library'>('own');
  const [type, setType] = useState<TaskType>(existing?.type ?? 'daily');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [effort, setEffort] = useState(existing?.effort ?? 2);
  const [minutes, setMinutes] = useState(existing?.minutes ?? 15);
  const [dread, setDread] = useState(existing?.dread ?? 2);
  const [stats, setStats] = useState<Stat[]>(existing?.stats ?? ['mind']);
  const [days, setDays] = useState<number[]>(existing?.days ?? ALL_DAYS);
  const [due, setDue] = useState<string>(existing?.due ?? '');
  const [positive, setPositive] = useState(existing?.positive ?? true);
  const [negative, setNegative] = useState(existing?.negative ?? false);
  const [libraryId, setLibraryId] = useState<number | undefined>(existing?.libraryId);
  const [error, setError] = useState('');

  const tier = tierFor(effort, minutes, dread);
  const doneToday = existing ? !!completionFor(s, existing.id, s.today) : false;
  const restingToday = !!existing?.restDays?.includes(s.today);

  function fromLibrary(t: LibraryTask) {
    setType(t.type);
    setTitle(t.title);
    setEffort(t.effort);
    setMinutes(t.minutes);
    setDread(t.dread);
    setStats([t.stat]);
    setDays(t.days ?? ALL_DAYS);
    setLibraryId(t.id);
    setTab('own');
  }

  function save() {
    const d: A.TaskDraft = {
      type,
      title,
      effort,
      minutes,
      dread,
      stats,
      days: type === 'daily' ? days : undefined,
      due: type === 'todo' ? due || null : undefined,
      positive: type === 'habit' ? positive : undefined,
      negative: type === 'habit' ? negative : undefined,
      libraryId,
      lifeSkill: libraryId ? LIBRARY.find((l) => l.id === libraryId)?.skill ?? undefined : undefined,
    };
    const err = existing ? act((st) => A.updateTask(st, existing.id, d)) : act((st) => A.addTask(st, d));
    if (!err && !existing) act((st) => markStep(st, 'own'));
    if (err) return setError(err);
    toast(existing ? 'Saved.' : `Added "${title.trim()}".`);
    onClose();
  }

  return (
    <Sheet title={existing ? 'Edit task' : 'New task'} onClose={onClose}>
      {!existing && (
        <div className="seg" role="group" aria-label="Source">
          <button type="button" aria-pressed={tab === 'own'} onClick={() => setTab('own')}>
            Write my own
          </button>
          <button type="button" aria-pressed={tab === 'library'} onClick={() => setTab('library')}>
            From library
          </button>
        </div>
      )}

      {tab === 'library' ? (
        <LibraryPicker onPick={fromLibrary} />
      ) : (
        <>
          {!existing && (
            <div className="field">
              <span className="label">Type</span>
              <div className="seg" role="group" aria-label="Task type">
                {TYPES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="tiny muted">{TYPES.find((t) => t.id === type)?.hint}</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="task-title">Task</label>
            <input
              id="task-title"
              className="input"
              value={title}
              maxLength={120}
              placeholder={type === 'daily' ? 'After I ___, I will ___' : 'What will you do?'}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <Slider id="effort" label="Effort" value={effort} min={1} max={5} onChange={setEffort} note={['Barely any', 'Light', 'Some', 'Hard', 'Very hard'][effort - 1]} />
          <Slider id="minutes" label="Minutes" value={minutes} min={1} max={120} onChange={setMinutes} note={`${minutes} min`} />
          <Slider id="dread" label="Dread (how much you don't want to)" value={dread} min={1} max={5} onChange={setDread} note={['None', 'A little', 'Some', 'A lot', 'Major'][dread - 1]} />

          <div className="price-preview" aria-live="polite">
            <div className="stack" style={{ gap: 2 }}>
              <span className="tiny muted">The engine prices it</span>
              <b className={`tier-${tier.name}`}>{tier.name}</b>
            </div>
            <span className="small muted">
              {tier.xp} XP · {tier.gold} gold · score {tier.score}
            </span>
          </div>

          <div className="field">
            <span className="label">Stats it grows (up to 2)</span>
            <StatChips value={stats} onChange={setStats} />
          </div>

          {type === 'daily' && (
            <div className="field">
              <span className="label">Days</span>
              <div className="days" role="group" aria-label="Scheduled days">
                {ALL_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    aria-label={WEEKDAY_SHORT[d]}
                    onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}
                  >
                    {WEEKDAY_SHORT[d].slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {type === 'habit' && (
            <div className="field">
              <span className="label">Buttons</span>
              <div className="chips">
                <button type="button" className={`chip ${positive ? 'on' : ''}`} aria-pressed={positive} onClick={() => setPositive(!positive)}>
                  + Good habit
                </button>
                <button type="button" className={`chip ${negative ? 'on' : ''}`} aria-pressed={negative} onClick={() => setNegative(!negative)}>
                  − Bad habit
                </button>
              </div>
              <span className="tiny muted">The first 3 + taps a day pay XP. A − tap lowers that day's Momentum target a little; it never costs XP.</span>
            </div>
          )}
          {type === 'todo' && (
            <div className="field">
              <label htmlFor="task-due">Due (optional)</label>
              <input id="task-due" type="date" className="input" value={due} min={s.today} onChange={(e) => setDue(e.target.value)} />
              <div className="row">
                <button type="button" className="link-btn" onClick={() => setDue(s.today)}>
                  Today
                </button>
                <button type="button" className="link-btn" onClick={() => setDue(addDays(s.today, 1))}>
                  Tomorrow
                </button>
                {due && (
                  <button type="button" className="link-btn" onClick={() => setDue('')}>
                    No date
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button type="button" className="btn primary" onClick={save}>
            {existing ? 'Save changes' : 'Add task'}
          </button>

          {existing && (
            <div className="stack">
              {existing.type === 'daily' && !doneToday && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    act((st) => A.restToday(st, existing.id));
                    toast(restingToday ? 'Back on for today.' : 'Planned rest today. It won\'t count against Momentum.');
                    onClose();
                  }}
                >
                  <Icon name="moon" size={18} /> {restingToday ? 'Undo rest day' : 'Rest day today'}
                </button>
              )}
              <div className="row">
                <button type="button" className="btn ghost small grow" onClick={() => act((st) => A.moveTask(st, existing.id, -1))}>
                  <Icon name="up" size={16} /> Move up
                </button>
                <button type="button" className="btn ghost small grow" onClick={() => act((st) => A.moveTask(st, existing.id, 1))}>
                  <Icon name="down" size={16} /> Move down
                </button>
              </div>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  act((st) => A.archiveTask(st, existing.id));
                  toast(`Archived "${existing.title}". Restore it from Settings.`);
                  onClose();
                }}
              >
                Archive task
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function Slider({ id, label, value, min, max, onChange, note }: { id: string; label: string; value: number; min: number; max: number; onChange: (n: number) => void; note: string }) {
  return (
    <div className="field">
      <div className="between">
        <label htmlFor={id}>{label}</label>
        <span className="small">{note}</span>
      </div>
      <input id={id} className="slider" type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function LibraryPicker({ onPick }: { onPick: (t: LibraryTask) => void }) {
  const [q, setQ] = useState('');
  const [stat, setStat] = useState<Stat | 'all'>('all');
  const list = useMemo(
    () => LIBRARY.filter((t) => (stat === 'all' || t.stat === stat) && t.title.toLowerCase().includes(q.toLowerCase())),
    [q, stat],
  );
  return (
    <div className="stack">
      <input className="input" placeholder="Search 100 starter tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
      <div className="chips" role="group" aria-label="Filter by stat">
        <button type="button" className={`chip ${stat === 'all' ? 'on' : ''}`} aria-pressed={stat === 'all'} onClick={() => setStat('all')}>
          All
        </button>
        {STATS.map((st) => (
          <button key={st} type="button" className={`chip ${stat === st ? 'on' : ''}`} aria-pressed={stat === st} onClick={() => setStat(st)}>
            {STAT_LABEL[st]}
          </button>
        ))}
      </div>
      <div className="list">
        {list.map((t) => (
          <button key={t.id} type="button" className="pick" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line-soft)', textAlign: 'left', width: '100%' }} onClick={() => onPick(t)}>
            <div className="grow">
              <div className="task-title">{t.title}</div>
              <div className="task-meta">
                <span className={`tier-${t.tier}`}>{t.tier}</span>
                <span>{STAT_LABEL[t.stat]}</span>
                <span>{t.type === 'daily' ? scheduleText(t.days) : t.type === 'habit' ? 'Habit' : 'To-do'}</span>
              </div>
            </div>
          </button>
        ))}
        {!list.length && <p className="empty">No matches.</p>}
      </div>
    </div>
  );
}
