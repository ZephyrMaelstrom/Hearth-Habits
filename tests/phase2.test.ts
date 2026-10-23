import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as A from '../src/engine/actions';
import * as G from '../src/engine/game';
import * as V from '../src/engine/vault';
import * as E from '../src/engine/epics';
import * as B from '../src/engine/bounties';
import * as S from '../src/engine/social';
import { checkBoss, currentFight, resolveFight, selfSummary } from '../src/engine/boss';
import { bossForWeek, memberBossHp } from '../src/engine/content/bosses';
import { skillPoints } from '../src/engine/content/classes';
import { generateItem } from '../src/engine/content/gear';
import { gearBonus, hitFor, profile } from '../src/engine/combat';
import { ACHIEVEMENTS, checkAchievements } from '../src/engine/achievements';
import { migrate, newState } from '../src/engine/state';
import { rollover } from '../src/engine/rollover';
import { xpForLevel, levelFromXp } from '../src/engine/progress';
import { rng } from '../src/engine/rng';
import { P2, RULES } from '../src/engine/rules';
import type { MemberSummary, State, Stat } from '../src/engine/types';
import { at, MON, playWeek, setupPlayer, simulate } from './sim';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MON());
});
afterEach(() => vi.useRealTimers());

const ok = (r: A.Result): State => {
  expect(r.error).toBeUndefined();
  return r.state;
};

function player(level: number, extra: Partial<State> = {}): State {
  const s = setupPlayer({ plan: 'typical', level });
  return { ...s, ...extra };
}

const task = (s: State, title: string) => s.tasks.find((t) => t.title === title)!;

function member(o: Partial<MemberSummary> & { uid: string }): MemberSummary {
  return {
    name: o.uid,
    level: 10,
    cls: null,
    title: null,
    shape: { might: 1, vigor: 1, mind: 1, craft: 1, spirit: 1, bond: 1, fortune: 1 },
    avatar: {},
    week: '2026-10-26',
    joinDay: '2026-10-26',
    lastOpen: '2026-11-01',
    lanternLow: false,
    maxHp: 100,
    aura: { inspire: 0, beacon: false, ward: false, warcry: 0, crescendo: false, unbreakable: false, secondWind: false, ironRhythm: 0, mendPct: 0.25, cheerHeal: false, strikeResist: 0 },
    hits: [],
    days: {},
    casts: [],
    buffs: [],
    cheers: [],
    rescues: [],
    recent: [],
    updatedAt: 0,
    ...o,
  };
}

const WEEK = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const ts = (i: number, h = 12) => at(i, h).getTime();

// ------------------------------------------------------------------ saves

describe('Phase 1 saves', () => {
  it('migrate to version 2 with every Phase 2 field and nothing lost', () => {
    const v1 = { ...newState(MON()), version: 1, xp: 400, gold: 77 } as unknown as Record<string, unknown>;
    for (const k of ['cls', 'skills', 'inventory', 'gear', 'pets', 'bag', 'combat', 'vault', 'epics', 'bounties', 'social', 'counters', 'achievements']) delete v1[k];
    const s = migrate(v1, MON());
    expect(s.version).toBe(2);
    expect(s.xp).toBe(400);
    expect(s.gold).toBe(77);
    expect(s.inventory).toEqual([]);
    expect(s.bag.food).toBe(0);
    expect(s.vault.coffers).toEqual([]);
    expect(s.combat.startDay).toBe(s.today); // already past level 3: the boss starts now
  });
});

// ------------------------------------------------------------------ combat model

describe('combat', () => {
  it('hits 25% harder on tasks that match your class', () => {
    const s = player(12);
    const p = { ...profile({ ...s, cls: { id: 'warrior', day: s.today, changes: 0, lastChange: s.today } }), crit: 0 };
    const plain = { ...profile(s), crit: 0 };
    const h = (pp: typeof p, stats: Stat[]) => hitFor(pp, { stats, hitBase: 100, ts: ts(0), seed: 'x', surge: false }).dmg;
    expect(h(p, ['might']) / h(plain, ['might'])).toBeCloseTo(1.25, 2);
    expect(h(p, ['mind'])).toBe(h(plain, ['mind']));
  });

  it('caps gear at +40% damage, whatever you wear', () => {
    const s = player(60);
    const r = rng('caps');
    for (const [slot, itemSlot] of [['weapon', 'weapon'], ['offhand', 'offhand'], ['trinket1', 'trinket'], ['trinket2', 'trinket'], ['head', 'head']] as const) {
      const it = generateItem(r, { slot: itemSlot, rarity: 'rare', ilvl: 60, day: s.today, source: 't', id: slot });
      it.affixes = [{ kind: 'statDmg', value: 30, stat: 'might' }, { kind: 'dawn', value: 30 }];
      s.inventory.push(it);
      s.gear[slot] = it.id;
    }
    const p = profile(s);
    expect(gearBonus(p, ['might'], 7)).toBeCloseTo(P2.combat.gearDmgMax, 5);
    expect(p.maxHp).toBeLessThanOrEqual(Math.round(p.baseHp * (1 + P2.combat.gearHpMax)));
  });

  it('gives skill points from level 10, about 100 by level 100', () => {
    expect(skillPoints(9)).toBe(0);
    expect(skillPoints(10)).toBe(1);
    expect(skillPoints(20)).toBe(12);
    expect(skillPoints(100)).toBe(100);
  });
});

// ------------------------------------------------------------------ loot

describe('loot', () => {
  it('rolls the same loot if a task is undone and redone, and takes it back on undo', () => {
    // find a task + day that drops something (deterministic seeds)
    let s = player(8);
    const t = task(s, 'Workout');
    let found: { d: number; name: string } | null = null;
    for (let d = 0; d < 40 && !found; d++) {
      vi.setSystemTime(at(d, 9));
      s = rollover(s, at(d, 9));
      const r = A.completeTask(s, t.id);
      const c = r.state.completions.at(-1)!;
      if (c.drop) found = { d, name: JSON.stringify(c.drop.kind === 'item' ? r.state.inventory.find((i) => i.id === (c.drop as { itemId: string }).itemId)?.name : c.drop) };
      s = r.state;
    }
    expect(found).not.toBeNull();
    const c = s.completions.at(-1)!;
    const before = JSON.stringify(s.bag) + s.inventory.length;
    const undone = A.undoCompletion(s, c.id).state;
    expect(JSON.stringify(undone.bag) + undone.inventory.length).not.toBe(before);
    const redo = A.completeTask(undone, t.id).state;
    const c2 = redo.completions.at(-1)!;
    expect(c2.drop?.kind).toBe(c.drop?.kind);
    if (c2.drop?.kind === 'item') expect(redo.inventory.find((i) => i.id === (c2.drop as { itemId: string }).itemId)?.name).toBe(JSON.parse(found!.name));
  });

  it('drops nothing before level 3 and nothing past the weekly cap', () => {
    let s = player(1);
    s = A.completeTask(s, task(s, 'Water').id).state; // level 1 -> 2
    s = A.completeTask(s, task(s, 'Journal').id).state;
    expect(levelFromXp(s.xp)).toBeLessThan(3);
    expect(s.completions.every((c) => !c.drop)).toBe(true);
    s = player(20);
    s.week.selfCounted = RULES.weekCap;
    for (let i = 0; i < 30; i++) s = A.tapHabit(s, task(s, 'Call family').id, 1).state;
    expect(s.completions.every((c) => !c.drop && !c.hit)).toBe(true);
  });
});

// ------------------------------------------------------------------ classes and skills

describe('classes', () => {
  it('opens at level 10 and day 7; the first change is free, then 500 gold and a 7-day wait', () => {
    let s = player(10);
    s.profile.createdDay = '2026-10-21'; // day 6
    expect(G.classReady(s).ready).toBe(false);
    expect(G.chooseClass(s, 'mage').error).toBeTruthy();
    s.profile.createdDay = '2026-10-20'; // day 7
    s = ok(G.chooseClass(s, 'mage'));
    expect(s.mana).toBe(profile(s).maxMana);
    s = ok(G.chooseClass(s, 'cleric')); // first change: free
    expect(s.cls?.changes).toBe(1);
    s.gold = 1000;
    expect(G.chooseClass(s, 'bard').error).toMatch(/7 days/);
    vi.setSystemTime(at(7, 9));
    s = rollover(s, at(7, 9));
    s = ok(G.chooseClass(s, 'bard'));
    expect(s.gold).toBe(1000 - P2.classChange.gold);
  });

  it('spends points in order, respecting prerequisites', () => {
    let s = player(12, {});
    s.cls = { id: 'warrior', day: s.today, changes: 0, lastChange: s.today };
    expect(G.spendPoint(s, 'w-stalwart').error).toMatch(/Tough Hide/);
    s = ok(G.spendPoint(s, 'w-hide'));
    s = ok(G.spendPoint(s, 'w-stalwart'));
    s = ok(G.spendPoint(s, 'w-heavy'));
    expect(G.pointsLeft(s)).toBe(skillPoints(12) - 3);
  });

  it('Arcane Surge triples the next Hard task, and undo re-arms it', () => {
    let s = player(12);
    s.cls = { id: 'mage', day: s.today, changes: 0, lastChange: s.today };
    s.mana = 100;
    const easy = A.completeTask(s, task(s, 'Water').id).state; // Spark spent on an Easy task first
    const base = A.completeTask(easy, task(s, 'Workout').id).state.completions.at(-1)!;
    s = ok(G.castSkill(easy, 'arcaneSurge'));
    s = A.completeTask(s, task(s, 'Workout').id).state;
    const c = s.completions.at(-1)!;
    expect(c.surge).toBe(true);
    expect(c.hit! / base.hit!).toBeCloseTo(3, 1);
    s = A.uncompleteTask(s, task(s, 'Workout').id).state;
    expect(s.combat.surgeArmed).toBe(true);
  });
});

// ------------------------------------------------------------------ the weekly boss

describe('weekly boss', () => {
  it('rotates three bosses, one per week, the same for everyone', () => {
    const seen = new Set([bossForWeek('2026-10-26'), bossForWeek('2026-11-02'), bossForWeek('2026-11-09')]);
    expect(seen.size).toBe(3);
    expect(bossForWeek('2026-11-16')).toBe(bossForWeek('2026-10-26'));
  });

  it('falls on Friday or Saturday at a typical pace, Thursday for heavy, and only late or not at all for light', () => {
    // gear and pet roughly as a player would have them at each level
    const kit = { 6: { gear: 'common', petLevel: 2 }, 10: { gear: 'common', petLevel: 4 }, 20: { gear: 'rare', petLevel: 8 } } as const;
    for (const level of [6, 10, 20] as const) {
      const typical = simulate({ plan: 'typical', level, ...kit[level] }).wonDays[0];
      expect(typical, `typical L${level}`).not.toBeNull();
      expect(typical!, `typical L${level}`).toBeGreaterThanOrEqual(4);
      expect(typical!, `typical L${level}`).toBeLessThanOrEqual(5);
      const heavy = simulate({ plan: 'heavy', level, ...kit[level] }).wonDays[0];
      expect(heavy!, `heavy L${level}`).toBeLessThan(typical!);
      const light = simulate({ plan: 'light', level, ...kit[level] }).wonDays[0];
      expect(light === null || light >= 6, `light L${level}`).toBe(true);
    }
  });

  it('strikes only below 70% party Daily completion; Shield Wall blocks one; Mend gets the Downed up', () => {
    const days = (done: number, sched: number) => Object.fromEntries(WEEK.map((d) => [d, { done, sched, oldTodos: 0, vault: false, fortune: false }]));
    const a = member({ uid: 'a', days: days(1, 4) });
    const b = member({ uid: 'b', days: days(4, 4) });
    let f = resolveFight('2026-10-26', [a, b], '2026-10-29'); // Mon-Wed closed: 5 of 8 = 62%
    expect(f.strikes).toBe(3);
    expect(f.members.find((m) => m.uid === 'a')!.downed).toBe(false); // 3 x 30% leaves 10%
    f = resolveFight('2026-10-26', [a, b], '2026-10-30');
    expect(f.members.every((m) => m.downed)).toBe(true);
    const shielded = member({ uid: 'b', days: days(4, 4), casts: [{ id: 'c1', skill: 'shieldWall', at: ts(0, 9), day: WEEK[0] }] });
    f = resolveFight('2026-10-26', [a, shielded], '2026-10-29');
    expect(f.strikes).toBe(2);
    expect(f.days[0].strike).toBe('blocked');
    const healer = member({ uid: 'b', days: days(4, 4), casts: [{ id: 'm1', skill: 'mend', at: ts(4, 9), day: WEEK[4] }] });
    // Downed Thursday night, Mended Friday morning: up again at 25% before Friday's reset
    f = resolveFight('2026-10-26', [a, healer], '2026-10-30');
    const healed = f.members.find((m) => m.uid === 'a')!;
    expect(healed.downed).toBe(false);
    expect(healed.hp).toBe(25);
  });

  it('a Downed hero deals half damage until revived', () => {
    const hit = (i: number) => ({ id: `h${i}`, at: ts(i), day: WEEK[i], dmg: 100, stats: ['might', 'mind', 'craft', 'bond'] as Stat[] });
    const days = Object.fromEntries(WEEK.map((d) => [d, { done: 0, sched: 4, oldTodos: 0, vault: false, fortune: false }]));
    const m = member({ uid: 'a', level: 60, hits: [hit(0), hit(4)], days });
    const f = resolveFight('2026-10-26', [m], '2026-10-31');
    const dmgMon = f.days[0].damage;
    const dmgFri = f.days[4].damage;
    expect(dmgFri).toBe(Math.round(dmgMon * P2.boss.downedDamage));
  });

  it('Sloth Wyrm is shielded until the party hits 4 different stats that day', () => {
    const week = WEEK.find((d) => bossForWeek(d) === 'slothWyrm') ? '2026-10-26' : '2026-10-26';
    expect(bossForWeek(week)).toBeDefined();
    const sloth = ['2026-10-26', '2026-11-02', '2026-11-09'].find((w) => bossForWeek(w) === 'slothWyrm')!;
    const d0 = sloth;
    const mk = (stats: Stat[]) => member({ uid: 'a', level: 60, week: sloth, joinDay: sloth, lastOpen: d0, hits: stats.map((st, i) => ({ id: `${st}${i}`, at: new Date(`${d0}T1${i}:00:00`).getTime(), day: d0, dmg: 100, stats: [st] })) });
    const narrow = resolveFight(sloth, [mk(['might', 'mind', 'craft'])], d0);
    const wide = resolveFight(sloth, [mk(['might', 'mind', 'craft', 'bond'])], d0);
    expect(narrow.days[0].shielded).toBe(true);
    expect(narrow.days[0].damage).toBe(3 * Math.round(100 * P2.boss.slothShield));
    expect(wide.days[0].damage).toBe(400);
  });

  it('the Procrastinaut heals from week-old to-dos and takes double damage from them', () => {
    const w = ['2026-10-26', '2026-11-02', '2026-11-09'].find((x) => bossForWeek(x) === 'procrastinaut')!;
    const d1 = w;
    const d2 = new Date(`${w}T12:00:00`);
    d2.setDate(d2.getDate() + 1);
    const day2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    const m = member({
      uid: 'a',
      level: 60,
      week: w,
      joinDay: w,
      lastOpen: day2,
      hits: [{ id: 'o', at: new Date(`${d1}T10:00:00`).getTime(), day: d1, dmg: 100, stats: ['craft'], old: true }],
      days: { [d1]: { done: 1, sched: 1, oldTodos: 2, vault: false, fortune: false } },
    });
    const f = resolveFight(w, [m], day2);
    expect(f.days[0].damage).toBe(200);
    expect(f.days[0].healed).toBe(Math.round(2 * P2.boss.procrastHealPer * f.maxHp));
  });

  it('scales HP with party size, leaves Resting members out and prorates a mid-week joiner', () => {
    const solo = resolveFight('2026-10-26', [member({ uid: 'a' })], '2026-10-26');
    const trio = resolveFight('2026-10-26', [member({ uid: 'a' }), member({ uid: 'b' }), member({ uid: 'c' })], '2026-10-26');
    expect(trio.maxHp).toBe(solo.maxHp * 3);
    const resting = member({ uid: 'z', lastOpen: '2026-10-01' });
    expect(resolveFight('2026-10-26', [member({ uid: 'a' }), resting], '2026-10-26').maxHp).toBe(solo.maxHp);
    const late = member({ uid: 'b', joinDay: '2026-10-29' }); // Thursday: 4 days left
    expect(resolveFight('2026-10-26', [member({ uid: 'a' }), late], '2026-10-29').maxHp).toBe(solo.maxHp + Math.round((memberBossHp(10) * 4) / 7));
  });

  it('pays a Rare item and a trophy once when the boss falls', () => {
    let s = setupPlayer({ plan: 'heavy', level: 10, petLevel: 3 });
    const r = playWeek(s, 'heavy');
    s = checkBoss(r.s).state;
    expect(r.wonDay).not.toBeNull();
    const res = s.combat.results.filter((x) => x.week === '2026-10-26');
    expect(res).toHaveLength(1);
    expect(res[0].won).toBe(true);
    expect(s.inventory.some((i) => i.rarity === 'rare' && i.source === 'boss')).toBe(true);
    expect(s.trophies.some((t) => t.kind === 'boss')).toBe(true);
    expect(checkBoss(s).state).toBe(s); // settled once
  });

  it('pets attack once on each day with 3 or more finished tasks', () => {
    let s = setupPlayer({ plan: 'typical', level: 8, petLevel: 5 });
    s = A.completeTask(s, task(s, 'Water').id).state;
    s = A.completeTask(s, task(s, 'Journal').id).state;
    expect(selfSummary(s, 'me').hits.some((h) => h.pet)).toBe(false);
    s = A.completeTask(s, task(s, 'Budget').id).state;
    expect(selfSummary(s, 'me').hits.filter((h) => h.pet)).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ bounties

describe('bounties', () => {
  it('draws 3 from your own list, rerolls once, and pays chests', () => {
    let s = player(5);
    B.ensureBounties(s, s.today);
    expect(s.bounties.list).toHaveLength(3);
    const first = s.bounties.list[0];
    s = ok(B.rerollBounty(s, first.id));
    expect(s.bounties.list.find((b) => b.id === first.id)).toBeUndefined();
    expect(B.rerollBounty(s, s.bounties.list[1].id).error).toBeTruthy();
    for (const t of s.tasks) s = t.type === 'habit' ? A.tapHabit(s, t.id, 1).state : A.completeTask(s, t.id).state;
    for (const b of s.bounties.list) {
      if (!B.bountyProgress(s, b).done) continue;
      const r = B.claimBounty(s, b.id);
      expect(r.events?.[0]).toMatch(/Bounty chest/);
      s = r.state;
    }
    if (s.bounties.list.every((b) => b.claimed)) {
      const gold = s.gold;
      s = B.claimBonusChest(s).state;
      expect(s.gold).toBeGreaterThan(gold);
      expect(s.counters.bountyFullDays).toBe(1);
    }
  });
});

// ------------------------------------------------------------------ the Vault

describe('the Vault', () => {
  it('pays the first entry of the day as a Medium Fortune task, and only the first', () => {
    let s = player(8);
    s = ok(V.addCoffer(s, { name: 'Emergency fund', target: 400, deadline: '2027-03-31' }));
    const id = s.vault.coffers[0].id;
    const xp0 = s.xp;
    s = ok(V.logDeposit(s, id, 5));
    const c = s.completions.at(-1)!;
    expect(c.source).toBe('vault');
    expect(c.tier).toBe('Medium');
    expect(c.stats).toEqual(['fortune']);
    expect(s.xp).toBeGreaterThan(xp0);
    const xp1 = s.xp;
    s = ok(V.logDeposit(s, id, 500)); // same day, much bigger: no extra task pay
    expect(s.completions.filter((x) => x.source === 'vault')).toHaveLength(1);
    // ...but it does cross every milestone, paying four chests, and fills the Coffer
    expect(s.vault.coffers[0].chests).toEqual([25, 50, 75, 100]);
    expect(s.vault.coffers[0].doneDay).toBe(s.today);
    expect(s.xp).toBeGreaterThanOrEqual(xp1); // the monthly Hard bonus may add XP
  });

  it('turns a debt into a dragon: payments hit, overpayments crit, interest heals, a zero balance slays', () => {
    let s = player(8);
    s = ok(V.addDebt(s, { name: 'Card', balance: 1000, apr: 24, minPayment: 50 }));
    const id = s.vault.debts[0].id;
    s = ok(V.logPayment(s, id, 50));
    expect(s.vault.debts[0].entries[0].crit).toBe(false);
    s = ok(V.logPayment(s, id, 200));
    expect(s.vault.debts[0].entries[1].crit).toBe(true);
    expect(s.vault.debts[0].balance).toBe(750);
    vi.setSystemTime(new Date(2026, 10, 2, 9));
    s = rollover(s, new Date(2026, 10, 2, 9)); // November: one month of 24% APR
    expect(s.vault.debts[0].balance).toBe(765);
    s = ok(V.logPayment(s, id, 5000));
    expect(s.vault.debts[0].slainDay).toBe(s.today);
    expect(s.titles).toContain('Dragonslayer');
    s = ok(V.deleteEntry(s, 'debt', id, s.vault.debts[0].entries.at(-1)!.id));
    expect(s.vault.debts[0].slainDay).toBeNull();
    expect(s.vault.debts[0].balance).toBe(765);
  });
});

// ------------------------------------------------------------------ Epics

describe('Epics', () => {
  it('pays one milestone chest a day, delivers the rest later, and gives gear only after 3+ weeks', () => {
    let s = player(8);
    s = ok(E.addEpic(s, { title: 'Run a 5K', deadline: '2026-12-31', milestones: ['Couch to 1K', '2K', '3K', '5K'], linked: [] }));
    const e = s.epics[0];
    s = ok(E.toggleMilestone(s, e.id, e.milestones[0].id));
    s = ok(E.toggleMilestone(s, e.id, e.milestones[1].id));
    expect(s.epicChest.owed).toBe(1);
    vi.setSystemTime(at(1, 9));
    s = rollover(s, at(1, 9));
    expect(s.epicChest.owed).toBe(0);
    s = ok(E.toggleMilestone(s, e.id, e.milestones[2].id));
    s = ok(E.toggleMilestone(s, e.id, e.milestones[3].id));
    expect(s.epics[0].doneDay).toBe(s.today);
    expect(E.epicEarnsGear(s.epics[0])).toBe(false);
    const items = s.inventory.length;
    s = ok(E.claimEpic(s, e.id, 'weapon'));
    expect(s.inventory.length).toBe(items);
    expect(s.trophies.some((t) => t.kind === 'epic')).toBe(true);
    expect(E.projection(s.epics[0], s.today).text).toMatch(/Finished/);
  });
});

// ------------------------------------------------------------------ party co-op

describe('party co-op', () => {
  function inParty(): State {
    const s = player(8);
    s.party = { code: 'ABC123', name: 'Siblings', joined: '2026-10-19', uid: 'me' };
    return s;
  }

  it('applies up to 3 Cheers a day (+5% XP for an hour) and each Rescue once (+0.1 Momentum)', () => {
    let s = inParty();
    s.momentum = 0.7;
    s.days[s.today].momentumStart = 0.7;
    const now = ts(0, 9);
    const cheers = [1, 2, 3, 4].map((i) => ({ id: `c${i}`, to: 'me', at: now }));
    const sam = member({ uid: 'sam', name: 'Sam', cheers, rescues: [{ id: 'r1', to: 'me', at: now }] });
    s = S.ingestParty(s, '2026-10-26', [sam], [], now);
    expect(s.buffs.filter((b) => b.kind === 'cheer')).toHaveLength(P2.social.cheersPerDay);
    expect(s.momentum).toBeCloseTo(0.8, 5);
    const again = S.ingestParty(s, '2026-10-26', [sam], [], now);
    expect(again.momentum).toBeCloseTo(0.8, 5); // not applied twice
    vi.setSystemTime(at(0, 9).getTime() + 30 * 60_000);
    const c = A.completeTask(s, task(s, 'Water').id).state.completions.at(-1)!;
    expect(c.mult).toBeCloseTo(0.8 * 1.05, 2);
  });

  it("applies a teammate's Rally as +10% XP and sends a Rescue with your next task", () => {
    let s = inParty();
    const now = ts(0, 9);
    const bard = member({ uid: 'b', name: 'Bea', buffs: [{ id: 'ral', kind: 'rally', from: 'self', start: now, until: now + 24 * 3600_000, pct: 0.1 }] });
    s = S.ingestParty(s, '2026-10-26', [bard], [], now);
    vi.setSystemTime(now + 60_000);
    const c = A.completeTask(s, task(s, 'Water').id).state.completions.at(-1)!;
    expect(c.mult).toBeCloseTo(1.1, 2);
    s = ok(S.armRescue(s, 'b'));
    s = A.completeTask(s, task(s, 'Journal').id).state;
    expect(s.social.rescues).toHaveLength(1);
    expect(S.armRescue(s, 'b').error).toMatch(/One Rescue a day/);
  });
});

// ------------------------------------------------------------------ pets and achievements

describe('pets and achievements', () => {
  it('hatches an egg with a potion, once per combination', () => {
    let s = player(5);
    s.bag.eggs.fox = 2;
    s.bag.potions.moss = 2;
    s = ok(G.hatchPet(s, 'fox', 'moss'));
    expect(s.activePet).toBe(s.pets[0].id);
    expect(G.hatchPet(s, 'fox', 'moss').error).toMatch(/already/);
  });

  it('defines 30 unique achievements and awards the first on your first task', () => {
    expect(ACHIEVEMENTS).toHaveLength(30);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(30);
    let s = A.finishOnboarding(newState(MON()), 'New', 'gentle', []).state;
    s = A.addTask(s, { type: 'todo', title: 'Call the bank', effort: 2, minutes: 10, dread: 3, stats: ['fortune'] }).state;
    s = A.completeTask(s, s.tasks[0].id).state;
    s = checkAchievements(s).state;
    expect(s.achievements['first-spark']).toBe(s.today);
  });

  it('opens systems level by level, with a starter egg at level 4', () => {
    let s = A.finishOnboarding(newState(MON()), 'New', 'gentle', []).state;
    s = A.addTask(s, { type: 'habit', title: 'Pushups', effort: 4, minutes: 45, dread: 4, stats: ['might'] }).state;
    while (levelFromXp(s.xp) < 4) s = A.tapHabit(s, s.tasks[0].id, 1).state, (s.days[s.today].selfCounted = 0), (s.week.selfCounted = 0), (s.completions = []);
    expect(s.combat.startDay).toBe(s.today);
    expect(Object.values(s.bag.eggs).reduce((a, b) => a + (b ?? 0), 0)).toBe(1);
    expect(s.bounties.list.length).toBeGreaterThan(0);
  });

  it('settles a solo week as a loss when the boss survives, and the Gremlin keeps what it stole', () => {
    const gw = ['2026-10-26', '2026-11-02', '2026-11-09'].find((x) => bossForWeek(x) === 'goldGremlin')!;
    const wk = ['2026-10-26', '2026-11-02', '2026-11-09'].indexOf(gw);
    let s = setupPlayer({ plan: 'light', level: 30 });
    s.tasks = s.tasks.filter((t) => t.title === 'Water'); // a very light week, no Fortune tasks
    s.gold = 200;
    let r = { s, wonDay: null as number | null };
    for (let w = 0; w <= wk; w++) r = playWeek(r.s, 'light', w);
    vi.setSystemTime(at(0, 9, wk + 1));
    s = rollover(r.s, at(0, 9, wk + 1));
    const res = s.combat.results.find((x) => x.week === gw)!;
    expect(res.won).toBe(false);
    expect(res.gremlinGold).toBe(7 * P2.boss.gremlinSteal);
  });
});

describe('fight view', () => {
  it('shows a current fight once the boss is unlocked', () => {
    const s = player(5);
    const f = currentFight(s)!;
    expect(f.maxHp).toBe(memberBossHp(5));
    expect(f.hp).toBe(f.maxHp);
    expect(xpForLevel(5)).toBeGreaterThan(0);
  });
});
