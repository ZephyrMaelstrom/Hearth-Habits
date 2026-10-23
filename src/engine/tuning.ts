// Remote tuning: two multipliers the developer can change from the Firebase
// console (content/tuning) without a new build, to tune from real data.
// Every player in a party reads the same document, so fights still agree.

import type { Tuning } from './types';

const DEFAULTS: Tuning = { bossHp: 1, dropRate: 1 };
let current: Tuning = { ...DEFAULTS };

const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === 'number' && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);

export function tuning(): Tuning {
  return current;
}

/** Apply a tuning document. Values are clamped to 0.5x to 2x. */
export function setTuning(t: Partial<Record<keyof Tuning, unknown>> | null | undefined) {
  current = {
    bossHp: clamp(t?.bossHp, 0.5, 2, DEFAULTS.bossHp),
    dropRate: clamp(t?.dropRate, 0.5, 2, DEFAULTS.dropRate),
  };
}
