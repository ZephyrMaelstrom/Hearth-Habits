// One store for the whole app: the State lives here, is saved to this device on
// every change, and is handed to sync when sync is on.

import { useSyncExternalStore } from 'react';
import type { Result } from '../engine/actions';
import { rollover } from '../engine/rollover';
import { migrate, newState } from '../engine/state';
import { checkBoss } from '../engine/boss';
import { checkAchievements } from '../engine/achievements';
import type { State } from '../engine/types';
import { STORAGE_KEY } from '../channel';

const KEY = STORAGE_KEY;
type Listener = () => void;

const listeners = new Set<Listener>();
let onChange: ((s: State) => void) | null = null;
let eventSink: ((lines: string[]) => void) | null = null;
let state: State = load();

function load(): State {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const s = raw ? migrate(JSON.parse(raw)) : newState();
    return post(rollover(s, new Date())).state;
  } catch {
    return newState();
  }
}

/** After any change: settle a beaten boss and award new achievements. */
function post(s: State): { state: State; events: string[] } {
  if (!s.profile.onboarded) return { state: s, events: [] };
  const b = checkBoss(s);
  const a = checkAchievements(b.state);
  return { state: a.state, events: [...b.events, ...a.earned.map((n) => `Achievement unlocked: ${n}`)] };
}

function emitEvents(lines: string[]) {
  if (lines.length) eventSink?.(lines);
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

/** Run an engine action; returns its error message, if any. Loot and other news go to the event sink. */
export function act(fn: (s: State) => Result): string | undefined {
  const r = fn(state);
  if (r.error) return r.error;
  const p = post(r.state);
  set(p.state);
  emitEvents([...(r.events ?? []), ...p.events]);
  return undefined;
}

/** Bring the game up to the current day (call on open, focus and every minute). */
export function tick(now: Date = new Date()) {
  const p = post(rollover(state, now));
  set(p.state);
  emitEvents(p.events);
}

/** Where loot, crits and achievements are announced (the app shows them as toasts). */
export function onEvents(fn: (lines: string[]) => void) {
  eventSink = fn;
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
