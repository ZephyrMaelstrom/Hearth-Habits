import { useEffect } from 'react';
import * as A from '../engine/actions';
import type { WispMessage } from '../engine/types';
import { activeMessages } from '../engine/wisp';
import { act, useGame } from '../store/store';
import { Sheet } from './components';

export function WispPanel({ onClose, onAction }: { onClose: () => void; onAction: (m: WispMessage, i: number) => void }) {
  const s = useGame();
  const msgs = activeMessages(s);
  useEffect(() => {
    act(A.markMessagesRead);
  }, []);
  return (
    <Sheet title="Ember" onClose={onClose}>
      {msgs.length === 0 && <p className="muted">Nothing new. Ember speaks up at milestones, unlocks and when a plan might help.</p>}
      {msgs.map((m) => (
        <div key={m.id} className="card wisp-msg">
          <div className="mini-orb" aria-hidden="true" />
          <div className="stack grow">
            <p>{m.text}</p>
            {m.ai && <span className="tiny muted">Written with AI</span>}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {m.actions.map((a, i) => (
                <button key={i} type="button" className={`btn small ${a.action.type === 'dismiss' ? 'ghost' : 'primary'}`} onClick={() => onAction(m, i)}>
                  {a.label}
                </button>
              ))}
              {!m.actions.some((a) => a.action.type === 'dismiss') && (
                <button type="button" className="btn small ghost" onClick={() => act((st) => A.dismissMessage(st, m.id, m.actions.length > 0))}>
                  {m.actions.length ? 'Dismiss' : 'Got it'}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      <p className="tiny muted">Change how often Ember speaks, and whether AI writes her morning plan and weekly review, in Settings. Talking back to her arrives in a later update.</p>
    </Sheet>
  );
}
