# Phase 3 update notes: the closed beta

Phase 3 gets the game ready for a closed beta. Ember can write her morning
plan and weekly review with AI, reminders arrive as push notifications,
onboarding is warmer, new players get a short first-steps checklist, testers
can send feedback from the app, and an hourly job measures Gate 3. Task XP
and every balancing rule are unchanged.

## What's new for players

### Ember's AI (opt-in)
- With **Settings → Ember's AI** turned on, the **morning plan** and the **weekly review** are written by Claude Haiku 5.5 in your chosen tone. Each one uses your real numbers: today's Dailies, how you usually do on this weekday, to-dos due, the boss, your streaks.
- The design doc's split holds. The rules engine still decides when Ember speaks and what about; AI only decides how she says it. If AI is off, slow or unavailable, her written templates appear exactly as before.
- A morning plan can carry one button, picked by Claude from a fixed list and checked by the game: move a named to-do to tomorrow, rest a named Daily today, or take a rough day.
- **What Ember knows about you:** your goals, what helps you, and any other notes, all written by you. You can see, edit or wipe them in Settings at any time.
- Notes written with AI are labelled "Written with AI."
- **Privacy:** when AI is on, your task titles, stats, recent days and those notes go to Anthropic's Claude, only to write your plan and review. Hearth & Habits never uses them to train anything. Nothing is sent while AI is off.
- **Safety:** if anything you write in your notes mentions self-harm or a crisis, Ember skips the AI entirely and shows the 988 crisis line. The AI follows the same rule, never gives medical, mental-health or financial advice, and never guilts.
- AI needs sign-in, because the hourly job reads your synced save.

### Reminders (opt-in, push notifications)
- **Morning plan** at the hour you choose, and an optional **evening reminder** that only comes on days with Dailies still open, at most one a day. The evening reminder warns you if the boss will strike tonight.
- **Quiet hours** (10 pm to 7 am by default): no notifications during them.
- No notifications at all for anyone away 14 days or more. Ember never nags absent players.
- Works on Android, desktop browsers, and iPhone or iPad once the app is added to the Home Screen.

### Onboarding and first steps
- A new step asks which parts of life matter most to you (up to three), when you want your morning plan, and whether to turn on AI. Starter tasks lean toward the areas you pick and still fit the 6 starting slots.
- New players get a **First steps** card on Today: finish a task, tap Ember, add your own task, visit your Hero, and pick your morning time. Each step pays 10 gold, plus 25 more for all five. Players upgrading from Phase 2 who are past level 3 skip it.

### Feedback
- **Settings → Send feedback** goes straight to you, with the tester's level and app version and never their task names.

## What's new for you (the developer)
- **The hourly Ember job** (`.github/workflows/ember.yml`, code in `server/`) runs free on GitHub Actions. It writes the AI morning plans and weekly reviews, sends pushes, and tracks AI spend each month. It runs code from the newest unmerged `phase-N` branch, so you can test a preview before it merges.
- **Gate 3 numbers**, computed daily and on every manual run: day-7 and day-30 retention, the share of scheduled Dailies finished, and AI cost per active player. They appear in the run's summary on the Actions tab and in Firestore at `ops/metrics`. They're aggregates only, never names.
- **Remote tuning without a release:** create a Firestore document `content/tuning` with `bossHp` and `dropRate` (multipliers between 0.5 and 2), and `aiEnabled` (`false` switches all AI off). Every player reads the same document, so party fights still agree.
- **Firestore rules:** Ember's notes are read-only for players, feedback is create-only, and `content/` is public to read.

## Changes from the design doc
- **The design doc** puts this work in Firebase Cloud Functions. That needs Firebase's paid Blaze plan, so it runs on GitHub Actions instead: free, the same game code, about once an hour. The main costs of this choice:
  - The morning plan arrives within the hour after your chosen time, not to the minute.
  - There's no live chat with Ember yet. That needs an always-on server, which is either Cloud Functions or a small worker.
- **Weekly reviews** use regular calls rather than the Batch API. At family scale the difference is fractions of a cent; batching can come later.
- **Analytics** come from players' synced saves rather than Firebase Analytics with BigQuery. They cover every Gate 3 measure without another product to set up.

## Cost
At Claude Haiku 5.5 prices ($0.10 per million input tokens, $0.50 per million output, $0.01 per million cached input), a player with AI on costs about $0.04 a month, well under the Gate 3 limit of $0.10. The job records actual spend in `ops/usage-YYYY-MM` and reports it per active player.

## Tests
- 72 automated tests in total. The 14 new ones cover local time across a daylight-saving change, the scheduling windows, opt-ins, quiet hours and away players, the evening reminder, what's sent to Claude, checking Claude's replies, crisis handling, cost maths, turning AI text into buttons, reminder validation, first steps, onboarding picks, remote tuning and the Gate 3 maths.
- All earlier tests are unchanged.
