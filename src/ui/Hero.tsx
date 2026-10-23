import { activeDailies, dailySlots, harmony, levelFromXp, levelProgress, statLevels, STAT_HINT, STAT_LABEL } from '../engine/progress';
import { RULES } from '../engine/rules';
import { STATS } from '../engine/types';
import { useGame } from '../store/store';
import { Avatar, Bar, Heptagon } from './components';

export function Hero() {
  const s = useGame();
  const lp = levelProgress(s.xp);
  const lv = statLevels(s);
  const h = harmony(s);
  const slots = dailySlots(lp.level);
  const used = activeDailies(s.tasks).length;
  const classDay = Math.max(0, RULES.classMinDay - Object.values(s.days).filter((d) => d.opened).length);

  return (
    <main className="screen" aria-label="Hero">
      <div className="hero-top">
        <Avatar equipped={s.equipped} size={72} />
        <div className="stack grow" style={{ gap: 4 }}>
          <h1>{s.profile.name}</h1>
          <span className="small muted">
            Level {lp.level} · Adventurer · {Math.floor(s.xp).toLocaleString('en-US')} XP
          </span>
          <Bar value={lp.into / lp.need} label={`Level progress ${Math.floor(lp.into)} of ${lp.need}`} />
        </div>
      </div>

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
            const p = levelProgress(s.statXp[st] ?? 0);
            return (
              <div key={st} className="stat">
                <div className="between">
                  <b>{STAT_LABEL[st]}</b>
                  <span className="small">Lv {p.level}</span>
                </div>
                <Bar value={p.into / p.need} label={`${STAT_LABEL[st]} progress`} />
                <span className="tiny muted">{STAT_HINT[st]}</span>
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
            : `A new slot opens every ${RULES.slots.perLevels} levels, up to ${RULES.slots.max}. Next at level ${(Math.floor(levelFromXp(s.xp) / RULES.slots.perLevels) + 1) * RULES.slots.perLevels}.`}
        </p>
      </section>

      <section className="card stack">
        <h2>Class</h2>
        <p className="small muted">
          Classes open at level {RULES.classLevel}
          {classDay > 0 ? `, and no sooner than your ${RULES.classMinDay}th day (${classDay} to go)` : ''}. They arrive in the next update, with skill trees, gear and the weekly party boss.
        </p>
      </section>
    </main>
  );
}
