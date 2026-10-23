// The boss and bounty cards on the Today screen.

import { useMemo } from 'react';
import { currentFight } from '../engine/boss';
import { BOSSES } from '../engine/content/bosses';
import * as B from '../engine/bounties';
import { levelFromXp } from '../engine/progress';
import { P2, unlocked } from '../engine/rules';
import type { State } from '../engine/types';
import { act } from '../store/store';
import { Bar, BossArt, Icon } from './components';

export function BossMini({ s, open }: { s: State; open: () => void }) {
  const fight = useMemo(() => currentFight(s), [s]);
  if (!fight || !unlocked(levelFromXp(s.xp), 'boss')) return null;
  const def = BOSSES[fight.boss];
  const today = fight.days.find((d) => d.day === s.today);
  const pct = fight.hp / fight.maxHp;
  return (
    <button type="button" className="card boss-card" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={open} aria-label={`${def.name}: ${fight.hp} of ${fight.maxHp} HP. Open Quest.`}>
      <BossArt boss={fight.boss} size={52} hurt={1 - pct} />
      <div className="stack grow" style={{ gap: 4 }}>
        <div className="between small">
          <b>{def.name}</b>
          <span className="muted">{fight.wonDay ? 'Defeated!' : `${fight.hp.toLocaleString('en-US')} HP`}</span>
        </div>
        <Bar value={pct} label={`${def.name} HP`} color="#d96a5a" />
        <div className="row tiny muted" style={{ flexWrap: 'wrap', gap: 6 }}>
          {today?.shielded && <span className="badge">Shielded: hit {P2.boss.slothStats} stats today</span>}
          {fight.todayRatio !== null && fight.todayRatio < P2.boss.strikeBelow && !fight.wonDay && <span className="badge warn">Strikes tonight below 70% of Dailies</span>}
          {today && today.damage > 0 && <span>Today: {today.damage} damage</span>}
        </div>
      </div>
    </button>
  );
}

export function Bounties({ s, toast }: { s: State; toast: (m: string) => void }) {
  if (!unlocked(levelFromXp(s.xp), 'bounties') || !s.bounties.list.length || s.bounties.day !== s.today) return null;
  const all = s.bounties.list.every((b) => b.claimed);
  const run = (fn: (st: State) => import('../engine/actions').Result) => {
    const err = act(fn);
    if (err) toast(err);
  };
  return (
    <section className="card stack" aria-labelledby="bounty-h">
      <div className="section-head">
        <h2 id="bounty-h">Bounties</h2>
        <span className="tiny muted">{s.bounties.rerolled ? 'Reroll used' : '1 reroll left'}</span>
      </div>
      <div>
        {s.bounties.list.map((b) => {
          const p = B.bountyProgress(s, b);
          return (
            <div key={b.id} className="bounty">
              <Icon name="chest" size={18} color={b.claimed ? 'var(--muted)' : p.done ? 'var(--accent)' : 'currentColor'} />
              <div className="stack grow" style={{ gap: 3 }}>
                <span className={`small ${b.claimed ? 'muted' : ''}`} style={b.claimed ? { textDecoration: 'line-through' } : undefined}>
                  {b.label}
                </span>
                {!b.claimed && b.target > 1 && <Bar value={p.have / p.target} label={`${p.have} of ${p.target}`} />}
              </div>
              {b.claimed ? (
                <span className="tiny muted">Claimed</span>
              ) : p.done ? (
                <button type="button" className="btn small primary" onClick={() => run((st) => B.claimBounty(st, b.id))}>
                  Open chest
                </button>
              ) : (
                <>
                  <span className="tiny muted">
                    {p.have}/{p.target}
                  </span>
                  {!s.bounties.rerolled && (
                    <button type="button" className="link-btn" onClick={() => run((st) => B.rerollBounty(st, b.id))} aria-label={`Reroll: ${b.label}`}>
                      Reroll
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {all && !s.bounties.bonusClaimed && (
        <button type="button" className="btn primary" onClick={() => run(B.claimBonusChest)}>
          <Icon name="star" size={16} /> All three done: open the bonus chest
        </button>
      )}
    </section>
  );
}
