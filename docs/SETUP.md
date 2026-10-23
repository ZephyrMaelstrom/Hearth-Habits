# Setup

Three things to do once: publish the app, turn on sync, and get testers on it.
The app works without sync (each phone keeps its own save), so you can start
testing as soon as step 1 is done.

## 1. Publish the app (GitHub Pages)

Every push to `main` runs the tests, builds the app and publishes it to
<https://zephyrmaelstrom.github.io/Hearth-Habits/> through
`.github/workflows/deploy.yml`.

One-time setting, if the first run's **deploy** job fails:

1. Repo **Settings → Pages**.
2. Under **Build and deployment → Source**, pick **GitHub Actions**.
3. **Actions** tab → **Test and deploy** → **Run workflow** (or push any commit).

## 2. Turn on sync (Firebase, free tier)

Sync lets a player use the same hero on a phone and a computer, and gives you
a Gate 1 dashboard in the Firebase console. About 10 minutes.

1. Go to <https://console.firebase.google.com> → **Create a project** → name it
   `hearth-habits`. Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**.
   Pick your email as the support email and save.
3. **Authentication → Settings → Authorized domains → Add domain** →
   `zephyrmaelstrom.github.io`.
4. **Build → Firestore Database → Create database** → pick a location near you
   (`us-central` is fine) → **Start in production mode**.
5. **Firestore → Rules** tab → replace everything with the contents of
   [`firestore.rules`](../firestore.rules) → **Publish**. These rules let each
   signed-in player read and write only their own data.
6. **Project settings** (gear icon) → **Your apps** → the **</>** (Web) button →
   nickname `hearth-web` → **Register app**. Firebase hosting is not needed.
7. Copy the `firebaseConfig` object it shows and paste it into
   [`src/firebase-config.ts`](../src/firebase-config.ts), replacing `null`:

   ```ts
   export const firebaseConfig: FirebaseOptions | null = {
     apiKey: 'AIza...',
     authDomain: 'hearth-habits.firebaseapp.com',
     projectId: 'hearth-habits',
     storageBucket: 'hearth-habits.firebasestorage.app',
     messagingSenderId: '...',
     appId: '1:...:web:...',
   };
   ```

   You can do this right in GitHub: open the file, click the pencil, paste,
   **Commit changes**. The site redeploys on its own in about two minutes.

The web config is safe to commit. It only identifies the project; the
Firestore rules are what keep data private.

After that, **Settings → Sync across devices → Sign in with Google** appears in
the app. A new phone that signs in pulls the saved hero down; after that the
newest change wins.

## 3. Run Gate 1

Gate 1 passes when family testers **open the app on at least 12 of 14 days**
and **finish more Dailies in week 2 than in week 1**. Aim for 12 or more
testers, with at least a few on Android.

How testers join:

1. Send them the link.
2. **iPhone:** open it in Safari → Share → **Add to Home Screen**.
   **Android:** open it in Chrome → menu → **Install app**, or tap
   **Install Hearth & Habits** in the app's Settings.
3. Open the app from the home screen icon every day for two weeks.

How you read the results, either way:

- **With sync on:** Firebase console → Firestore → `testers` collection. One
  document per tester with `daysOpened`, `week1Done`, `week2Done`,
  `openedOk` and `improvedOk`.
- **Without sync:** each tester opens **Settings → Tester report → Copy
  report** after day 14 and texts it to you.

## 4. Phase 2: the preview, then shipping it

Phase 2 (the game layer) lives on the `phase-2` branch. It's published as a
**preview** beside the main app, so Gate 1 testers on the main link are never
affected:

- **Main app (Gate 1 testers):** <https://zephyrmaelstrom.github.io/Hearth-Habits/>
- **Phase 2 preview:** <https://zephyrmaelstrom.github.io/Hearth-Habits/preview/>

The preview keeps its own save on each device and its own cloud copy
(`users/{uid}/state/preview`), and never writes the Gate 1 tester report.
**Settings → Copy my main game into the preview** starts it from your real
hero. Installed to a home screen, it's labelled "Hearth Preview".

Every push to `phase-2` runs the tests, then republishes the site with the
preview updated (the **Preview** workflow triggers **Test and deploy** on
`main`).

### Publish the new Firestore rules (needed for parties)

Parties use a new `parties` collection. Until the rules allow it, creating or
joining a party shows a "rules don't allow parties yet" message.

1. Firebase console → **Firestore Database → Rules**.
2. Replace everything with the current [`firestore.rules`](../firestore.rules)
   → **Publish**.

The new rules still give every player access only to their own save. They add:
anyone signed in who knows a party's code can join it (6 members max), only
members can read the party's weekly summaries, and each player can only write
their own.

### Ship Phase 2 to everyone (after Gate 1 passes)

1. On GitHub, open a pull request from `phase-2` into `main`, then merge it.
2. The main app updates within about two minutes. Existing saves upgrade
   automatically (version 1 to version 2) with nothing lost. Players already
   past level 3 start their first boss week right away, and Ember explains
   each new system as their budget of notes allows.
3. Optional cleanup: delete the `phase-2` branch. The preview stops updating;
   the last preview build stays at `/preview/` until the next main deploy.

## 5. Phase 3: Ember's AI, reminders and Gate 3 numbers

Phase 3 is on the `phase-3` branch and published as the preview at
<https://zephyrmaelstrom.github.io/Hearth-Habits/preview/>. The hourly Ember
job (Actions tab → **Ember**) does the server work. It needs three repository
secrets: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | What it does | Where to get it |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Lets the job read saves and write Ember's notes | Firebase console → **Project settings → Service accounts → Generate new private key**. Paste the whole JSON file's contents. |
| `ANTHROPIC_API_KEY` | AI morning plans and weekly reviews | <https://console.anthropic.com> → **API keys**. Add a few dollars of credit; a player costs about $0.04 a month. |
| `VAPID_PRIVATE_KEY` | Push reminders | The private key that matches `src/push-config.ts` (sent to you with these notes). To make a new pair: `cd server && npx web-push generate-vapid-keys`, then put the public key in `src/push-config.ts`. |

Any secret can be left out: no `ANTHROPIC_API_KEY` means template plans only,
and no `VAPID_PRIVATE_KEY` means no pushes. Each run's summary says what's
missing.

**Publish the latest rules.** Paste [`firestore.rules`](../firestore.rules)
into **Firestore Database → Rules** and click **Publish**. Phase 3 makes
Ember's notes read-only for players, adds feedback and adds the public
`content/` folder.

**Test it in two minutes.**
1. In the preview, sign in, turn on **Settings → Ember's AI**, and turn on
   **Push notifications** (on iPhone, from the Home Screen app).
2. **Actions → Ember → Run workflow**. Set **force_hour** to your morning plan
   hour (for example 8) and leave **dry_run** off.
3. Within a minute, a push arrives and the morning plan on Today switches to
   the AI version, labelled "Written with AI". The run's summary shows counts
   and the Gate 3 table.

**Tune without a release (optional).** In Firestore, create the collection
`content`, document `tuning`, with number fields `bossHp` and `dropRate` (1 is
normal, 0.5 to 2 allowed) and the boolean `aiEnabled` (set it to `false` to stop
all AI calls at once).

**Read Gate 3.** Every day at noon UTC, and on every manual run, the Ember job
writes `ops/metrics` and adds a Gate 3 table to the run's summary: day-7
retention (target 30%), day-30 (15%), scheduled Dailies finished (70%) and AI
cost per active player (under $0.10). Feedback from testers is in the
`feedback` collection.

**Ship Phase 3.** Merge `phase-3` into `main` with a pull request, as you did
with Phase 2. Saves upgrade on their own. Once nothing is left unmerged, the
Ember job runs from `main`.

## Running it on your own computer

You need Node 20 or newer.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # engine and play-through tests
npm run build    # production build in dist/
```
