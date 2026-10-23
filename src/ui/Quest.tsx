import { useMemo, useState } from 'react';
import { addDays, shortDay, WEEKDAY_SHORT, weekday, weekStart } from '../engine/dates';
import { bossWeekLabel, currentFight, type Fight } from '../engine/boss';
import { BOSSES } from '../engine/content/bosses';
import { CLASSES, skillCost, SKILLS } from '../engine/content/classes';
import { profile } from '../engine/combat';
import * as E from '../engine/epics';
import * as G from '../engine/game';
import * as SO from '../engine/social';
import { ITEM_SLOTS, ITEM_SLOT_LABEL } from '../engine/content/gear';
import { levelFromXp, STAT_LABEL } from '../engine/progress';
import { P2, unlocked, UNLOCKS } from '../engine/rules';
import type { Epic, ItemSlot, MemberSummary, State } from '../engine/types';
import { act, useGame } from '../store/store';
import { createParty, joinParty, leaveParty, usePartyStatus, partyStatus } from '../store/party';
import { syncConfigured, useSync, syncInfo } from '../store/sync';
import { Bar, BossArt, Icon, Locked, Sheet } from './components';

type Toast = (m: string) => void;
const lvl = (id: string) => UNLOCKS.find((u) => u.id === id)!.level;

export function Quest({ toast, goSettings }: { toast: Toast; goSettings: () => void }) {
  const s = useGame();
  const level = levelFromXp(s.xp);
  const fight = useMemo(() => currentFight(s), [s]);
  return (
    <main className="screen" aria-label="Quest">
      <h1>Quest</h1>
      {!unlocked(level, 'boss') || !fight ? (
        <Locked what="The weekly boss" level={lvl('boss')}>
          Every task you finish will hit it, and loot starts dropping.
        </Locked>
      ) : (
        <BossPanel s={s} fight={fight} toast={toast} />
      )}
      <LastResult s={s} />
      {unlocked(level, 'party') ? <PartyPanel s={s} toast={toast} goSettings={goSettings} /> : <Locked what="Parties" level={lvl('party')}>Fight one boss together with 2 to 6 friends.</Locked>}
      {unlocked(level, 'epics') ? <EpicsPanel s={s} toast={toast} /> : <Locked what="Epics" level={lvl('epics')}>Turn a months-long goal into milestones with a finish-date projection.</Locked>}
    </main>
  );
}

// ------------------------------------------------------------------ boss

function BossPanel({ s, fight, toast }: { s: State; fight: Fight; toast: Toast }) {
  const def = BOSSES[fight.boss];
  const meId = s.party?.uid ?? s.profile.deviceId;
  const me = fight.members.find((m) => m.uid === meId);
  const p = profile(s);
  const cls = s.cls ? CLASSES[s.cls.id] : null;
  const skill = cls ? SKILLS[cls.skill] : null;
  const cost = skill ? skillCost(skill.id, p.effects) : 0;
  const pct = fight.hp / fight.maxHp;
  const run = (fn: (st: State) => import('../engine/actions').Result) => {
    const err = act(fn);
    if (err) toast(err);
  };
  return (
    <section className="card stack" aria-labelledby="boss-h">
      <div className="boss-card">
        <BossArt boss={fight.boss} size={84} hurt={1 - pct} />
        <div className="stack grow" style={{ gap: 4 }}>
          <span className="tiny muted">
            {fight.members.length > 1 ? 'Party boss' : 'Shadow boss (solo)'} · {bossWeekLabel(fight.week)}
          </span>
          <h2 id="boss-h">{def.name}</h2>
          <Bar value={pct} label={`${def.name} HP ${fight.hp} of ${fight.maxHp}`} color="#d96a5a" tall />
          <span className="small">
            {fight.wonDay ? (
              <b style={{ color: 'var(--good)' }}>Defeated {shortDay(fight.wonDay)}!</b>
            ) : (
              <>
                <b>{fight.hp.toLocaleString('en-US')}</b> <span className="muted">/ {fight.maxHp.toLocaleString('en-US')} HP</span>
              </>
            )}
          </span>
        </div>
      </div>
      <p className="small muted">{def.mechanic}</p>
      <DayStrip fight={fight} today={s.today} />
      {!fight.wonDay && fight.todayRatio !== null && (
        <p className={`small ${fight.todayRatio < P2.boss.strikeBelow ? '' : 'muted'}`}>
          {fight.members.length > 1 ? 'Party' : 'You'}: {Math.round(fight.todayRatio * 100)}% of today's Dailies so far.{' '}
          {fight.todayRatio < P2.boss.strikeBelow ? `Below ${Math.round(P2.boss.strikeBelow * 100)}% at the reset, the boss strikes.` : 'Safe from tonight’s strike.'}
          {fight.shieldPending > 0 && ' Shield Wall is up.'}
        </p>
      )}
      {me && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="between small">
            <span>
              <Icon name="heart" size={14} /> Your HP {me.downed && <span className="badge warn">Downed: half damage</span>}
            </span>
            <span className="muted">
              {me.hp} / {me.maxHp} · dealt {me.damage.toLocaleString('en-US')}
            </span>
          </div>
          <Bar value={me.hp / me.maxHp} label={`Your HP ${me.hp} of ${me.maxHp}`} color="var(--good)" />
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {skill && (
          <button
            type="button"
            className="btn small primary"
            disabled={s.mana < cost || (skill.id === 'arcaneSurge' && s.combat.surgeArmed) || !!fight.wonDay}
            onClick={() => run((st) => G.castSkill(st, skill.id))}
            title={skill.desc}
          >
            {skill.name} · {cost} Mana
          </button>
        )}
        {(me?.downed || (me && me.hp < me.maxHp)) && (
          <button type="button" className="btn small" disabled={s.bag.healing <= 0} onClick={() => run(G.usePotion)}>
            Healing potion ({s.bag.healing})
          </button>
        )}
        {s.cls && (
          <span className="small muted">
            Mana {Math.floor(s.mana)} / {p.maxMana}
          </span>
        )}
      </div>
      {skill && <p className="tiny muted">{skill.desc}{skill.id === 'arcaneSurge' && s.combat.surgeArmed ? ' (Ready.)' : ''}</p>}
      {!s.cls && <p className="tiny muted">Classes open at level 10 and bring a skill to use here.</p>}
    </section>
  );
}

function DayStrip({ fight, today }: { fight: Fight; today: string }) {
  const cells = Array.from({ length: 7 }, (_, i) => addDays(fight.week, i));
  return (
    <div className="day-strip" aria-label="This week, day by day">
      {cells.map((d) => {
        const fd = fight.days.find((x) => x.day === d);
        const marks: string[] = [];
        if (fd?.strike === 'hit') marks.push('Struck');
        if (fd?.strike === 'blocked') marks.push('Blocked');
        if (fd?.shielded) marks.push('Shielded');
        if (fd?.healed) marks.push(`+${fd.healed} HP`);
        if (fd?.gremlin) marks.push('Robbed');
        if (fight.wonDay === d) marks.push('Won!');
        return (
          <div key={d} className={`day-cell ${d === today ? 'today' : ''}`} title={marks.join(', ')}>
            <span>{WEEKDAY_SHORT[weekday(d)]}</span>
            <b>{fd ? fd.damage : '·'}</b>
            <span className="mark" style={{ color: fd?.strike === 'hit' || fd?.gremlin ? 'var(--danger)' : fight.wonDay === d ? 'var(--good)' : 'var(--muted)' }}>
              {marks[0] ?? ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LastResult({ s }: { s: State }) {
  const r = [...s.combat.results].reverse().find((x) => x.week < weekStart(s.today));
  if (!r) return null;
  const def = BOSSES[r.boss];
  return (
    <div className="card between">
      <div className="stack" style={{ gap: 2 }}>
        <span className="tiny muted">Last week</span>
        <b>
          {def.name}: {r.won ? `defeated ${r.wonDay ? shortDay(r.wonDay) : ''}` : 'got away'}
        </b>
        <span className="tiny muted">
          You dealt {Math.round(r.damage).toLocaleString('en-US')} · {r.strikes} strike{r.strikes === 1 ? '' : 's'}
          {r.gremlinGold > 0 ? ` · the Gremlin kept ${r.gremlinGold} gold` : ''}
        </span>
      </div>
      <span className={`badge ${r.won ? 'good' : ''}`}>{r.won ? 'Won' : 'Lost'}</span>
    </div>
  );
}

// ------------------------------------------------------------------ party

function PartyPanel({ s, toast, goSettings }: { s: State; toast: Toast; goSettings: () => void }) {
  useSync();
  usePartyStatus();
  const sync = syncInfo();
  const ps = partyStatus();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const signedIn = sync.status === 'synced' || sync.status === 'syncing';
  const go = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    if (err) toast(err);
  };

  if (!s.party) {
    return (
      <section className="card stack" aria-labelledby="party-h">
        <h2 id="party-h">Party</h2>
        <p className="small muted">Team up with 2 to 6 friends against one boss. Teammates see your level, class, stat shape and boss damage, never your task names.</p>
        {!syncConfigured || !signedIn ? (
          <>
            <p className="small">Parties need you signed in, so the game can share your weekly summary.</p>
            <button type="button" className="btn" onClick={goSettings}>
              Sign in from Settings
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="party-name">Start a party</label>
              <div className="row">
                <input id="party-name" className="input" value={name} maxLength={40} placeholder="The Siblings" onChange={(e) => setName(e.target.value)} />
                <button type="button" className="btn primary" disabled={busy} onClick={() => go(() => createParty(name))}>
                  Create
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="party-code">Or join with a code</label>
              <div className="row">
                <input id="party-code" className="input code" style={{ fontSize: 16 }} value={code} maxLength={6} placeholder="ABC123" autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
                <button type="button" className="btn" disabled={busy} onClick={() => go(() => joinParty(code))}>
                  Join
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  const others = s.partyView?.members ?? [];
  const rescueUsed = SO.rescueGivenToday(s);
  return (
    <section className="card stack" aria-labelledby="party-h">
      <div className="between">
        <h2 id="party-h">{s.party.name}</h2>
        <span className={`badge ${ps.status === 'live' ? 'good' : ps.status === 'error' ? 'warn' : ''}`}>{ps.status === 'live' ? 'Live' : ps.status === 'error' ? 'Error' : 'Connecting'}</span>
      </div>
      {ps.status === 'error' && <p className="small" style={{ color: 'var(--danger)' }}>{ps.lastError}</p>}
      <div className="between">
        <div className="stack" style={{ gap: 0 }}>
          <span className="tiny muted">Party code</span>
          <span className="code">{s.party.code}</span>
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const text = `Join my Hearth & Habits party: code ${s.party!.code}. ${location.href.split('#')[0]}`;
            if (navigator.share) navigator.share({ text }).catch(() => undefined);
            else navigator.clipboard?.writeText(text).then(() => toast('Invite copied.'));
          }}
        >
          <Icon name="copy" size={16} /> Invite
        </button>
      </div>
      <div>
        <Member s={s} m={null} />
        {others.map((m) => (
          <Member key={m.uid} s={s} m={m} rescueUsed={rescueUsed} toast={toast} />
        ))}
        {!others.length && <p className="small muted">No teammates yet. Send them the code.</p>}
      </div>
      {s.social.pendingRescue && (
        <p className="small">
          Your next finished task will Rescue {others.find((m) => m.uid === s.social.pendingRescue)?.name ?? 'your teammate'}.{' '}
          <button type="button" className="link-btn" onClick={() => act((st) => SO.armRescue(st, null))}>
            Cancel
          </button>
        </p>
      )}
      <Feed s={s} others={others} toast={toast} />
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={() => go(leaveParty)}>
        Leave party
      </button>
    </section>
  );
}

function Member({ s, m, rescueUsed, toast }: { s: State; m: MemberSummary | null; rescueUsed?: boolean; toast?: Toast }) {
  const fight = currentFight(s);
  const id = m ? m.uid : (s.party?.uid ?? '');
  const fm = fight?.members.find((x) => x.uid === id);
  const name = m ? m.name : `${s.profile.name} (you)`;
  const level = m ? m.level : levelFromXp(s.xp);
  const cls = m ? m.cls : (s.cls?.id ?? null);
  const resting = fm?.resting;
  return (
    <div className="member">
      <div className="stack grow" style={{ gap: 2 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <b className="small">{name}</b>
          <span className="tiny muted">
            Lv {level}
            {cls ? ` ${CLASSES[cls].name}` : ''}
          </span>
          {resting && <span className="badge">Resting</span>}
          {fm?.downed && <span className="badge warn">Downed</span>}
          {m?.lanternLow && <span className="badge gold">Lantern low</span>}
        </div>
        {fm && !resting && <Bar value={fm.hp / Math.max(1, fm.maxHp)} label={`${name} HP`} color="var(--good)" />}
        <span className="tiny muted">Boss damage this week: {Math.round(fm?.damage ?? 0).toLocaleString('en-US')}</span>
      </div>
      {m?.lanternLow && toast && (
        <button
          type="button"
          className="btn small"
          disabled={rescueUsed || s.social.pendingRescue === m.uid}
          onClick={() => {
            const err = act((st) => SO.armRescue(st, m.uid));
            toast(err ?? `Finish any task to send ${m.name} a Rescue.`);
          }}
        >
          Rescue
        </button>
      )}
    </div>
  );
}

function Feed({ s, others, toast }: { s: State; others: MemberSummary[]; toast: Toast }) {
  const items = others
    .flatMap((m) => m.recent.map((r) => ({ m, r })))
    .sort((a, b) => b.r.at - a.r.at)
    .slice(0, 8);
  if (!items.length) return null;
  return (
    <div className="stack">
      <span className="label">Recent wins</span>
      {items.map(({ m, r }) => {
        const cheered = s.social.cheers.some((c) => c.id === `${r.id}:${s.party?.uid}`);
        return (
          <div key={r.id} className="between small">
            <span>
              <b>{m.name}</b> finished a {r.tier} {r.stats.map((x) => STAT_LABEL[x]).join(' + ')} task
            </span>
            <button
              type="button"
              className="btn small ghost"
              disabled={cheered}
              onClick={() => {
                const err = act((st) => SO.giveCheer(st, m.uid, r.id));
                toast(err ?? `Cheered ${m.name}: +5% XP for their next hour.`);
              }}
            >
              {cheered ? 'Cheered' : 'Cheer'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Epics

function EpicsPanel({ s, toast }: { s: State; toast: Toast }) {
  const [adding, setAdding] = useState(false);
  const active = s.epics.filter((e) => !e.rewarded);
  const done = s.epics.filter((e) => e.rewarded);
  return (
    <section className="stack" aria-labelledby="epics-h">
      <div className="section-head">
        <h2 id="epics-h">Epics</h2>
        <button type="button" className="btn small" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> New Epic
        </button>
      </div>
      {!active.length && <p className="empty">No Epics yet. Good first ones: run a 5K in 8 weeks, read 12 books, pay off a card.</p>}
      {active.map((e) => (
        <EpicCard key={e.id} s={s} e={e} toast={toast} />
      ))}
      {done.length > 0 && <p className="tiny muted">Finished: {done.map((e) => e.title).join(', ')}</p>}
      {adding && <EpicEditor s={s} onClose={() => setAdding(false)} toast={toast} />}
    </section>
  );
}

function EpicCard({ s, e, toast }: { s: State; e: Epic; toast: Toast }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<ItemSlot>('weapon');
  const done = e.milestones.filter((m) => m.doneDay).length;
  const proj = E.projection(e, s.today);
  const fuel = E.epicFuel(s, e);
  return (
    <div className="card stack">
      <button type="button" className="between" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} aria-expanded={open} onClick={() => setOpen(!open)}>
        <div className="stack grow" style={{ gap: 4 }}>
          <b>{e.title}</b>
          <Bar value={done / e.milestones.length} label={`${done} of ${e.milestones.length} milestones`} />
          <span className="tiny muted">
            {done} of {e.milestones.length} milestones · due {shortDay(e.deadline)}
            {e.linked.length ? ` · ${fuel} linked task${fuel === 1 ? '' : 's'} done` : ''}
          </span>
        </div>
        <Icon name={open ? 'up' : 'down'} size={18} />
      </button>
      <p className="small">{proj.text}</p>
      {open && (
        <div className="stack">
          {e.milestones.map((m) => (
            <label key={m.id} className="row small">
              <input
                type="checkbox"
                className="check"
                checked={!!m.doneDay}
                onChange={() => {
                  const err = act((st) => E.toggleMilestone(st, e.id, m.id));
                  if (err) toast(err);
                }}
              />
              <span className={m.doneDay ? 'muted' : ''}>{m.title}</span>
            </label>
          ))}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={() => act((st) => E.deleteEpic(st, e.id))}>
            Delete Epic
          </button>
        </div>
      )}
      {e.doneDay && !e.rewarded && (
        <div className="card warm stack">
          <b>Complete! Claim your reward.</b>
          {E.epicEarnsGear(e) ? (
            <div className="row">
              <select className="input" value={slot} onChange={(ev) => setSlot(ev.target.value as ItemSlot)} aria-label="Rare item slot">
                {ITEM_SLOTS.map((x) => (
                  <option key={x} value={x}>
                    Rare {ITEM_SLOT_LABEL[x].toLowerCase()}
                  </option>
                ))}
              </select>
              <button type="button" className="btn primary" onClick={() => act((st) => E.claimEpic(st, e.id, slot))}>
                Claim
              </button>
            </div>
          ) : (
            <>
              <p className="tiny muted">Epics that run at least {P2.epics.rewardMinDays} days also grant a Rare item. This one earns a trophy.</p>
              <button type="button" className="btn primary" onClick={() => act((st) => E.claimEpic(st, e.id, 'weapon'))}>
                Claim trophy
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EpicEditor({ s, onClose, toast }: { s: State; onClose: () => void; toast: Toast }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(addDays(s.today, 56));
  const [ms, setMs] = useState(['', '', '']);
  const [linked, setLinked] = useState<string[]>([]);
  const tasks = s.tasks.filter((t) => !t.archived && t.type !== 'todo');
  const save = () => {
    const err = act((st) => E.addEpic(st, { title, deadline, milestones: ms, linked }));
    if (err) return toast(err);
    onClose();
  };
  return (
    <Sheet title="New Epic" onClose={onClose}>
      <div className="field">
        <label htmlFor="ep-t">Goal</label>
        <input id="ep-t" className="input" value={title} placeholder="Run a 5K" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ep-d">Deadline</label>
        <input id="ep-d" className="input" type="date" value={deadline} min={addDays(s.today, 1)} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">Milestones ({P2.epics.minMilestones} to {P2.epics.maxMilestones})</span>
        {ms.map((m, i) => (
          <input
            key={i}
            className="input"
            value={m}
            aria-label={`Milestone ${i + 1}`}
            placeholder={`Milestone ${i + 1}`}
            onChange={(e) => setMs(ms.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
        {ms.length < P2.epics.maxMilestones && (
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setMs([...ms, ''])}>
            + Add a milestone
          </button>
        )}
      </div>
      {tasks.length > 0 && (
        <div className="field">
          <span className="label">Linked tasks (optional): their completions show as progress fuel</span>
          <div className="chips">
            {tasks.map((t) => (
              <button key={t.id} type="button" className={`chip ${linked.includes(t.id) ? 'on' : ''}`} aria-pressed={linked.includes(t.id)} onClick={() => setLinked(linked.includes(t.id) ? linked.filter((x) => x !== t.id) : [...linked, t.id])}>
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="tiny muted">Each milestone pays a chest (one a day). Finish an Epic that ran {P2.epics.rewardMinDays}+ days to choose a Rare item.</p>
      <button type="button" className="btn primary" onClick={save}>
        Start Epic
      </button>
    </Sheet>
  );
}
