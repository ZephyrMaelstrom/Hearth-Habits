import { useState, type ReactNode } from 'react';
import * as A from '../engine/actions';
import { addDays, prettyDay, shortDay } from '../engine/dates';
import { tierOfTask } from '../engine/pricing';
import { levelProgress, STAT_LABEL } from '../engine/progress';
import { RULES } from '../engine/rules';
import { completionFor, habitTaps, liveStreak, scheduledDailies } from '../engine/state';
import type { State, Task, WispMessage } from '../engine/types';
import { unreadCount } from '../engine/wisp';
import { act, useGame } from '../store/store';
import { Bar, Icon } from './components';
import { scheduleText } from './TaskEditor';
import { BossMini, Bounties } from './TodayQuest';

interface Props {
  openQuest: () => void;
  openEditor: (id?: string) => void;
  openWisp: () => void;
  onWispAction: (m: WispMessage, i: number) => void;
  toast: (m: string) => void;
}

export function Today({ openEditor, openWisp, onWispAction, toast, openQuest }: Props) {
  const s = useGame();
  const log = s.days[s.today];
  const lp = levelProgress(s.xp);
  const unread = unreadCount(s);
  const dailies = scheduledDailies(s, s.today);
  const otherDailies = s.tasks.filter((t) => t.type === 'daily' && !t.archived && !t.graduated && !dailies.includes(t));
  const habits = s.tasks.filter((t) => t.type === 'habit' && !t.archived).sort((a, b) => a.order - b.order);
  const todos = s.tasks
    .filter((t) => t.type === 'todo' && !t.archived && (!t.doneDay || t.doneDay === s.today))
    .sort((a, b) => Number(!!a.doneDay) - Number(!!b.doneDay) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.order - b.order);
  const morning = [...s.wisp.messages].reverse().find((m) => m.kind === 'morning' && m.day === s.today && !m.dismissed);
  const rough = log?.rough;
  const doneCount = dailies.filter((t) => completionFor(s, t.id, s.today)).length;
  const [showOther, setShowOther] = useState(false);
  const run = (fn: (st: State) => A.Result) => {
    const err = act(fn);
    if (err) toast(err);
  };

  return (
    <main className="screen" aria-label="Today">
      <header className="between">
        <div className="stack" style={{ gap: 2 }}>
          <span className="small muted">{prettyDay(s.today)}</span>
          <h1>Today</h1>
        </div>
        <div className="row">
          <span className={`chip ${log?.sparkUsed ? 'on' : 'solid'}`} title="Daily Spark">
            <Icon name="flame" size={14} /> {log?.sparkUsed ? 'Spark lit' : `Spark +${RULES.spark}`}
          </span>
          <button type="button" className={`orb ${unread ? 'glow' : ''}`} onClick={openWisp} aria-label={unread ? `Ember has ${unread} new note${unread > 1 ? 's' : ''}` : 'Talk to Ember'}>
            {unread > 0 && <span className="dot">{unread}</span>}
          </button>
        </div>
      </header>

      <section className="stack" aria-label="Progress">
        <div className="between small">
          <span>
            <b>Level {lp.level}</b> <span className="muted">· {s.profile.name}</span>
          </span>
          <span className="muted">{Math.ceil(lp.toNext)} XP to level {lp.level + 1}</span>
        </div>
        <Bar value={lp.into / lp.need} label={`Level progress ${Math.floor(lp.into)} of ${lp.need} XP`} />
        <div className="meters">
          <div className="meter">
            <span>Momentum</span>
            <b>{s.momentum.toFixed(2)}×</b>
          </div>
          <div className="meter">
            <span>This week</span>
            <b>
              {Math.round(s.week.selfCounted).toLocaleString('en-US')} / {RULES.weekCap.toLocaleString('en-US')}
            </b>
          </div>
          <div className="meter">
            <span>Gold</span>
            <b>{s.gold.toLocaleString('en-US')}</b>
          </div>
        </div>
      </section>

      {s.vacationUntil && (
        <div className="card warm between">
          <p className="small">Vacation mode until {shortDay(s.vacationUntil)}. Momentum and streaks are frozen.</p>
          <button type="button" className="btn small" onClick={() => run((st) => A.setVacation(st, null))}>
            End
          </button>
        </div>
      )}

      {morning && (
        <div className="card wisp-msg" aria-live="polite">
          <div className="mini-orb" aria-hidden="true" />
          <div className="stack grow">
            <p>{morning.text}</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {morning.actions.map((a, i) => (
                <button key={i} type="button" className="btn small primary" onClick={() => onWispAction(morning, i)}>
                  {a.label}
                </button>
              ))}
              <button type="button" className="btn small ghost" onClick={() => act((st) => A.dismissMessage(st, morning.id, false))}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <BossMini s={s} open={openQuest} />
      <Bounties s={s} toast={toast} />

      <section className="stack" aria-labelledby="dailies-h">
        <div className="section-head">
          <h2 id="dailies-h">Dailies</h2>
          <span className="small muted">
            {doneCount} of {dailies.length} done
          </span>
        </div>
        {rough && (
          <div className="card warm between">
            <p className="small">Rough day: only your top {RULES.rough.keep} Dailies count for Momentum today.</p>
            <button type="button" className="btn small" onClick={() => run(A.endRoughDay)}>
              Undo
            </button>
          </div>
        )}
        <div className="tasks">
          {dailies.map((t) => (
            <DailyRow key={t.id} s={s} t={t} excused={!!rough && !rough.keep.includes(t.id)} onEdit={() => openEditor(t.id)} run={run} />
          ))}
          {!dailies.length && <p className="empty">No Dailies scheduled today.</p>}
        </div>
        {otherDailies.length > 0 && (
          <button type="button" className="link-btn" aria-expanded={showOther} onClick={() => setShowOther(!showOther)}>
            {showOther ? 'Hide' : 'Show'} {otherDailies.length} not due today
          </button>
        )}
        {showOther && (
          <div className="tasks">
            {otherDailies.map((t) => (
              <div key={t.id} className="task">
                <div className="grow">
                  <div className="task-title muted">{t.title}</div>
                  <div className="task-meta">{scheduleText(t.days)}</div>
                </div>
                <button type="button" className="icon-btn" aria-label={`Edit ${t.title}`} onClick={() => openEditor(t.id)}>
                  <Icon name="edit" size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
        {!rough && dailies.length > RULES.rough.keep && s.rough.used < RULES.rough.perMonth && (
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => run(A.startRoughDay)}>
            Rough day? Keep just the top {RULES.rough.keep} ({RULES.rough.perMonth - s.rough.used} left this month)
          </button>
        )}
      </section>

      <section className="stack" aria-labelledby="habits-h">
        <div className="section-head">
          <h2 id="habits-h">Habits</h2>
        </div>
        <div className="tasks">
          {habits.map((t) => (
            <HabitRow key={t.id} s={s} t={t} onEdit={() => openEditor(t.id)} run={run} />
          ))}
          {!habits.length && <p className="empty">No habits yet.</p>}
        </div>
      </section>

      <section className="stack" aria-labelledby="todos-h">
        <div className="section-head">
          <h2 id="todos-h">To-dos</h2>
        </div>
        <div className="tasks">
          {todos.map((t) => (
            <TodoRow key={t.id} s={s} t={t} onEdit={() => openEditor(t.id)} run={run} />
          ))}
          {!todos.length && <p className="empty">Nothing on the list.</p>}
        </div>
      </section>

      <button type="button" className="btn primary" onClick={() => openEditor()}>
        <Icon name="plus" size={18} /> Add a task
      </button>
      {s.week.selfCounted >= RULES.weekCap && (
        <p className="tiny muted">This week's XP cap is reached. Tasks still build streaks and Momentum; XP returns Monday.</p>
      )}
    </main>
  );
}

type Run = (fn: (st: State) => A.Result) => void;

function Meta({ t, extra }: { t: Task; extra?: ReactNode }) {
  const tier = tierOfTask(t);
  return (
    <div className="task-meta">
      <span className={`tier-${tier.name}`}>{tier.name}</span>
      <span>{t.stats.map((x) => STAT_LABEL[x]).join(' + ')}</span>
      {extra}
    </div>
  );
}

function DailyRow({ s, t, excused, onEdit, run }: { s: State; t: Task; excused: boolean; onEdit: () => void; run: Run }) {
  const done = !!completionFor(s, t.id, s.today);
  const resting = !!t.restDays?.includes(s.today);
  const streak = liveStreak(s, t);
  const id = `d-${t.id}`;
  return (
    <div className={`task ${done ? 'done' : ''}`}>
      <input
        id={id}
        type="checkbox"
        className="check"
        checked={done}
        onChange={() => run((st) => (done ? A.uncompleteTask(st, t.id) : A.completeTask(st, t.id)))}
      />
      <label htmlFor={id} className="grow">
        <div className="task-title">{t.title}</div>
        <Meta
          t={t}
          extra={
            <>
              {streak > 0 && (
                <span>
                  <Icon name="flame" size={12} /> {streak}
                </span>
              )}
              {resting && <span className="chip">Rest day</span>}
              {excused && !done && <span className="chip">Excused</span>}
            </>
          }
        />
      </label>
      <button type="button" className="icon-btn" aria-label={`Edit ${t.title}`} onClick={onEdit}>
        <Icon name="edit" size={18} />
      </button>
    </div>
  );
}

function HabitRow({ s, t, onEdit, run }: { s: State; t: Task; onEdit: () => void; run: Run }) {
  const plus = habitTaps(s, t.id, s.today, 'habitPlus');
  const minus = habitTaps(s, t.id, s.today, 'habitMinus');
  return (
    <div className="task">
      <div className="grow">
        <div className="task-title">{t.title}</div>
        <Meta
          t={t}
          extra={
            <>
              {(plus > 0 || minus > 0) && (
                <span>
                  Today: {plus > 0 ? `+${plus}` : ''}
                  {plus > 0 && minus > 0 ? ' ' : ''}
                  {minus > 0 ? `−${minus}` : ''}
                  {plus > RULES.habitTapsPaid ? ` (${RULES.habitTapsPaid} paid)` : ''}
                </span>
              )}
              {plus > 0 && (
                <button type="button" className="link-btn" style={{ padding: 0 }} onClick={() => run((st) => A.undoLastHabit(st, t.id, 'habitPlus'))}>
                  Undo +
                </button>
              )}
              {minus > 0 && (
                <button type="button" className="link-btn" style={{ padding: 0 }} onClick={() => run((st) => A.undoLastHabit(st, t.id, 'habitMinus'))}>
                  Undo −
                </button>
              )}
            </>
          }
        />
      </div>
      <div className="habit-btns">
        {t.positive !== false && (
          <button type="button" aria-label={`Did ${t.title}`} onClick={() => run((st) => A.tapHabit(st, t.id, 1))}>
            +
          </button>
        )}
        {t.negative && (
          <button type="button" className="minus" aria-label={`Slipped: ${t.title}`} onClick={() => run((st) => A.tapHabit(st, t.id, -1))}>
            −
          </button>
        )}
      </div>
      <button type="button" className="icon-btn" aria-label={`Edit ${t.title}`} onClick={onEdit}>
        <Icon name="edit" size={18} />
      </button>
    </div>
  );
}

function TodoRow({ s, t, onEdit, run }: { s: State; t: Task; onEdit: () => void; run: Run }) {
  const done = t.doneDay === s.today;
  const id = `t-${t.id}`;
  const dueLabel = !t.due ? '' : t.due < s.today ? 'Overdue' : t.due === s.today ? 'Due today' : t.due === addDays(s.today, 1) ? 'Tomorrow' : shortDay(t.due);
  return (
    <div className={`task ${done ? 'done' : ''}`}>
      <input id={id} type="checkbox" className="check" checked={done} onChange={() => run((st) => (done ? A.uncompleteTask(st, t.id) : A.completeTask(st, t.id)))} />
      <label htmlFor={id} className="grow">
        <div className="task-title">{t.title}</div>
        <Meta
          t={t}
          extra={
            <>
              {dueLabel && <span style={dueLabel === 'Overdue' ? { color: 'var(--accent)' } : undefined}>{dueLabel}</span>}
              {t.createdDay === s.today && !done && <span>Half pay today</span>}
            </>
          }
        />
      </label>
      <button type="button" className="icon-btn" aria-label={`Edit ${t.title}`} onClick={onEdit}>
        <Icon name="edit" size={18} />
      </button>
    </div>
  );
}
