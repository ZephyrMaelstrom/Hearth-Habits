// The weekly boss fight. One resolver handles both the solo Shadow boss and a
// party of up to six: it replays the week day by day from each member's shared
// summary (damage, Daily completion, skills used), so every member's phone
// arrives at the same result without a server.
//
// Rules from the design doc:
//  - Monday to Sunday. Every paid task hits the boss; class, skills and gear boost it.
//  - HP scales with party size and level, so a typical pace wins Friday or Saturday.
//  - At each daily reset the boss strikes only if the party's combined Daily
//    completion is below 70%. Teammates see the party total, never who missed.
//  - Strikes cost fight HP only. At 0 you're Downed: half damage until a Cleric
//    or a potion gets you up. Nothing outside the fight is lost.
//  - Win: everyone gets a Rare item, a trophy and an egg chance.

import { addDays, daysBetween, shortDay, weekStart } from './dates';
import { bossForWeek, BOSSES, memberBossHp } from './content/bosses';
import { petAttack, petLevel } from './content/pets';
import { profile } from './combat';
import { chestText, openChest } from './loot';
import { levelFromXp, statLevels } from './progress';
import { P2 } from './rules';
import { completionFor, scheduledDailies, uid } from './state';
import { say } from './wisp';
import type { BossId, BossResult, DayKey, MemberSummary, State } from './types';

// ------------------------------------------------------------------ your summary

/** Build what you share with your party (or fight solo with) for a week. */
export function selfSummary(s: State, memberId: string, week: DayKey = weekStart(s.today)): MemberSummary {
  const p = profile(s);
  const e = p.effects;
  const weekEnd = addDays(week, 6);
  const lastDay = s.today < weekEnd ? s.today : weekEnd;
  const inWeek = (d: DayKey) => d >= week && d <= weekEnd;
  const comps = s.completions.filter((c) => inWeek(c.day) && c.kind !== 'habitMinus');
  const hits: MemberSummary['hits'] = comps
    .filter((c) => (c.hit ?? 0) > 0)
    .map((c) => ({ id: c.id, at: c.ts, day: c.day, dmg: c.hit!, stats: c.stats, ...(c.old ? { old: true } : {}) }));
  // the battle pet attacks once on each day with 3 or more finished tasks
  const pet = s.pets.find((x) => x.id === s.activePet);
  const days: MemberSummary['days'] = {};
  for (let d = week; d <= lastDay; d = addDays(d, 1)) {
    const dayComps = comps.filter((c) => c.day === d).sort((a, b) => a.ts - b.ts);
    if (pet && dayComps.length >= P2.pets.tasksToAttack) {
      const third = dayComps[P2.pets.tasksToAttack - 1];
      hits.push({ id: `pet:${d}`, at: third.ts + 1, day: d, dmg: petAttack(petLevel(pet.xp), p.petDmg), stats: [], pet: true });
    }
    const log = s.days[d];
    let done = 0;
    let sched = 0;
    if (d === s.today && !log?.closed) {
      const vacation = !!s.vacationUntil && d <= s.vacationUntil;
      if (!vacation) {
        const rough = log?.rough;
        const due = scheduledDailies(s, d).filter((t) => !t.restDays?.includes(d) && (!rough || rough.keep.includes(t.id)));
        sched = due.length;
        done = due.filter((t) => completionFor(s, t.id, d)).length;
      }
    } else if (log) {
      sched = log.scheduled ?? 0;
      done = log.done ?? 0;
    }
    days[d] = {
      done,
      sched,
      oldTodos: log?.closed ? (log.oldTodos ?? 0) : 0,
      vault: dayComps.some((c) => c.source === 'vault'),
      fortune: dayComps.some((c) => c.counted > 0 && c.stats.includes('fortune')),
    };
  }
  const startDay = s.combat.startDay ?? week;
  let joinDay = startDay > week ? startDay : week;
  if (s.party && s.party.joined > joinDay) joinDay = s.party.joined;
  const recent = s.completions
    .filter((c) => c.kind !== 'habitMinus' && c.counted > 0 && c.day >= addDays(s.today, -1))
    .slice(-8)
    .map((c) => ({ id: c.id, at: c.ts, tier: c.tier, stats: c.stats }));
  const gainedThisWeek = s.completions.filter((c) => c.day >= week).reduce((a, c) => a + c.xp, 0);
  return {
    uid: memberId,
    name: s.profile.name || 'Adventurer',
    level: levelFromXp(s.xp),
    fightLevel: levelFromXp(Math.max(0, s.xp - gainedThisWeek)),
    cls: s.cls?.id ?? null,
    title: s.title,
    shape: statLevels(s),
    avatar: { ...s.equipped },
    week,
    joinDay,
    lastOpen: s.today,
    lanternLow: s.momentum < P2.social.lanternBelow,
    maxHp: p.maxHp,
    aura: {
      inspire: e.inspire * (1 + p.bondBoost),
      beacon: e.beacon,
      ward: e.ward,
      warcry: e.warcry,
      crescendo: e.crescendo,
      unbreakable: e.unbreakable,
      secondWind: e.secondWind,
      ironRhythm: e.ironRhythm,
      mendPct: (0.25 + e.mendBonus) * (1 + p.bondBoost),
      cheerHeal: e.cheerHeal,
      strikeResist: p.resist,
    },
    hits: hits.sort((a, b) => a.at - b.at),
    days,
    casts: s.combat.casts.filter((c) => inWeek(c.day)),
    buffs: s.buffs.filter((b) => b.from === 'self'),
    cheers: s.social.cheers.filter((c) => c.at >= new Date(`${week}T00:00:00`).getTime()),
    rescues: s.social.rescues.filter((c) => c.at >= new Date(`${week}T00:00:00`).getTime()),
    recent,
    updatedAt: s.updatedAt,
  };
}

// ------------------------------------------------------------------ the resolver

export interface FightMember {
  uid: string;
  name: string;
  hp: number;
  maxHp: number;
  downed: boolean;
  damage: number;
  resting: boolean;
}

export interface FightDay {
  day: DayKey;
  damage: number;
  shielded: boolean;
  healed: number;
  gremlin: boolean;
  ratio: number | null;
  strike: 'none' | 'hit' | 'blocked' | 'tonight';
}

export interface Fight {
  week: DayKey;
  boss: BossId;
  maxHp: number;
  hp: number;
  wonDay: DayKey | null;
  over: boolean;
  members: FightMember[];
  days: FightDay[];
  strikes: number;
  gremlinDays: DayKey[];
  shieldPending: number;
  /** Today's party Daily completion so far (strikes happen below 70% at reset). */
  todayRatio: number | null;
}

const H = 3600_000;

export function resolveFight(week: DayKey, members: MemberSummary[], today: DayKey): Fight {
  const B = P2.boss;
  const boss = bossForWeek(week);
  const weekEnd = addDays(week, 6);
  const lastDay = today < weekEnd ? today : weekEnd;
  const resting = (m: MemberSummary) => daysBetween(m.lastOpen, lastDay) >= B.restingAfterDays;
  const active = members.filter((m) => !resting(m));
  const prorate = (m: MemberSummary) => {
    const start = m.joinDay > week ? m.joinDay : week;
    return Math.max(1, daysBetween(start, weekEnd) + 1) / 7;
  };
  const maxHp = Math.max(1, Math.round(active.reduce((a, m) => a + memberBossHp(m.fightLevel ?? m.level) * Math.min(1, prorate(m)), 0)));
  let hp = maxHp;
  const st = new Map(active.map((m) => [m.uid, { hp: m.maxHp, downed: false, damage: 0, secondWindUsed: false, downedDay: '' as DayKey }]));
  const inspire = Math.max(0, ...active.map((m) => m.aura.inspire));
  const beacon = active.some((m) => m.aura.beacon);
  // damage windows: Warcry after Shield Wall, Rally with Crescendo
  const windows: { start: number; end: number; pct: number }[] = [];
  for (const m of active) {
    for (const c of m.casts) if (c.skill === 'shieldWall' && m.aura.warcry > 0) windows.push({ start: c.at, end: c.at + 24 * H, pct: m.aura.warcry });
    for (const b of m.buffs) if (b.kind === 'rally' && (b.dmgPct ?? 0) > 0) windows.push({ start: b.start, end: b.until, pct: b.dmgPct! });
  }
  let shieldPending = 0;
  let wardPending = false;
  let wonDay: DayKey | null = null;
  let strikes = 0;
  const gremlinDays: DayKey[] = [];
  const days: FightDay[] = [];

  for (let d = week; d <= lastDay; d = addDays(d, 1)) {
    const fd: FightDay = { day: d, damage: 0, shielded: false, healed: 0, gremlin: false, ratio: null, strike: 'none' };
    days.push(fd);
    // Second Wind: back up at 30% the day after being Downed
    for (const m of active) {
      const x = st.get(m.uid)!;
      if (x.downed && m.aura.secondWind && !x.secondWindUsed && x.downedDay && x.downedDay < d) {
        x.downed = false;
        x.hp = Math.round(m.maxHp * 0.3);
        x.secondWindUsed = true;
      }
    }
    // skills and potions used that day
    const casts = active.flatMap((m) => m.casts.filter((c) => c.day === d).map((c) => ({ m, c }))).sort((a, b) => a.c.at - b.c.at);
    for (const { m, c } of casts) {
      if (c.skill === 'shieldWall') shieldPending += 1;
      else if (c.skill === 'mend') {
        for (const t of active) {
          const x = st.get(t.uid)!;
          const heal = Math.round(t.maxHp * m.aura.mendPct);
          x.hp = Math.min(t.maxHp, x.hp + heal);
          if (x.downed) x.downed = false;
        }
        if (m.aura.ward) wardPending = true;
      } else if (c.skill === 'potion') {
        const x = st.get(m.uid)!;
        x.hp = Math.min(m.maxHp, x.hp + Math.round(m.maxHp * B.potionHeal));
        x.downed = false;
      }
    }
    // cheers from a Cheerleader Bard heal the teammate
    for (const m of active) {
      if (!m.aura.cheerHeal) continue;
      for (const ch of m.cheers) {
        if (dayOf(ch.at) !== d) continue;
        const t = active.find((x) => x.uid === ch.to);
        const x = t && st.get(t.uid);
        if (t && x && !x.downed) x.hp = Math.min(t.maxHp, x.hp + Math.round(t.maxHp * 0.1));
      }
    }
    // hits
    const dayHits = active.flatMap((m) => m.hits.filter((h) => h.day === d).map((h) => ({ m, h }))).sort((a, b) => a.h.at - b.h.at);
    let shieldFactor = 1;
    if (boss === 'slothWyrm') {
      const statsHit = new Set(dayHits.flatMap(({ h }) => h.stats));
      fd.shielded = statsHit.size < B.slothStats;
      if (fd.shielded) shieldFactor = B.slothShield;
    }
    for (const { m, h } of dayHits) {
      const x = st.get(m.uid)!;
      let dmg = h.dmg;
      if (x.downed && !beacon) dmg *= B.downedDamage;
      dmg *= 1 + inspire;
      const win = windows.filter((w) => h.at >= w.start && h.at < w.end).reduce((a, w) => a + w.pct, 0);
      dmg *= 1 + win;
      const md = m.days[d];
      if (m.aura.ironRhythm > 0 && md && md.sched > 0 && md.done >= md.sched) dmg *= 1 + m.aura.ironRhythm;
      if (boss === 'procrastinaut' && h.old) dmg *= 2;
      dmg = Math.round(dmg * shieldFactor);
      x.damage += dmg;
      fd.damage += dmg;
      hp -= dmg;
      if (hp <= 0) {
        hp = 0;
        wonDay = d;
        break;
      }
    }
    if (wonDay) break;

    const joined = active.filter((m) => (m.joinDay > week ? m.joinDay : week) <= d);
    let sched = 0;
    let done = 0;
    for (const m of joined) {
      sched += m.days[d]?.sched ?? 0;
      done += m.days[d]?.done ?? 0;
    }
    fd.ratio = sched ? done / sched : null;
    if (d >= today) {
      if (fd.ratio !== null && fd.ratio < B.strikeBelow) fd.strike = 'tonight';
      continue; // today isn't settled yet
    }
    // ---- the nightly reset
    if (boss === 'procrastinaut') {
      const old = joined.reduce((a, m) => a + (m.days[d]?.oldTodos ?? 0), 0);
      const heal = Math.round(Math.min(B.procrastHealCap, B.procrastHealPer * old) * maxHp);
      const before = hp;
      hp = Math.min(maxHp, hp + heal);
      fd.healed = hp - before;
    }
    if (boss === 'goldGremlin') {
      const guarded = joined.some((m) => m.days[d]?.vault || m.days[d]?.fortune);
      if (!guarded) {
        fd.gremlin = true;
        gremlinDays.push(d);
      }
    }
    if (fd.ratio !== null && fd.ratio < B.strikeBelow) {
      if (shieldPending > 0) {
        shieldPending -= 1;
        fd.strike = 'blocked';
      } else {
        fd.strike = 'hit';
        strikes += 1;
        for (const m of joined) {
          const x = st.get(m.uid)!;
          const dmg = B.strikePct * m.maxHp * (1 - m.aura.strikeResist) * (m.aura.unbreakable ? 0.75 : 1) * (wardPending ? 0.5 : 1);
          x.hp = Math.max(0, Math.round(x.hp - dmg));
          if (x.hp === 0 && !x.downed) {
            x.downed = true;
            x.downedDay = d;
          }
        }
        wardPending = false;
      }
    }
  }

  const todayFd = days.find((x) => x.day === today);
  return {
    week,
    boss,
    maxHp,
    hp: Math.max(0, hp),
    wonDay,
    over: !!wonDay || today > weekEnd,
    members: members.map((m) => {
      const x = st.get(m.uid);
      return { uid: m.uid, name: m.name, hp: x?.hp ?? m.maxHp, maxHp: m.maxHp, downed: x?.downed ?? false, damage: x?.damage ?? 0, resting: !x };
    }),
    days,
    strikes,
    gremlinDays,
    shieldPending,
    todayRatio: todayFd?.ratio ?? null,
  };
}

function dayOf(ts: number): DayKey {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ------------------------------------------------------------------ the current fight

/** The id you fight under: your account id when in a party, else this device. */
export function memberId(s: State): string {
  return s.party?.uid ?? s.profile.deviceId;
}

/** The fight for `week` from your save (and your party's last-synced summaries). */
export function fightFor(s: State, week: DayKey): Fight | null {
  if (!s.combat.startDay || s.combat.startDay > addDays(week, 6)) return null;
  const me = selfSummary(s, memberId(s), week);
  const pv = s.partyView;
  let others: MemberSummary[] = [];
  if (s.party && pv) {
    if (pv.week === week) others = pv.members;
    else if (addDays(pv.week, -7) === week) others = pv.prev ?? [];
  }
  return resolveFight(week, [me, ...others.filter((m) => m.uid !== me.uid)], s.today);
}

export function currentFight(s: State): Fight | null {
  return fightFor(s, weekStart(s.today));
}

// ------------------------------------------------------------------ settling a week

/** Grant (or not) the week's rewards once. Mutates s. Returns toast lines. */
export function settleWeek(s: State, fight: Fight, myId: string): string[] {
  if (s.combat.results.some((r) => r.week === fight.week)) return [];
  const me = fight.members.find((m) => m.uid === myId);
  const def = BOSSES[fight.boss];
  const result: BossResult = {
    week: fight.week,
    boss: fight.boss,
    won: !!fight.wonDay,
    wonDay: fight.wonDay,
    damage: me?.damage ?? 0,
    strikes: fight.strikes,
    party: fight.members.length > 1,
    members: fight.members.filter((m) => !m.resting).length,
    gremlinGold: 0,
  };
  const events: string[] = [];
  if (result.won) {
    const res = openChest(s, 'boss', `${s.profile.deviceId}|${fight.week}|boss`);
    events.push(`${def.name} defeated! ${chestText(s, 'boss', res)}`);
    s.trophies.push({ id: uid(), kind: 'boss', label: `${def.name}, week of ${shortDay(fight.week)}`, day: s.today });
    s.counters.bossWins += 1;
    if (!s.counters.bossKinds.includes(fight.boss)) s.counters.bossKinds.push(fight.boss);
    if (fight.strikes === 0) s.counters.flawless += 1;
    if (fight.boss === 'goldGremlin') {
      s.gold += P2.boss.gremlinHoard;
      result.gremlinGold = -P2.boss.gremlinHoard;
      events.push(`The Gremlin's hoard: +${P2.boss.gremlinHoard} gold.`);
    }
    say(s, 'boss', { boss: def.name, won: 1 }, [{ label: 'See the loot', action: { type: 'openTab', tab: 'hero' } }], { prompted: true });
  } else {
    if (fight.boss === 'goldGremlin') {
      // the Gremlin only takes from days you actually played
      const days = fight.gremlinDays.filter((d) => s.days[d]?.opened).length;
      const stolen = Math.min(s.gold, days * P2.boss.gremlinSteal);
      s.gold -= stolen;
      result.gremlinGold = stolen;
    }
    say(s, 'boss', { boss: def.name, won: 0, left: Math.round((fight.hp / fight.maxHp) * 100) }, [], { prompted: true });
  }
  s.combat.results = [...s.combat.results, result].slice(-12);
  return events;
}

/**
 * Settle anything due: a boss beaten this week, or last week once it's over.
 * Returns the same state when nothing changed.
 */
export function checkBoss(state: State): { state: State; events: string[] } {
  if (!state.combat.startDay) return { state, events: [] };
  const week = weekStart(state.today);
  const prev = addDays(week, -7);
  const settled = (w: DayKey) => state.combat.results.some((r) => r.week === w);
  const due: Fight[] = [];
  if (!settled(prev) && state.combat.startDay <= addDays(prev, 6)) {
    const f = fightFor(state, prev);
    if (f) due.push(f);
  }
  if (!settled(week)) {
    const f = fightFor(state, week);
    if (f?.wonDay) due.push(f);
  }
  if (!due.length) return { state, events: [] };
  const s = structuredClone(state);
  s.updatedAt = Date.now();
  const events = due.flatMap((f) => settleWeek(s, f, memberId(s)));
  return { state: s, events };
}

// ------------------------------------------------------------------ skills and potions

export function bossWeekLabel(week: DayKey) {
  return `${shortDay(week)} to ${shortDay(addDays(week, 6))}`;
}
