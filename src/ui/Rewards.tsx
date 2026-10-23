import { useState } from 'react';
import * as A from '../engine/actions';
import { levelFromXp } from '../engine/progress';
import { SHOP, type Slot } from '../engine/shop';
import type { State } from '../engine/types';
import { act, useGame } from '../store/store';
import { Avatar, Icon } from './components';

const SLOTS: { id: Slot; label: string }[] = [
  { id: 'cloak', label: 'Cloaks' },
  { id: 'hat', label: 'Headwear' },
  { id: 'item', label: 'In hand' },
];

export function Rewards({ toast }: { toast: (m: string) => void }) {
  const s = useGame();
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(2);
  const [custom, setCustom] = useState('');
  const perDay = A.goldPerDay(s);
  const suggested = Math.max(10, Math.round((perDay * days) / 5) * 5);
  const price = custom ? Number(custom) : suggested;
  const run = (fn: (st: State) => A.Result, ok?: string) => {
    const err = act(fn);
    toast(err ?? ok ?? '');
  };

  if (levelFromXp(s.xp) < 2) {
    return (
      <main className="screen" aria-label="Rewards">
        <h1>Rewards</h1>
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <Icon name="lock" size={28} color="var(--muted)" />
          <p>Rewards and the gold shop open at level 2.</p>
          <p className="small muted">Finish a few tasks today and you'll be there. You have {s.gold} gold waiting.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="screen" aria-label="Rewards">
      <div className="between">
        <h1>Rewards</h1>
        <span className="chip on">{s.gold.toLocaleString('en-US')} gold</span>
      </div>

      <section className="stack" aria-labelledby="mine-h">
        <h2 id="mine-h">Your real-life rewards</h2>
        <p className="small muted">Price treats in gold, then spend it when you've earned them. You earn about {Math.round(perDay)} gold on a typical day.</p>
        <div className="list">
          {s.rewards.map((r) => (
            <div key={r.id} className="between">
              <div className="grow">
                <div>{r.title}</div>
                <div className="tiny muted">
                  {r.price} gold{r.claimed ? ` · claimed ${r.claimed}×` : ''}
                </div>
              </div>
              <button type="button" className="btn small primary" disabled={s.gold < r.price} onClick={() => run((st) => A.claimReward(st, r.id), `Enjoy: ${r.title}.`)}>
                Claim
              </button>
              <button type="button" className="icon-btn" aria-label={`Delete ${r.title}`} onClick={() => run((st) => A.deleteReward(st, r.id))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          {!s.rewards.length && <p className="empty">No rewards yet. Add a treat below.</p>}
        </div>
        <div className="card stack">
          <div className="field">
            <label htmlFor="rw-title">New reward</label>
            <input id="rw-title" className="input" placeholder="Movie night, new book, a lazy Sunday" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Size</span>
            <div className="seg" role="group" aria-label="Reward size">
              {[
                { d: 0.5, l: 'Small' },
                { d: 2, l: 'Medium' },
                { d: 7, l: 'Big' },
              ].map((o) => (
                <button key={o.l} type="button" aria-pressed={!custom && days === o.d} onClick={() => (setDays(o.d), setCustom(''))}>
                  {o.l}
                </button>
              ))}
            </div>
            <span className="tiny muted">
              Ember suggests {suggested} gold: about {days === 0.5 ? 'half a day' : `${days} days`} of your usual earnings.
            </span>
          </div>
          <div className="field">
            <label htmlFor="rw-price">Or set your own price</label>
            <input id="rw-price" className="input" inputMode="numeric" placeholder={String(suggested)} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} />
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const err = act((st) => A.addReward(st, title, price));
              if (err) return toast(err);
              setTitle('');
              setCustom('');
            }}
          >
            Add reward ({price} gold)
          </button>
        </div>
      </section>

      <section className="stack" aria-labelledby="shop-h">
        <div className="between">
          <h2 id="shop-h">The shop</h2>
          <Avatar equipped={s.equipped} size={48} />
        </div>
        <p className="small muted">Gold buys looks, never power.</p>
        {SLOTS.map((slot) => (
          <div key={slot.id} className="stack">
            <span className="label">{slot.label}</span>
            <div className="shop-grid">
              {SHOP.filter((i) => i.slot === slot.id).map((item) => {
                const owned = s.owned.includes(item.id);
                const equipped = s.equipped[item.slot] === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`shop-item ${equipped ? 'equipped' : ''}`}
                    aria-pressed={equipped}
                    onClick={() =>
                      owned
                        ? run((st) => A.equipItem(st, item.id), `Wearing ${item.name}.`)
                        : run((st) => A.buyItem(st, item.id), `Bought ${item.name}.`)
                    }
                  >
                    <span className="row">
                      {item.color && <span className="swatch" style={{ background: item.color }} />}
                      <span className="small">{item.name}</span>
                    </span>
                    <span className="tiny muted">{equipped ? 'Wearing' : owned ? 'Owned · tap to wear' : `${item.price} gold`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
