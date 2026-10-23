# Hearth & Habits

A habit-building RPG with a friendly wisp named Ember. You do real-life tasks,
your hero levels up, and a balancing engine keeps the rewards fair, so a hard,
dreaded task pays more than an easy one and spamming taps can't buy levels.

**Play it:** <https://zephyrmaelstrom.github.io/Hearth-Habits/>
**Preview (next phase):** <https://zephyrmaelstrom.github.io/Hearth-Habits/preview/> (separate save)
Install it from the browser to your home screen; it works offline.

## What's in Phase 3 (the closed beta, on the `phase-3` branch)

Ember's AI morning plan and weekly review (opt-in, Claude Haiku 5.5),
push reminders with quiet hours, a warmer onboarding with first steps, in-app
feedback, remote tuning, and an hourly job on GitHub Actions (`server/`) that
also measures Gate 3. See [docs/PHASE3_NOTES.md](docs/PHASE3_NOTES.md).

## What's in Phase 2 (the game layer)

Classes and skill trees, nine-slot gear (drops only), pets, a weekly boss in
three rotations, parties with Cheers and Rescues, daily bounties, the Vault
(Coffers and Debt Dragons), simple Epics and 30 achievements. None of it
changes task XP. See [docs/PHASE2_NOTES.md](docs/PHASE2_NOTES.md).

## What's in this build (Phase 1: the core loop)

- **Tasks.** Dailies on chosen weekdays, Habits with + and −, and To-dos with
  due dates. Write your own or pick from a library of 100 ready-made ones,
  each written as a cue and an action ("After I get home from work, I will
  walk for 20 minutes").
- **Balancing Engine.** Each task is priced from Effort, Dread and minutes
  into one of five tiers (Trivial 5 XP up to Epic 60 XP), with a live preview
  while you edit. Momentum rewards finishing what you schedule, a weekly cap
  and a daily ceiling stop runaway self-reporting, and a Daily Spark pays the
  first task of each day.
- **Character.** Levels, seven stats (Might, Vigor, Mind, Craft, Spirit,
  Bond, Fortune) shown as a heptagon, Harmony for balanced growth, and
  Graduation: a Daily you keep up at 95% for four weeks becomes a permanent
  trait.
- **Forgiveness.** Rest days, four Rough Days a month, and Vacation mode (up
  to 14 days) protect streaks and Momentum.
- **Rewards.** Price your own real-life treats in gold, sized from what you
  actually earn. A cosmetic shop sells cloaks, hats and held items; gold buys
  looks, never power.
- **Ember.** Template messages in four tones (cheerful, dry, stoic, gentle),
  a talkativeness setting, and a daily budget. Dismiss a kind of note three
  times and she stops sending it.
- **Install and sync.** Installable PWA, saves on the device, optional Google
  sign-in sync through Firebase.
- **Tester report.** Settings shows Gate 1 numbers (days opened, Dailies in
  week 1 and week 2).

The full plan is in the design document.

## Setup

See [docs/SETUP.md](docs/SETUP.md) for publishing, turning on sync and running
the Gate 1 test.

```sh
npm install
npm run dev
npm test
```

## Code map

| Folder | What's there |
| --- | --- |
| `src/engine` | Game rules with no UI: pricing, levels, Momentum, day rollover, actions, Ember's messages, tester metrics. `rules.ts` holds every tuning number (`RULES` from Phase 0, `P2` for Phase 2). Phase 2 adds `combat.ts`, `boss.ts` (the shared fight resolver), `loot.ts`, `game.ts`, `bounties.ts`, `vault.ts`, `epics.ts`, `social.ts`, `achievements.ts` and `content/`. |
| `src/store` | Saved state (localStorage), Firebase sync, party sync, install prompt. |
| `src/ui` | React screens: Today, Hero, Rewards, Settings, onboarding, task editor, Ember's panel. |
| `server` | The hourly Ember job: AI plans and reviews, push reminders, Gate 3 metrics. `lib/` is plain logic shared with the tests; `hourly.ts` talks to Firebase, Claude and web push. |
| `tests` | Engine tests that re-check the Phase 0 balancing numbers, Phase 2 tests (with a boss-week simulator in `sim.ts`), plus a full play-through of the app. |
