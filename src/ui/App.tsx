import { useCallback, useEffect, useRef, useState } from 'react';
import * as A from '../engine/actions';
import { markStep } from '../engine/companion';
import type { WispMessage } from '../engine/types';
import { act, onEvents, tick, useGame } from '../store/store';
import { IS_PREVIEW } from '../channel';
import { Icon, type IconName } from './components';
import { Hero, type HeroView } from './Hero';
import { Onboarding } from './Onboarding';
import { Quest } from './Quest';
import { Settings } from './Settings';
import { TaskEditor } from './TaskEditor';
import { Today } from './Today';
import { Treasury, type TreasuryView } from './Treasury';
import { WispPanel } from './WispPanel';

type Tab = 'today' | 'quest' | 'hero' | 'treasury' | 'settings';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'quest', label: 'Quest', icon: 'quest' },
  { id: 'hero', label: 'Hero', icon: 'hero' },
  { id: 'treasury', label: 'Treasury', icon: 'treasury' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function App() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('today');
  const [heroView, setHeroView] = useState<HeroView>('stats');
  const [treasuryView, setTreasuryView] = useState<TreasuryView>('rewards');
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [wispOpen, setWispOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const queue = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // toasts show one at a time, so a crit plus loot plus an achievement all get read
  const next = useCallback(function show() {
    if (timer.current) clearTimeout(timer.current);
    const m = queue.current.shift();
    if (!m) {
      timer.current = null;
      setToastMsg('');
      return;
    }
    setToastMsg(m);
    timer.current = setTimeout(show, 2800);
  }, []);
  const toast = useCallback(
    (m: string) => {
      if (!m) return;
      queue.current.push(m);
      if (!timer.current) next();
    },
    [next],
  );
  useEffect(() => {
    onEvents((lines) => {
      queue.current.push(...lines);
      if (!timer.current) next();
    });
  }, [next]);

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

  const openTab = useCallback((target: string) => {
    const [t, sub] = target.split(':');
    if (t === 'rewards') {
      setTab('treasury');
      setTreasuryView('rewards');
    } else if (t === 'hero') {
      setTab('hero');
      if (sub) setHeroView(sub as HeroView);
      act((st) => markStep(st, 'hero'));
    } else if (t === 'treasury') {
      setTab('treasury');
      if (sub) setTreasuryView(sub as TreasuryView);
    } else setTab(t as Tab);
    window.scrollTo?.(0, 0);
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
        case 'restTask':
          err = act((st) => A.restToday(st, a.taskId));
          if (!err) toast('Planned rest today. It won’t count against Momentum.');
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
          openTab(a.tab);
          break;
        case 'dismiss':
          act((st) => A.dismissMessage(st, m.id, true));
          return;
      }
      if (err) return toast(err);
      act((st) => A.dismissMessage(st, m.id, false));
    },
    [toast, openTab],
  );

  if (!s.profile.onboarded) return <Onboarding />;

  return (
    <div className="app">
      {IS_PREVIEW && <div className="preview-ribbon">Preview build · separate save from the main app</div>}
      {tab === 'today' && (
        <Today openEditor={(id) => setEditor({ id })} openWisp={() => (setWispOpen(true), act((st) => markStep(st, 'ember')))} onWispAction={onWispAction} toast={toast} openQuest={() => openTab('quest')} />
      )}
      {tab === 'quest' && <Quest toast={toast} goSettings={() => openTab('settings')} />}
      {tab === 'hero' && <Hero view={heroView} setView={setHeroView} toast={toast} />}
      {tab === 'treasury' && <Treasury view={treasuryView} setView={setTreasuryView} toast={toast} />}
      {tab === 'settings' && <Settings toast={toast} />}

      <div className="tabbar">
        <nav aria-label="Main" className="five">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => openTab(t.id)}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {editor && <TaskEditor taskId={editor.id} onClose={() => setEditor(null)} toast={toast} />}
      {wispOpen && <WispPanel onClose={() => setWispOpen(false)} onAction={onWispAction} />}
      {toastMsg && (
        <div className="toast" role="status" onClick={next}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
