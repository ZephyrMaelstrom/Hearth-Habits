import { useState } from 'react';
import { shortDay } from '../engine/dates';
import { activeDailies, dailySlots, harmony, levelFromXp, levelProgress, statLevels, STAT_HINT, STAT_LABEL } from '../engine/progress';
import { P2, RULES, unlocked, UNLOCKS } from '../engine/rules';
import { CLASS_LIST, CLASSES, pointsSpent, skillCost, skillPoints, SKILLS, TREES } from '../engine/content/classes';
import { itemLines, ITEM_SLOT_LABEL, RARITY, SLOT_LABEL, slotsFor } from '../engine/content/gear';
import { petAttack, petLevel, petName, petXpForLevel, POTIONS, SPECIES, speciesById } from '../engine/content/pets';
import { ACH_LABEL, ACHIEVEMENTS, achievementScore } from '../engine/achievements';
import { equippedItems, profile } from '../engine/combat';
import * as G from '../engine/game';
import { GEAR_SLOTS, STATS, type GearSlot, type Item, type PotionColor, type Species, type State } from '../engine/types';
import { act, useGame } from '../store/store';
import { Avatar, Bar, GearIcon, Heptagon, Icon, Locked, PetBadge, Seg, Sheet } from './components';

export type HeroView = 'stats' | 'class' | 'gear' | 'pets' | 'trophies';
type Toast = (m: string) => void;
const lvl = (id: string) => UNLOCKS.find((u) => u.id === id)!.level;

export function Hero({ view, setView, toast }: { view: HeroView; setView: (v: HeroView) => void; toast: Toast }) {
  const s = useGame();
  const lp = levelProgress(s.xp);
  const level = lp.level;
  return (
    <main className="screen" aria-label="Hero">
      <div className="hero-top">
        <Avatar equipped={s.equipped} size={72} />
        <div className="stack grow" style={{ gap: 4 }}>
          <h1>{s.profile.name}</h1>
          <span className="small muted">
            Level {lp.level} · {s.cls ? CLASSES[s.cls.id].name : 'Adventurer'}
            {s.title ? ` · ${s.title}` : ''}
          </span>
          <Bar value={lp.into / lp.need} label={`Level progress ${Math.floor(lp.into)} of ${lp.need}`} />
        </div>
      </div>
      <Seg<HeroView>
        label="Hero sections"
        value={view}
        onChange={setView}
        options={[
          { id: 'stats', label: 'Stats' },
          { id: 'class', label: 'Class', locked: level < RULES.classLevel },
          { id: 'gear', label: 'Gear', locked: !unlocked(level, 'boss') },
          { id: 'pets', label: 'Pets', locked: !unlocked(level, 'pets') },
          { id: 'trophies', label: 'Trophies' },
        ]}
      />
      {view === 'stats' && <StatsView s={s} />}
      {view === 'class' && <ClassView s={s} toast={toast} />}
      {view === 'gear' && (unlocked(level, 'boss') ? <GearView s={s} toast={toast} /> : <Locked what="Gear" level={lvl('boss')}>Loot starts dropping from tasks at level 3.</Locked>)}
      {view === 'pets' && (unlocked(level, 'pets') ? <PetsView s={s} toast={toast} /> : <Locked what="Pets" level={lvl('pets')}>You'll get a starter egg and potion.</Locked>)}
      {view === 'trophies' && <TrophiesView s={s} />}
    </main>
  );
}

const run = (toast: Toast, fn: (st: State) => import('../engine/actions').Result) => {
  const err = act(fn);
  if (err) toast(err);
};

// ------------------------------------------------------------------ stats

function StatsView({ s }: { s: State }) {
  const lv = statLevels(s);
  const h = harmony(s);
  const level = levelFromXp(s.xp);
  const slots = dailySlots(level);
  const used = activeDailies(s.tasks).length;
  const p = profile(s);
  const EFFECT: Record<string, string> = {
    might: `+${Math.round(p.might * 100)}% boss damage`,
    vigor: `${p.maxHp} max HP, ${Math.round(p.resist * 100)}% less from strikes`,
    mind: `${Math.round(p.crit * 100)}% critical-hit chance`,
    craft: `+${Math.round((p.quality - 1) * 100)}% to gear bonuses`,
    spirit: `${p.maxMana} max Mana`,
    bond: `+${Math.round(p.bondBoost * 100)}% party skill strength`,
    fortune: `+${Math.round(p.gold * 100)}% gold, better loot odds`,
  };
  return (
    <>
      <div className="card stack" style={{ alignItems: 'center' }}>
        <Heptagon levels={lv} />
        <p className="small muted" style={{ alignSelf: 'stretch' }}>
          {h.active
            ? `Harmony is on: your lowest stat is ${Math.round(h.ratio * 100)}% of your highest. +10% XP on everything.`
            : h.hi < RULES.harmony.minTopLevel
              ? `Harmony switches on once your top stat reaches level ${RULES.harmony.minTopLevel} and your lowest is at least 60% of it. +10% XP on everything.`
              : `Harmony is off: your lowest stat is ${Math.round(h.ratio * 100)}% of your highest. Raise ${h.lowest.map((x) => STAT_LABEL[x]).join(' or ')} to level ${h.needed} to switch it on (+10% XP).`}
        </p>
      </div>
      <section className="stack" aria-labelledby="stats-h">
        <h2 id="stats-h">Stats</h2>
        <div className="stat-list">
          {STATS.map((st) => {
            const sp = levelProgress(s.statXp[st] ?? 0);
            return (
              <div key={st} className="stat">
                <div className="between">
                  <b>{STAT_LABEL[st]}</b>
                  <span className="small">Lv {sp.level}</span>
                </div>
                <Bar value={sp.into / sp.need} label={`${STAT_LABEL[st]} progress`} />
                <span className="tiny muted">{STAT_HINT[st]}</span>
                <span className="tiny">{EFFECT[st]}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="card stack" aria-labelledby="traits-h">
        <div className="between">
          <h2 id="traits-h">Traits</h2>
          <span className="small muted">
            {s.traits.length} of {RULES.graduation.maxTraits}
          </span>
        </div>
        {s.traits.length ? (
          s.traits.map((t) => (
            <p key={t.id} className="small">
              <b>{t.name}</b> <span className="muted">· +{Math.round(t.bonus * 100)}% XP on {STAT_LABEL[t.stat]} tasks · from "{t.fromTask}"</span>
            </p>
          ))
        ) : (
          <p className="small muted">Keep a Daily going 95% of the time for 4 weeks and it graduates into a permanent Trait, freeing its slot.</p>
        )}
      </section>
      <section className="card stack">
        <div className="between">
          <h2>Daily slots</h2>
          <span className="small muted">
            {used} of {slots} used
          </span>
        </div>
        <p className="small muted">
          {slots >= RULES.slots.max
            ? `All ${RULES.slots.max} slots are open.`
            : `A new slot opens every ${RULES.slots.perLevels} levels, up to ${RULES.slots.max}. Next at level ${(Math.floor(level / RULES.slots.perLevels) + 1) * RULES.slots.perLevels}.`}
        </p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ class

function ClassView({ s, toast }: { s: State; toast: Toast }) {
  const ready = G.classReady(s);
  const [changing, setChanging] = useState(false);
  if (!ready.ready && !s.cls) {
    return (
      <div className="card stack">
        <h2>Choose a class</h2>
        <p className="small muted">
          Classes open at level {RULES.classLevel}, and no sooner than day {RULES.classMinDay}, so you've seen one full boss week first.
        </p>
        <div className="between small">
          <span>Level</span>
          <span>
            {ready.level} / {RULES.classLevel}
          </span>
        </div>
        <Bar value={ready.level / RULES.classLevel} label="Level toward class" />
        <div className="between small">
          <span>Day</span>
          <span>
            {Math.min(ready.day, RULES.classMinDay)} / {RULES.classMinDay}
          </span>
        </div>
        <Bar value={ready.day / RULES.classMinDay} label="Days toward class" />
        {ready.availableOn && <p className="small">Available {shortDay(ready.availableOn)}.</p>}
        <ClassCards s={s} toast={toast} disabled />
      </div>
    );
  }
  if (!s.cls || changing) {
    const cost = G.classChangeCost(s);
    return (
      <div className="stack">
        <h2>{s.cls ? 'Change class' : 'Choose your class'}</h2>
        <p className="small muted">
          Tasks that match your class's two main stats hit the boss 25% harder.
          {s.cls ? (cost.gold ? ` Changing costs ${cost.gold} gold${cost.waitDays ? `, in ${cost.waitDays} days` : ''}, and resets your skill tree.` : ' Your first change is free and resets your skill tree.') : ' Your first change later is free.'}
        </p>
        <ClassCards s={s} toast={toast} onDone={() => setChanging(false)} />
        {s.cls && (
          <button type="button" className="btn ghost" onClick={() => setChanging(false)}>
            Keep {CLASSES[s.cls.id].name}
          </button>
        )}
      </div>
    );
  }
  const cls = CLASSES[s.cls.id];
  const p = profile(s);
  const skill = SKILLS[cls.skill];
  const left = G.pointsLeft(s);
  const tree = TREES[s.cls.id];
  return (
    <>
      <div className="card stack">
        <div className="between">
          <div className="stack" style={{ gap: 2 }}>
            <h2 style={{ color: cls.color }}>{cls.name}</h2>
            <span className="tiny muted">
              {cls.role} · main stats {cls.main.map((x) => STAT_LABEL[x]).join(' and ')}
            </span>
          </div>
          <button type="button" className="btn small ghost" onClick={() => setChanging(true)}>
            Change
          </button>
        </div>
        <div className="card warm stack" style={{ padding: 10 }}>
          <b className="small">
            {skill.name} · {skillCost(skill.id, p.effects)} Mana
          </b>
          <span className="small">{skill.desc}</span>
          <span className="tiny muted">Use it from the boss card on the Quest tab.</span>
        </div>
        <div className="between small">
          <span>Mana</span>
          <span>
            {Math.floor(s.mana)} / {p.maxMana}
          </span>
        </div>
        <Bar value={s.mana / p.maxMana} label="Mana" color="#6f8fd6" />
        <span className="tiny muted">Refills 25% a day, 50% on days you finish a Spirit task.</span>
      </div>
      <section className="card stack" aria-labelledby="tree-h">
        <div className="between">
          <h2 id="tree-h">Skill tree</h2>
          <span className={`badge ${left > 0 ? 'gold' : ''}`}>
            {left} point{left === 1 ? '' : 's'} to spend
          </span>
        </div>
        <span className="tiny muted">
          1 point a level from 10, plus a bonus every 10 levels. {pointsSpent(s.skills)} spent of {skillPoints(levelFromXp(s.xp))}.
        </span>
        <div>
          {tree.map((n) => {
            const rank = s.skills[n.id] ?? 0;
            const reqMet = !n.req || (s.skills[n.req.id] ?? 0) >= n.req.rank;
            const req = n.req ? tree.find((x) => x.id === n.req!.id) : null;
            return (
              <div key={n.id} className="node">
                <div className="stack grow" style={{ gap: 2 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <b className="small" style={!reqMet ? { color: 'var(--muted)' } : undefined}>
                      {n.name}
                    </b>
                    <span className="pips" aria-label={`Rank ${rank} of ${n.max}`}>
                      {Array.from({ length: n.max }, (_, i) => (
                        <i key={i} className={i < rank ? 'on' : ''} />
                      ))}
                    </span>
                  </div>
                  <span className="tiny muted">
                    {n.desc}
                    {n.max > 1 ? ' per rank' : ''}
                    {req && !reqMet ? ` · needs ${req.name} ${n.req!.rank}` : ''}
                  </span>
                </div>
                <button type="button" className="icon-btn" disabled={rank >= n.max || left <= 0 || !reqMet} aria-label={`Add a point to ${n.name}`} onClick={() => run(toast, (st) => G.spendPoint(st, n.id))}>
                  <Icon name="plus" size={18} />
                </button>
              </div>
            );
          })}
        </div>
        {pointsSpent(s.skills) > 0 && (
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => run(toast, G.resetTree)}>
            Reset points ({P2.classChange.treeReset} gold)
          </button>
        )}
      </section>
    </>
  );
}

function ClassCards({ s, toast, disabled, onDone }: { s: State; toast: Toast; disabled?: boolean; onDone?: () => void }) {
  return (
    <div className="class-grid">
      {CLASS_LIST.map((id) => {
        const c = CLASSES[id];
        const current = s.cls?.id === id;
        return (
          <button
            key={id}
            type="button"
            className="class-card"
            disabled={disabled || current}
            style={current ? { borderColor: c.color } : undefined}
            onClick={() => {
              const err = act((st) => G.chooseClass(st, id));
              if (err) toast(err);
              else onDone?.();
            }}
          >
            <b style={{ color: c.color }}>{c.name}</b>
            <span className="tiny muted">
              {c.role} · {c.main.map((x) => STAT_LABEL[x]).join(' + ')}
            </span>
            <span className="tiny">{c.blurb}</span>
            <span className="tiny muted">Skill: {SKILLS[c.skill].name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ gear

function GearView({ s, toast }: { s: State; toast: Toast }) {
  const [open, setOpen] = useState<string | null>(null);
  const p = profile(s);
  const equipped = new Set(Object.values(s.gear));
  const bag = [...s.inventory].sort((a, b) => rank(b) - rank(a) || b.ilvl - a.ilvl).filter((i) => !equipped.has(i.id));
  const item = open ? s.inventory.find((i) => i.id === open) : null;
  return (
    <>
      <div className="slot-grid">
        {GEAR_SLOTS.map((slot) => {
          const it = s.gear[slot] ? s.inventory.find((i) => i.id === s.gear[slot]) : null;
          const itemSlot = slot.startsWith('trinket') ? 'trinket' : (slot as Item['slot']);
          return (
            <button key={slot} type="button" className={`slot ${it ? '' : 'empty'}`} onClick={() => it && setOpen(it.id)} aria-label={`${SLOT_LABEL[slot]}: ${it ? it.name : 'empty'}`}>
              <GearIcon slot={itemSlot} size={18} color={it ? RARITY[it.rarity].color : 'var(--muted)'} />
              <span className="tiny muted">{SLOT_LABEL[slot]}</span>
              <span className="nm" style={it ? { color: RARITY[it.rarity].color } : undefined}>
                {it ? it.name : 'Empty'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="card stack">
        <h2>From your gear</h2>
        <p className="small">
          +{Math.round(Math.min(P2.combat.gearDmgMax, p.gearDmg) * 100)}% damage, {p.maxHp} max HP, {Math.round(p.crit * 100)}% crit, +{Math.round(p.gold * 100)}% gold
        </p>
        <p className="tiny muted">Gear never adds XP. Its damage bonus is capped at +{Math.round(P2.combat.gearDmgMax * 100)}%, so tasks always matter most.</p>
      </div>
      <section className="stack" aria-labelledby="bag-h">
        <div className="section-head">
          <h2 id="bag-h">Bag</h2>
          <span className="tiny muted">
            {s.inventory.length} / {P2.inventoryMax}
          </span>
        </div>
        {!bag.length && <p className="empty">Nothing spare. Loot drops from tasks (harder tasks drop more), bounty chests and bosses.</p>}
        <div>
          {bag.map((it) => (
            <button key={it.id} type="button" className="item-row" onClick={() => setOpen(it.id)}>
              <GearIcon slot={it.slot} size={20} color={RARITY[it.rarity].color} />
              <div className="stack grow" style={{ gap: 2 }}>
                <span className="small" style={{ color: RARITY[it.rarity].color }}>
                  {it.name}
                </span>
                <span className="tiny muted">
                  {RARITY[it.rarity].label} {ITEM_SLOT_LABEL[it.slot].toLowerCase()} · item level {it.ilvl} · {itemLines(it)[0]}
                </span>
              </div>
            </button>
          ))}
        </div>
        {bag.some((i) => i.rarity === 'common') && (
          <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => run(toast, G.sellCommons)}>
            Sell all spare Common gear
          </button>
        )}
      </section>
      {item && <ItemSheet s={s} item={item} onClose={() => setOpen(null)} toast={toast} />}
    </>
  );
}

const rank = (i: Item) => (i.rarity === 'rare' ? 2 : i.rarity === 'uncommon' ? 1 : 0);

function ItemSheet({ s, item, onClose, toast }: { s: State; item: Item; onClose: () => void; toast: Toast }) {
  const slots = slotsFor(item.slot);
  const wornIn = (Object.keys(s.gear) as GearSlot[]).find((k) => s.gear[k] === item.id);
  const compare = slots.map((sl) => (s.gear[sl] ? s.inventory.find((i) => i.id === s.gear[sl]) : null)).filter((x): x is Item => !!x && x.id !== item.id);
  const done = (fn: (st: State) => import('../engine/actions').Result) => {
    run(toast, fn);
    onClose();
  };
  return (
    <Sheet title={item.name} onClose={onClose}>
      <span className="small" style={{ color: RARITY[item.rarity].color }}>
        {RARITY[item.rarity].label} {ITEM_SLOT_LABEL[item.slot].toLowerCase()} · item level {item.ilvl}
      </span>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {itemLines(item).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {compare.map((c) => (
        <div key={c.id} className="card stack" style={{ padding: 10 }}>
          <span className="tiny muted">Now wearing: {c.name}</span>
          <span className="tiny">{itemLines(c).join(' · ')}</span>
        </div>
      ))}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {wornIn ? (
          <button type="button" className="btn" onClick={() => done((st) => G.unequipSlot(st, wornIn))}>
            Take off
          </button>
        ) : slots.length > 1 ? (
          slots.map((sl, i) => (
            <button key={sl} type="button" className="btn primary" onClick={() => done((st) => G.equipItem(st, item.id, sl))}>
              Wear as trinket {i + 1}
            </button>
          ))
        ) : (
          <button type="button" className="btn primary" onClick={() => done((st) => G.equipItem(st, item.id))}>
            Wear it
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => done((st) => G.sellItem(st, item.id))}>
          Sell for {RARITY[item.rarity].sell} gold
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ pets

function PetsView({ s, toast }: { s: State; toast: Toast }) {
  const [hatching, setHatching] = useState(false);
  const active = s.pets.find((p) => p.id === s.activePet);
  const p = profile(s);
  const eggs = SPECIES.filter((sp) => (s.bag.eggs[sp.id] ?? 0) > 0);
  const potions = POTIONS.filter((po) => (s.bag.potions[po.id] ?? 0) > 0);
  return (
    <>
      {active ? (
        <div className="card stack">
          <div className="row">
            <PetBadge species={active.species} potion={active.potion} size={56} />
            <div className="stack grow" style={{ gap: 3 }}>
              <b>{petName(active.species, active.potion)}</b>
              <span className="tiny muted">
                Battle pet · level {petLevel(active.xp)} · hits for {petAttack(petLevel(active.xp), p.petDmg)} on days you finish {P2.pets.tasksToAttack}+ tasks
              </span>
              <PetXp xp={active.xp} />
            </div>
          </div>
          <div className="between">
            <span className="tiny muted">Grows from {STAT_LABEL[speciesById(active.species).stat]} tasks and treats.</span>
            <button type="button" className="btn small" disabled={s.bag.food <= 0 || petLevel(active.xp) >= P2.pets.maxLevel} onClick={() => run(toast, (st) => G.feedPet(st, active.id))}>
              Feed treat ({s.bag.food})
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="small">No battle pet yet. Hatch an egg with a potion below.</p>
        </div>
      )}
      <section className="card stack" aria-labelledby="bag2-h">
        <div className="between">
          <h2 id="bag2-h">Eggs and potions</h2>
          <button type="button" className="btn small primary" disabled={!eggs.length || !potions.length} onClick={() => setHatching(true)}>
            Hatch
          </button>
        </div>
        <p className="small">
          {eggs.length ? eggs.map((e) => `${e.emoji} ${e.name} ×${s.bag.eggs[e.id]}`).join('  ') : 'No eggs.'}
        </p>
        <p className="small">
          {potions.length ? potions.map((po) => `${po.name} potion ×${s.bag.potions[po.id]}`).join(' · ') : 'No hatching potions.'}
        </p>
        <span className="tiny muted">Both drop from tasks and chests. Every boss win has a 50% egg chance.</span>
      </section>
      <section className="stack" aria-labelledby="coll-h">
        <div className="section-head">
          <h2 id="coll-h">Collection</h2>
          <span className="tiny muted">
            {s.pets.length} / {SPECIES.length * POTIONS.length}
          </span>
        </div>
        {POTIONS.map((po) => (
          <div key={po.id} className="stack" style={{ gap: 4 }}>
          <span className="tiny muted">{po.name}</span>
          <div className="pet-grid">
            {SPECIES.map((sp) => {
              const pet = s.pets.find((x) => x.species === sp.id && x.potion === po.id);
              return (
                <button
                  key={sp.id}
                  type="button"
                  disabled={!pet}
                  aria-label={pet ? `${petName(sp.id, po.id)}, level ${petLevel(pet.xp)}${pet.id === s.activePet ? ', battle pet' : ''}` : `${po.name} ${sp.name}: not found yet`}
                  onClick={() => pet && run(toast, (st) => G.setActivePet(st, pet.id))}
                >
                  <PetBadge species={sp.id} potion={po.id} size={40} unknown={!pet} />
                  <span style={pet?.id === s.activePet ? { color: 'var(--accent)' } : undefined}>{pet ? `Lv ${petLevel(pet.xp)}` : ''}</span>
                </button>
              );
            })}
          </div>
          </div>
        ))}
        <span className="tiny muted">Tap a pet to make it your battle pet. Pets never die or starve; an unfed pet just stops growing.</span>
      </section>
      {hatching && <HatchSheet s={s} onClose={() => setHatching(false)} toast={toast} />}
    </>
  );
}

function PetXp({ xp }: { xp: number }) {
  const L = petLevel(xp);
  if (L >= P2.pets.maxLevel) return <span className="tiny">Fully grown</span>;
  const a = petXpForLevel(L);
  const b = petXpForLevel(L + 1);
  return <Bar value={(xp - a) / (b - a)} label={`Pet XP ${xp - a} of ${b - a}`} />;
}

function HatchSheet({ s, onClose, toast }: { s: State; onClose: () => void; toast: Toast }) {
  const eggs = SPECIES.filter((sp) => (s.bag.eggs[sp.id] ?? 0) > 0);
  const potions = POTIONS.filter((po) => (s.bag.potions[po.id] ?? 0) > 0);
  const [egg, setEgg] = useState<Species>(eggs[0]?.id ?? 'fox');
  const [potion, setPotion] = useState<PotionColor>(potions[0]?.id ?? 'ember');
  const owned = s.pets.some((p) => p.species === egg && p.potion === potion);
  return (
    <Sheet title="Hatch a pet" onClose={onClose}>
      <div className="field">
        <span className="label">Egg</span>
        <div className="chips">
          {eggs.map((e) => (
            <button key={e.id} type="button" className={`chip ${egg === e.id ? 'on' : ''}`} aria-pressed={egg === e.id} onClick={() => setEgg(e.id)}>
              {e.emoji} {e.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Hatching potion</span>
        <div className="chips">
          {potions.map((po) => (
            <button key={po.id} type="button" className={`chip ${potion === po.id ? 'on' : ''}`} aria-pressed={potion === po.id} onClick={() => setPotion(po.id)}>
              <span className="swatch" style={{ background: po.color }} /> {po.name}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <PetBadge species={egg} potion={potion} size={56} />
        <span className="small">{owned ? `You already have a ${petName(egg, potion)}. Try another potion.` : `You'll get a ${petName(egg, potion)}.`}</span>
      </div>
      <button
        type="button"
        className="btn primary"
        disabled={owned}
        onClick={() => {
          run(toast, (st) => G.hatchPet(st, egg, potion));
          onClose();
        }}
      >
        Hatch it
      </button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ trophies

function TrophiesView({ s }: { s: State }) {
  const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
  const got = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  return (
    <>
      <div className="card between">
        <div className="stack" style={{ gap: 2 }}>
          <span className="tiny muted">Achievement score</span>
          <b style={{ fontSize: 22, fontFamily: 'var(--display)' }}>{achievementScore(s)}</b>
        </div>
        <span className="small muted">
          {got} of {ACHIEVEMENTS.length} earned
        </span>
      </div>
      {s.titles.length > 0 && (
        <div className="card stack">
          <h2>Title</h2>
          <div className="chips">
            <button type="button" className={`chip ${!s.title ? 'on' : ''}`} aria-pressed={!s.title} onClick={() => act((st) => G.setTitle(st, null))}>
              None
            </button>
            {s.titles.map((t) => (
              <button key={t} type="button" className={`chip ${s.title === t ? 'on' : ''}`} aria-pressed={s.title === t} onClick={() => act((st) => G.setTitle(st, t))}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {s.trophies.length > 0 && (
        <section className="card stack" aria-labelledby="wall-h">
          <h2 id="wall-h">Trophy wall</h2>
          {[...s.trophies].reverse().map((t) => (
            <div key={t.id} className="between small">
              <span>
                <Icon name={t.kind === 'boss' ? 'shield' : t.kind === 'epic' ? 'quest' : 'treasury'} size={14} /> {t.label}
              </span>
              <span className="tiny muted">{shortDay(t.day)}</span>
            </div>
          ))}
        </section>
      )}
      {groups.map((g) => (
        <section key={g} className="stack" aria-label={g}>
          <h2>{g}</h2>
          <div>
            {ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
              const day = s.achievements[a.id];
              const hidden = a.secret && !day;
              return (
                <div key={a.id} className="ach">
                  <span className={`medal ${day ? a.tier : 'none'}`} aria-hidden="true">
                    {day ? '★' : '·'}
                  </span>
                  <div className="stack grow" style={{ gap: 1 }}>
                    <span className={`small ${day ? '' : 'muted'}`}>{hidden ? 'Secret achievement' : a.name}</span>
                    <span className="tiny muted">
                      {hidden ? 'Found through play.' : a.desc}
                      {a.title && !hidden ? ` · title: ${a.title}` : ''}
                    </span>
                  </div>
                  <span className="tiny muted">{day ? shortDay(day) : ACH_LABEL[a.tier]}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {equippedItems(s).length === 0 && null}
    </>
  );
}
