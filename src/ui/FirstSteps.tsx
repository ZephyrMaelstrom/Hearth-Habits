import { dismissSteps, FIRST_STEPS, STEP_GOLD, STEPS_BONUS } from '../engine/companion';
import type { State } from '../engine/types';
import { act } from '../store/store';
import { Icon } from './components';

/** A short checklist for new players: each step pays a little gold. */
export function FirstSteps({ s }: { s: State }) {
  if (s.firstSteps.dismissed) return null;
  const done = s.firstSteps.done;
  return (
    <section className="card warm stack" aria-labelledby="fs-h">
      <div className="between">
        <h2 id="fs-h">First steps</h2>
        <button type="button" className="link-btn" style={{ color: 'var(--muted)' }} onClick={() => act(dismissSteps)}>
          Hide
        </button>
      </div>
      <span className="tiny muted">
        {STEP_GOLD} gold each, {STEPS_BONUS} more for all {FIRST_STEPS.length}.
      </span>
      <div className="stack" style={{ gap: 6 }}>
        {FIRST_STEPS.map((st) => {
          const ok = done.includes(st.id);
          return (
            <div key={st.id} className="row small" style={ok ? { color: 'var(--muted)', textDecoration: 'line-through' } : undefined}>
              <Icon name={ok ? 'star' : 'flame'} size={14} color={ok ? 'var(--accent)' : 'var(--muted)'} />
              {st.label}
            </div>
          );
        })}
      </div>
    </section>
  );
}
