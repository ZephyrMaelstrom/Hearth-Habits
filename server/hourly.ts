// The hourly Ember job (run by .github/workflows/ember.yml).
//
// For every signed-in player (main app and preview saves):
//   - writes Ember's AI morning plan in the player's morning window (opt-in),
//   - writes the AI weekly review once a week from Monday morning (opt-in),
//   - sends the morning plan and the optional evening reminder as push
//     notifications (opt-in, outside quiet hours, never to players away 14+ days).
// Once a day (and on manual runs) it computes the Gate 3 numbers.
//
// The repo is public, so this job logs counts only: never names, task titles,
// emails or AI text.

process.env.TZ = 'UTC';

import { appendFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { migrate } from '../src/engine/state';
import { rollover, morningPlan } from '../src/engine/rollover';
import { scheduledDailies } from '../src/engine/state';
import { setTuning } from '../src/engine/tuning';
import { VAPID_PUBLIC_KEY } from '../src/push-config';
import type { State } from '../src/engine/types';
import { askClaude } from './lib/claude';
import { gate3, gate3Markdown } from './lib/metrics';
import { costOf, crisisInMemory, CRISIS_TEXT, lastWeekStart, parseReply, planContext, reviewContext, type Usage } from './lib/prompts';
import { dueFor, eveningText, type AiDocState } from './lib/schedule';
import { localTime } from './lib/time';

const env = process.env;
const DRY = env.DRY_RUN === 'true';
const FORCE_HOUR = env.FORCE_HOUR && env.FORCE_HOUR.trim() !== '' ? Number(env.FORCE_HOUR) : null;
const MANUAL = env.GITHUB_EVENT_NAME === 'workflow_dispatch';
const summary: string[] = ['## Ember hourly run', ''];
const log = (line: string) => {
  console.log(line);
  summary.push(line);
};
const finish = () => {
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
};

async function main() {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    log('- Missing the FIREBASE_SERVICE_ACCOUNT secret, so there is nothing to do yet. See docs/SETUP.md, section 5.');
    return;
  }
  initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = getFirestore();
  const now = new Date();

  const tuningSnap = await db.doc('content/tuning').get();
  const tuning = tuningSnap.data() ?? {};
  setTuning(tuning);
  const aiAvailable = !!env.ANTHROPIC_API_KEY && tuning.aiEnabled !== false;
  const pushAvailable = !!env.VAPID_PRIVATE_KEY;
  if (pushAvailable) webpush.setVapidDetails('https://zephyrmaelstrom.github.io/Hearth-Habits/', VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY!);
  log(`- AI: ${aiAvailable ? 'on' : env.ANTHROPIC_API_KEY ? 'off (content/tuning.aiEnabled is false)' : 'off (no ANTHROPIC_API_KEY secret)'}; push: ${pushAvailable ? 'on' : 'off (no VAPID_PRIVATE_KEY secret)'}${DRY ? '; DRY RUN' : ''}${FORCE_HOUR !== null ? `; pretending local hour ${FORCE_HOUR}` : ''}`);

  // every saved game: users/{uid}/state/{main|preview}
  const stateDocs = await db.collectionGroup('state').get();
  const pushDocs = pushAvailable ? await db.collectionGroup('push').get() : null;
  const devices = new Map<string, { ref: FirebaseFirestore.DocumentReference; sub: webpush.PushSubscription }[]>();
  pushDocs?.forEach((d) => {
    const uid = d.ref.parent.parent?.id;
    const data = d.data() as { sub?: webpush.PushSubscription; channel?: string };
    if (!uid || !data.sub?.endpoint) return;
    const key = `${uid}|${data.channel ?? 'main'}`;
    devices.set(key, [...(devices.get(key) ?? []), { ref: d.ref, sub: data.sub }]);
  });

  const counts = { players: 0, morningAi: 0, weeklyAi: 0, morningPush: 0, eveningPush: 0, aiFailed: 0, pushFailed: 0, pushRemoved: 0, crisis: 0 };
  const usage: Required<Usage> & { calls: number; cost: number } = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, calls: 0, cost: 0 };
  const aiPlayers = new Set<string>();
  const mainStates: State[] = [];
  const previewStates: State[] = [];

  const send = async (key: string, payload: object) => {
    let sent = 0;
    for (const dev of devices.get(key) ?? []) {
      if (DRY) {
        sent++;
        continue;
      }
      try {
        await webpush.sendNotification(dev.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await dev.ref.delete().catch(() => undefined);
          counts.pushRemoved++;
        } else counts.pushFailed++;
      }
    }
    return sent;
  };

  const ask = async (uid: string, ctx: unknown, kind: 'morning' | 'weekly', check?: Parameters<typeof parseReply>[2]) => {
    if (DRY) return { text: '(dry run)', suggestion: null };
    const { reply, error } = await askClaude(env.ANTHROPIC_API_KEY!, ctx);
    if (!reply) {
      counts.aiFailed++;
      console.log(`  AI call failed: ${error}`);
      return null;
    }
    usage.calls++;
    usage.input_tokens += reply.usage.input_tokens ?? 0;
    usage.output_tokens += reply.usage.output_tokens ?? 0;
    usage.cache_creation_input_tokens += reply.usage.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += reply.usage.cache_read_input_tokens ?? 0;
    usage.cost += costOf(reply.usage);
    aiPlayers.add(uid);
    const parsed = parseReply(reply.text, kind, check);
    if (!parsed) counts.aiFailed++;
    return parsed;
  };

  for (const doc of stateDocs.docs) {
    const uid = doc.ref.parent.parent?.id;
    const channel = doc.id;
    const raw = doc.data().data;
    if (!uid || typeof raw !== 'string') continue;
    let s: State;
    try {
      s = migrate(JSON.parse(raw));
    } catch {
      continue;
    }
    if (!s.profile.onboarded) continue;
    counts.players++;
    const local = localTime(now, s.profile.tz);
    if (FORCE_HOUR !== null) {
      local.hour = FORCE_HOUR;
      local.wall.setHours(FORCE_HOUR);
    }
    // bring the save to the player's own today (not written back)
    s = rollover(s, local.wall);
    (channel === 'preview' ? previewStates : mainStates).push(s);

    const key = `${uid}|${channel}`;
    const aiRef = db.doc(`users/${uid}/ai/${channel}`);
    const done = ((await aiRef.get()).data() ?? {}) as AiDocState & { morning?: { day: string; text: string } | null };
    const due = dueFor(s, local, done, { aiAvailable, pushAvailable, hasDevice: (devices.get(key) ?? []).length > 0 });
    const updates: Record<string, unknown> = {};

    let morningText: string | null = done.morning?.day === local.day ? done.morning.text : null;
    if (due.morningAi) {
      if (crisisInMemory(s)) {
        counts.crisis++;
        updates.morning = { day: local.day, text: CRISIS_TEXT, suggestion: null, at: Date.now() };
        morningText = CRISIS_TEXT;
      } else {
        const ctx = planContext(s, local.day);
        const todoIds = ctx.todos.map((t) => t.id);
        const dailyIds = ctx.dailies.filter((d) => !d.doneAlready && !d.restDay).map((d) => d.id);
        const r = await ask(uid, ctx, 'morning', { todoIds, dailyIds, dailyCount: scheduledDailies(s, local.day).length });
        if (r) {
          updates.morning = { day: local.day, text: r.text, suggestion: r.suggestion, at: Date.now() };
          morningText = r.text;
          counts.morningAi++;
        }
      }
    }
    if (due.weeklyAi) {
      const start = lastWeekStart(local.day);
      const ctx = reviewContext(s, start);
      const week = addWeek(start);
      if (!ctx.dailiesScheduled && !ctx.xp) updates.weekly = { week, text: '', at: Date.now() }; // nothing to review
      else if (crisisInMemory(s)) updates.weekly = { week, text: CRISIS_TEXT, at: Date.now() };
      else {
        const r = await ask(uid, ctx, 'weekly');
        if (r) {
          updates.weekly = { week, text: r.text, at: Date.now() };
          counts.weeklyAi++;
        }
      }
    }
    if (due.morningPush) {
      const body = morningText ?? morningPlan(s, local.day).text;
      if (await send(key, { title: 'Ember', body, tag: 'morning', url: './' })) counts.morningPush++;
      updates.lastMorningPush = local.day;
    }
    if (due.eveningPush) {
      if (await send(key, { title: 'Ember', body: eveningText(s, local.day), tag: 'evening', url: './' })) counts.eveningPush++;
      updates.lastEvening = local.day;
    }
    if (Object.keys(updates).length && !DRY) await aiRef.set(updates, { merge: true });
  }

  // AI spend for the month, for the Gate 3 cost check
  const month = localTime(now, 'America/Chicago').day.slice(0, 7);
  const usageRef = db.doc(`ops/usage-${month}`);
  if (usage.calls && !DRY) {
    const players: Record<string, boolean> = {};
    aiPlayers.forEach((p) => (players[p] = true));
    await usageRef.set(
      {
        calls: FieldValue.increment(usage.calls),
        costUsd: FieldValue.increment(usage.cost),
        inputTokens: FieldValue.increment(usage.input_tokens),
        outputTokens: FieldValue.increment(usage.output_tokens),
        cacheWriteTokens: FieldValue.increment(usage.cache_creation_input_tokens),
        cacheReadTokens: FieldValue.increment(usage.cache_read_input_tokens),
        players,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  }

  log(
    `- ${counts.players} players. AI morning plans: ${counts.morningAi}, weekly reviews: ${counts.weeklyAi}, failed: ${counts.aiFailed}. Pushes: ${counts.morningPush} morning, ${counts.eveningPush} evening, ${counts.pushFailed} failed, ${counts.pushRemoved} expired devices removed.${counts.crisis ? ` Crisis resources shown: ${counts.crisis}.` : ''}`,
  );
  if (usage.calls) log(`- This run: ${usage.calls} Claude calls, $${usage.cost.toFixed(4)} (${usage.cache_read_input_tokens} cached input tokens).`);

  // Gate 3, once a day at noon UTC and on every manual run
  if (MANUAL || now.getUTCHours() === 12) {
    const u = (await usageRef.get()).data() ?? {};
    const today = localTime(now, 'America/Chicago').day;
    const main = gate3(mainStates, today, { month, costUsd: Number(u.costUsd ?? 0), calls: Number(u.calls ?? 0) });
    const preview = gate3(previewStates, today, { month, costUsd: 0, calls: 0 });
    if (!DRY) await db.doc('ops/metrics').set({ at: Date.now(), day: today, main, preview });
    summary.push('', gate3Markdown(main, 'main app'));
  }
}

function addWeek(mondayOfLastWeek: string): string {
  const d = new Date(`${mondayOfLastWeek}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

main()
  .catch((e) => {
    log(`- The run failed: ${e instanceof Error ? e.message.split('\n')[0] : 'unknown error'}`);
    process.exitCode = 1;
  })
  .finally(finish);
