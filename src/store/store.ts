// One store for the whole app: the State lives here, is saved to this device on
// every change, and is handed to sync when sync is on.

import { useSyncExternalStore } from 'react';
import type { Result } from '../engine/actions';
import { rollover } from '../engine/rollover';
import { migrate, newState } from '../engine/state';
import type { State } from '../engine/types';
import { STORAGE_KEY } from '../channel';

const KEY = STORAGE_KEY;
type Listener = () => void;

let state: State = load();
const listeners = new Set<Listener>();
let onChange: ((s: State) => void) | null = null;

function load(): State {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const s = raw ? migrate(JSON.parse(raw)) : newState();
    return rollover(s, new Date());
  } catch {
    return newState();
  }
}

function save(s: State) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the game keeps running in memory */
  }
}

export function getState(): State {
  return state;
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next: State, fromSync = false) {
  if (next === state) return;
  state = next;
  save(state);
  listeners.forEach((l) => l());
  if (!fromSync) onChange?.(state);
}

/** Run an engine action; returns its error message, if any. */
export function act(fn: (s: State) => Result): string | undefined {
  const r = fn(state);
  if (r.error) return r.error;
  set(r.state);
  return undefined;
}

/** Bring the game up to the current day (call on open, focus and every minute). */
export function tick(now: Date = new Date()) {
  set(rollover(state, now));
}

/** Replace local state with a newer copy from sync. */
export function replaceFromSync(remote: State) {
  set(rollover(migrate(remote), new Date()), true);
}

export function replaceFromImport(raw: unknown) {
  set(rollover(migrate(raw), new Date()));
}

export function resetAll() {
  set(newState());
}

export function onStateChange(fn: (s: State) => void) {
  onChange = fn;
}

export function useGame(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** For tests: start from a given state. */
export function __setStateForTests(s: State) {
  state = s;
  listeners.forEach((l) => l());
}
