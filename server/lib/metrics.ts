// Gate 3 numbers, from players' saves (main app only):
//   day-7 retention at least 30%, day-30 at least 15%,
//   at least 70% of scheduled Dailies finished,
//   AI cost under $0.10 per active player (a month).
// Aggregates only: no names, no task titles.

import { addDays, daysBetween } from '../../src/engine/dates';
import type { DayKey, State } from '../../src/engine/types';

export interface Gate3 {
  players: number;
  active7: number;
  d7: { eligible: number; retained: number; rate: number | null };
  d30: { eligible: number; retained: number; rate: number | null };
  dailies: { done: number; scheduled: number; share: number | null };
  ai: { month: string; costUsd: number; calls: number; perActive: number | null };
  pass: { d7: boolean | null; d30: boolean | null; dailies: boolean | null; ai: boolean | null };
}

function openedBetween(s: State, from: DayKey, to: DayKey): boolean {
  for (let d = from; d <= to; d = addDays(d, 1)) if (s.days[d]?.opened) return true;
  return false;
}

export function gate3(states: State[], today: DayKey, ai: { month: string; costUsd: number; calls: number }): Gate3 {
  const players = states.filter((s) => s.profile.onboarded);
  const ret = (n: number) => {
    const eligible = players.filter((s) => daysBetween(s.profile.createdDay, today) >= n + 7);
    const retained = eligible.filter((s) => openedBetween(s, addDays(s.profile.createdDay, n), addDays(s.profile.createdDay, n + 6)));
    return { eligible: eligible.length, retained: retained.length, rate: eligible.length ? retained.length / eligible.length : null };
  };
  let done = 0;
  let scheduled = 0;
  for (const s of players) {
    for (let i = 1; i <= 14; i++) {
      const log = s.days[addDays(today, -i)];
      if (!log?.closed) continue;
      done += log.done ?? 0;
      scheduled += log.scheduled ?? 0;
    }
  }
  const active7 = players.filter((s) => openedBetween(s, addDays(today, -6), today)).length;
  const d7 = ret(7);
  const d30 = ret(30);
  const share = scheduled ? done / scheduled : null;
  const perActive = active7 ? ai.costUsd / active7 : null;
  return {
    players: players.length,
    active7,
    d7,
    d30,
    dailies: { done, scheduled, share },
    ai: { ...ai, perActive },
    pass: {
      d7: d7.rate === null ? null : d7.rate >= 0.3,
      d30: d30.rate === null ? null : d30.rate >= 0.15,
      dailies: share === null ? null : share >= 0.7,
      ai: perActive === null ? null : perActive < 0.1,
    },
  };
}

const pct = (r: number | null) => (r === null ? 'not enough data yet' : `${Math.round(r * 100)}%`);
const mark = (p: boolean | null) => (p === null ? '·' : p ? 'PASS' : 'not yet');

export function gate3Markdown(g: Gate3, label: string): string {
  return [
    `### Gate 3 (${label})`,
    '',
    '| Measure | Target | Now | |',
    '| --- | --- | --- | --- |',
    `| Day-7 retention | 30% | ${pct(g.d7.rate)} (${g.d7.retained} of ${g.d7.eligible}) | ${mark(g.pass.d7)} |`,
    `| Day-30 retention | 15% | ${pct(g.d30.rate)} (${g.d30.retained} of ${g.d30.eligible}) | ${mark(g.pass.d30)} |`,
    `| Scheduled Dailies finished (last 14 days) | 70% | ${pct(g.dailies.share)} (${g.dailies.done} of ${g.dailies.scheduled}) | ${mark(g.pass.dailies)} |`,
    `| AI cost per active player (${g.ai.month}) | under $0.10 | ${g.ai.perActive === null ? 'no active players' : `$${g.ai.perActive.toFixed(3)}`} ($${g.ai.costUsd.toFixed(3)} total, ${g.ai.calls} calls) | ${mark(g.pass.ai)} |`,
    '',
    `${g.players} players, ${g.active7} active in the last 7 days.`,
  ].join('\n');
}
