import { useCallback, useEffect, useRef, useState } from 'react';
import * as A from '../engine/actions';
import type { WispMessage } from '../engine/types';
import { act, tick, useGame } from '../store/store';
import { Icon } from './components';
import { Hero } from './Hero';
import { Onboarding } from './Onboarding';
import { Rewards } from './Rewards';
import { Settings } from './Settings';
import { TaskEditor } from './TaskEditor';
import { Today } from './Today';
import { WispPanel } from './WispPanel';

type Tab = 'today' | 'hero' | 'rewards' | 'settings';
const TABS: { id: Tab; label: string; icon: 'today' | 'hero' | 'rewards' | 'settings' }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'hero', label: 'Hero', icon: 'hero' },
  { id: 'rewards', label: 'Rewards', icon: 'rewards' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function App() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('today');
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [wispOpen, setWispOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    if (!m) return;
    setToastMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(''), 3200);
  }, []);

  // keep the game on today's date: on focus, on return to the tab, and every minute
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const iv = setInterval(() => tick(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(iv);
    };
  }, []);

  const onWispAction = useCallback(
    (m: WispMessage, i: number) => {
      const a = m.actions[i]?.action;
      if (!a) return;
      let err: string | undefined;
      switch (a.type) {
        case 'roughDay':
          err = act(A.startRoughDay);
          if (!err) toast('Rough day on: only your top 3 Dailies count today.');
          break;
        case 'graduate':
          err = act((st) => A.acceptGraduation(st, a.taskId));
          if (!err) toast('Graduated! A new Trait is on your Hero sheet.');
          break;
        case 'moveTodo':
          err = act((st) => A.moveTodoToTomorrow(st, a.taskId));
          if (!err) toast('Moved to tomorrow.');
          break;
        case 'editTask':
          setWispOpen(false);
          setEditor({ id: a.taskId });
          break;
        case 'openTab':
          setWispOpen(false);
          setTab(a.tab as Tab);
          break;
        case 'dismiss':
          act((st) => A.dismissMessage(st, m.id, true));
          return;
      }
      if (err) return toast(err);
      act((st) => A.dismissMessage(st, m.id, false));
    },
    [toast],
  );

  if (!s.profile.onboarded) return <Onboarding />;

  return (
    <div className="app">
      {tab === 'today' && <Today openEditor={(id) => setEditor({ id })} openWisp={() => setWispOpen(true)} onWispAction={onWispAction} toast={toast} />}
      {tab === 'hero' && <Hero />}
      {tab === 'rewards' && <Rewards toast={toast} />}
      {tab === 'settings' && <Settings toast={toast} />}

      <div className="tabbar">
        <nav aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {editor && <TaskEditor taskId={editor.id} onClose={() => setEditor(null)} toast={toast} />}
      {wispOpen && <WispPanel onClose={() => setWispOpen(false)} onAction={onWispAction} />}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
