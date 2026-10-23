import { useState } from 'react';
import * as A from '../engine/actions';
import * as V from '../engine/vault';
import * as G from '../engine/game';
import { addDays, shortDay } from '../engine/dates';
import { levelFromXp } from '../engine/progress';
import { P2, unlocked, UNLOCKS } from '../engine/rules';
import { SHOP, type Slot } from '../engine/shop';
import type { Coffer, Debt, State } from '../engine/types';
import { act, useGame } from '../store/store';
import { Avatar, Bar, Icon, Locked, Seg, Sheet } from './components';

export type TreasuryView = 'vault' | 'rewards' | 'shop';
type Toast = (m: string) => void;

export function Treasury({ view, setView, toast }: { view: TreasuryView; setView: (v: TreasuryView) => void; toast: Toast }) {
  const s = useGame();
  const level = levelFromXp(s.xp);
  return (
    <main className="screen" aria-label="Treasury">
      <div className="between">
        <h1>Treasury</h1>
        <span className="chip on">{s.gold.toLocaleString('en-US')} gold</span>
      </div>
      <Seg<TreasuryView>
        label="Treasury sections"
        value={view}
        onChange={setView}
        options={[
          { id: 'vault', label: 'Vault', locked: !unlocked(level, 'vault') },
          { id: 'rewards', label: 'Rewards', locked: !unlocked(level, 'rewards') },
          { id: 'shop', label: 'Shop', locked: !unlocked(level, 'rewards') },
        ]}
      />
      {view === 'vault' &&
        (unlocked(level, 'vault') ? (
          <VaultView s={s} toast={toast} />
        ) : (
          <Locked what="The Vault" level={UNLOCKS.find((u) => u.id === 'vault')!.level}>
            Savings goals and debts become quests. Your first entry each day pays like a Medium task, whatever the amount.
          </Locked>
        ))}
      {view === 'rewards' && (unlocked(level, 'rewards') ? <RewardsView s={s} toast={toast} /> : <Locked what="Rewards" level={2}>You have {s.gold} gold waiting.</Locked>)}
      {view === 'shop' && (unlocked(level, 'rewards') ? <ShopView s={s} toast={toast} /> : <Locked what="The shop" level={2} />)}
    </main>
  );
}

const run = (toast: Toast, fn: (st: State) => A.Result, ok?: string) => {
  const err = act(fn);
  if (err) toast(err);
  else if (ok) toast(ok);
};

// ------------------------------------------------------------------ the Vault

function VaultView({ s, toast }: { s: State; toast: Toast }) {
  const [adding, setAdding] = useState<'coffer' | 'debt' | null>(null);
  const coffers = s.vault.coffers.filter((c) => !c.archived);
  const debts = s.vault.debts.filter((d) => !d.archived);
  const paidToday = s.completions.some((c) => c.day === s.today && c.source === 'vault');
  const orders = V.payoffOrders(debts);
  return (
    <>
      <p className="small muted">
        Log what you save and pay. Your first entry each day pays like a Medium Fortune task, whether it's $5 or $500.{' '}
        {paidToday ? 'Today’s is paid.' : 'Today’s is still open.'} Amounts stay on your device and never reach your party.
      </p>
      <section className="stack" aria-labelledby="coffers-h">
        <div className="section-head">
          <h2 id="coffers-h">Coffers</h2>
          <button type="button" className="btn small" onClick={() => setAdding('coffer')}>
            <Icon name="plus" size={16} /> New
          </button>
        </div>
        {!coffers.length && <p className="empty">No savings goals yet. Try "Emergency fund, $500 by spring".</p>}
        {coffers.map((c) => (
          <CofferCard key={c.id} s={s} c={c} toast={toast} />
        ))}
      </section>
      <section className="stack" aria-labelledby="debts-h">
        <div className="section-head">
          <h2 id="debts-h">Debt Dragons</h2>
          <button type="button" className="btn small" onClick={() => setAdding('debt')}>
            <Icon name="plus" size={16} /> New
          </button>
        </div>
        {!debts.length && <p className="empty">Enter a debt and its balance becomes a dragon's HP. Every payment is a hit.</p>}
        {debts.map((d) => (
          <DragonCard key={d.id} s={s} d={d} toast={toast} />
        ))}
        {orders.highestRate.length >= 2 && (
          <div className="card stack">
            <b className="small">Two common payoff orders</b>
            <span className="tiny">Highest rate first: {orders.highestRate.join(', ')}</span>
            <span className="tiny">Smallest balance first: {orders.smallestBalance.join(', ')}</span>
            <span className="tiny muted">Both work; one saves the most interest, the other gives quicker wins. Your call. This isn't financial advice.</span>
          </div>
        )}
      </section>
      {adding === 'coffer' && <CofferEditor s={s} onClose={() => setAdding(null)} toast={toast} />}
      {adding === 'debt' && <DebtEditor onClose={() => setAdding(null)} toast={toast} />}
    </>
  );
}

function AmountForm({ label, cta, onSubmit, allowNegative }: { label: string; cta: string; onSubmit: (n: number) => boolean; allowNegative?: boolean }) {
  const [v, setV] = useState('');
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(v);
        if (onSubmit(n)) setV('');
      }}
    >
      <input className="input" inputMode="decimal" aria-label={label} placeholder={label} value={v} onChange={(e) => setV(e.target.value.replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, ''))} />
      <button type="submit" className="btn primary">
        {cta}
      </button>
    </form>
  );
}

function CofferCard({ s, c, toast }: { s: State; c: Coffer; toast: Toast }) {
  const saved = V.saved(c);
  const month = V.savedThisMonth(c, s.today);
  const plan = c.plan?.amount ?? V.monthlyPlan(c, s.today);
  const pace = V.cofferPace(c, s.today);
  const today = c.entries.filter((e) => e.day === s.today);
  return (
    <div className="card stack">
      <div className="between">
        <b>{c.name}</b>
        <span className="small">
          {V.money(saved)} <span className="muted">/ {V.money(c.target)}</span>
        </span>
      </div>
      <Bar value={saved / c.target} label={`${c.name}: ${Math.round((saved / c.target) * 100)}% saved`} color="#c9a63e" tall />
      <div className="row tiny muted" style={{ gap: 6, flexWrap: 'wrap' }}>
        {P2.vault.chestsAt.map((p) => (
          <span key={p} className={`badge ${c.chests.includes(p) ? 'gold' : ''}`}>
            <Icon name="chest" size={11} /> {p}%
          </span>
        ))}
      </div>
      {c.doneDay ? (
        <p className="small" style={{ color: 'var(--good)' }}>
          Filled {shortDay(c.doneDay)}! A trophy is on your wall.
        </p>
      ) : (
        <>
          <p className="tiny muted">
            Due {shortDay(c.deadline)} · this month {V.money(month)} of {V.money(plan)} planned{c.monthBonus.includes(s.today.slice(0, 7)) ? ' (bonus paid)' : ''}
            {pace.finishIn ? ` · at this pace, done ${shortDay(addDays(s.today, pace.finishIn))}` : ''}
          </p>
          <AmountForm
            label="Deposit (negative withdraws)"
            cta="Log"
            allowNegative
            onSubmit={(n) => {
              const err = act((st) => V.logDeposit(st, c.id, n));
              if (err) toast(err);
              return !err;
            }}
          />
        </>
      )}
      {today.map((e) => (
        <div key={e.id} className="between tiny muted">
          <span>Today: {V.money(e.amount)}</span>
          <button type="button" className="link-btn" onClick={() => run(toast, (st) => V.deleteEntry(st, 'coffer', c.id, e.id))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={() => run(toast, (st) => V.archiveVault(st, 'coffer', c.id))}>
        Archive
      </button>
    </div>
  );
}

function DragonCard({ s, d, toast }: { s: State; d: Debt; toast: Toast }) {
  const lastInterest = d.interest.at(-1);
  const today = d.entries.filter((e) => e.day === s.today);
  return (
    <div className="card stack">
      <div className="between">
        <b>{d.name} dragon</b>
        <span className="small">
          {V.money(d.balance)} <span className="muted">HP</span>
        </span>
      </div>
      <Bar value={d.balance / Math.max(d.start, d.balance)} label={`${d.name}: ${V.money(d.balance)} left`} color="#b0473a" tall />
      {d.slainDay ? (
        <p className="small" style={{ color: 'var(--good)' }}>
          Slain {shortDay(d.slainDay)}. Dragonslayer!
        </p>
      ) : (
        <>
          <p className="tiny muted">
            Started at {V.money(d.start)}
            {d.apr ? ` · ${d.apr}% APR` : ''}
            {d.minPayment ? ` · payments over ${V.money(d.minPayment)} land as critical hits` : ''}
            {lastInterest ? ` · interest healed it ${V.money(lastInterest.amount)} this month` : ''}
          </p>
          <AmountForm
            label="Payment, e.g. 150"
            cta="Hit"
            onSubmit={(n) => {
              const err = act((st) => V.logPayment(st, d.id, n));
              if (err) toast(err);
              return !err;
            }}
          />
        </>
      )}
      {today.map((e) => (
        <div key={e.id} className="between tiny muted">
          <span>
            Today: {V.money(e.amount)}
            {e.crit ? ' (critical)' : ''}
          </span>
          <button type="button" className="link-btn" onClick={() => run(toast, (st) => V.deleteEntry(st, 'debt', d.id, e.id))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={() => run(toast, (st) => V.archiveVault(st, 'debt', d.id))}>
        Archive
      </button>
    </div>
  );
}

function CofferEditor({ s, onClose, toast }: { s: State; onClose: () => void; toast: Toast }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState(addDays(s.today, 120));
  return (
    <Sheet title="New Coffer" onClose={onClose}>
      <div className="field">
        <label htmlFor="cf-n">Name</label>
        <input id="cf-n" className="input" value={name} placeholder="Emergency fund" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cf-t">Target ($)</label>
        <input id="cf-t" className="input" inputMode="decimal" value={target} placeholder="500" onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} />
      </div>
      <div className="field">
        <label htmlFor="cf-d">By</label>
        <input id="cf-d" className="input" type="date" value={deadline} min={addDays(s.today, 1)} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <p className="tiny muted">Chests at 25, 50, 75 and 100%. Hitting a month's planned amount pays a Hard bonus.</p>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          const err = act((st) => V.addCoffer(st, { name, target: Number(target), deadline }));
          if (err) return toast(err);
          onClose();
        }}
      >
        Create Coffer
      </button>
    </Sheet>
  );
}

function DebtEditor({ onClose, toast }: { onClose: () => void; toast: Toast }) {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [apr, setApr] = useState('');
  const [min, setMin] = useState('');
  return (
    <Sheet title="New Debt Dragon" onClose={onClose}>
      <div className="field">
        <label htmlFor="db-n">Name</label>
        <input id="db-n" className="input" value={name} placeholder="Credit card" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="db-b">Balance ($)</label>
        <input id="db-b" className="input" inputMode="decimal" value={balance} placeholder="1200" onChange={(e) => setBalance(e.target.value.replace(/[^\d.]/g, ''))} />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="db-a">APR % (optional)</label>
          <input id="db-a" className="input" inputMode="decimal" value={apr} placeholder="24" onChange={(e) => setApr(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="db-m">Minimum ($, optional)</label>
          <input id="db-m" className="input" inputMode="decimal" value={min} placeholder="35" onChange={(e) => setMin(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
      </div>
      <p className="tiny muted">With a rate, the dragon heals by a month's interest at each new month, so you can watch interest fight back.</p>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          const err = act((st) => V.addDebt(st, { name, balance: Number(balance), apr: apr ? Number(apr) : null, minPayment: min ? Number(min) : null }));
          if (err) return toast(err);
          onClose();
        }}
      >
        Summon the dragon
      </button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ rewards

function RewardsView({ s, toast }: { s: State; toast: Toast }) {
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(2);
  const [custom, setCustom] = useState('');
  const perDay = A.goldPerDay(s);
  const suggested = Math.max(10, Math.round((perDay * days) / 5) * 5);
  const price = custom ? Number(custom) : suggested;
  return (
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
            <button type="button" className="btn small primary" disabled={s.gold < r.price} onClick={() => run(toast, (st) => A.claimReward(st, r.id), `Enjoy: ${r.title}.`)}>
              Claim
            </button>
            <button type="button" className="icon-btn" aria-label={`Delete ${r.title}`} onClick={() => run(toast, (st) => A.deleteReward(st, r.id))}>
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
  );
}

// ------------------------------------------------------------------ shop

const SLOTS: { id: Slot; label: string }[] = [
  { id: 'cloak', label: 'Cloaks' },
  { id: 'hat', label: 'Headwear' },
  { id: 'item', label: 'In hand' },
];

function ShopView({ s, toast }: { s: State; toast: Toast }) {
  const level = levelFromXp(s.xp);
  const supplies: { id: G.Consumable; name: string; desc: string; minLevel: number; have: number }[] = [
    { id: 'healing', name: 'Healing potion', desc: '+50% fight HP, and up again if Downed', minLevel: 3, have: s.bag.healing },
    { id: 'food', name: 'Pet treat', desc: `+${P2.pets.foodXp} pet XP`, minLevel: 4, have: s.bag.food },
    { id: 'egg', name: 'Mystery egg', desc: 'One of 10 species', minLevel: 4, have: Object.values(s.bag.eggs).reduce((a, b) => a + (b ?? 0), 0) },
  ];
  return (
    <>
      <section className="stack" aria-labelledby="sup-h">
        <h2 id="sup-h">Supplies</h2>
        <div className="shop-grid">
          {supplies
            .filter((x) => level >= x.minLevel)
            .map((x) => (
              <button key={x.id} type="button" className="shop-item" onClick={() => run(toast, (st) => G.buyConsumable(st, x.id), x.id === 'egg' ? undefined : `Bought a ${x.name.toLowerCase()}.`)}>
                <span className="small">{x.name}</span>
                <span className="tiny muted">{x.desc}</span>
                <span className="tiny">
                  {P2.shop[x.id]} gold · have {x.have}
                </span>
              </button>
            ))}
        </div>
        {level < 3 && <p className="tiny muted">Supplies for the boss and pets appear here as those open.</p>}
      </section>
      <section className="stack" aria-labelledby="shop-h">
        <div className="between">
          <h2 id="shop-h">Looks</h2>
          <Avatar equipped={s.equipped} size={48} />
        </div>
        <p className="small muted">Gold buys looks and supplies, never gear or XP. Gear only drops.</p>
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
                    onClick={() => (owned ? run(toast, (st) => A.equipItem(st, item.id), `Wearing ${item.name}.`) : run(toast, (st) => A.buyItem(st, item.id), `Bought ${item.name}.`))}
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
    </>
  );
}
