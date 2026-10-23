# Phase 2 update notes: the game layer

Phase 2 adds everything that turns the habit tracker into an RPG: classes,
gear, pets, a weekly boss, parties, bounties, the Vault, Epics and
achievements. None of it changes how much XP a task pays. Every Phase 0 rule
(tiers, Momentum, the 1,400 weekly cap, the 300 daily ceiling, the Spark) is
untouched, and the Phase 1 tests still pass unchanged.

## What's new

### The weekly boss (level 3)
- A new boss every Monday, in rotation: **Sloth Wyrm**, **The Procrastinaut**, **Gold Gremlin**. Everyone fights the same one each week.
- Every task you finish hits it. Damage is based on the XP the task actually paid, so faking tasks can't win a fight either.
- It strikes back only on nights your party (or you, solo) finishes less than 70% of the day's Dailies. Strikes cost fight HP only. At 0 HP you're Downed and deal half damage until a Cleric or a healing potion gets you up. Nothing outside the fight is ever lost.
- Each boss has a weakness that's a real behavior:
  - **Sloth Wyrm** is shielded each day until you hit 4 different stats.
  - **The Procrastinaut** heals for every to-do 7+ days overdue and takes double damage when you finish those to-dos.
  - **Gold Gremlin** pockets 15 gold a night unless someone logs a Vault entry or finishes a Fortune task. Beat it and you keep your gold and get its 30-gold hoard.
- A win gives a Rare item, a trophy and a 50% egg chance.
- Tuned by simulation: a typical player wins on Friday or Saturday, a heavy player on Thursday, and a light player on Sunday or just misses.
- Solo players fight a Shadow version scaled to one person. Boss HP is locked to your level at the start of the week, so levelling up mid-fight never makes it harder.

### Classes and skill trees (level 10, from day 7)
- **Warrior** (tank), **Mage** (burst damage), **Cleric** (healer), **Bard** (support).
- Tasks that match your class's two main stats hit 25% harder.
- Each class has a signature skill that costs Mana: Shield Wall, Arcane Surge, Mend or Rally. Mana refills 25% a day, or 50% on days you finish a Spirit task.
- Each class has a 7-node skill tree. You get a point per level from 10, plus a bonus every 10 levels.
- Your first class change is free. After that it costs 500 gold and has a 7-day cooldown. Resetting tree points costs 100 gold.

### Gear (loot from level 3)
- Nine slots: head, chest, legs, hands, feet, weapon, off-hand and two trinkets. Rarities go from Common to Rare. Gear only drops; gold can't buy it.
- Harder tasks drop loot more often: 2% for Trivial up to 30% for Epic. Fortune nudges the odds toward better rarity, and Craft makes gear bonuses stronger.
- Gear is capped at +40% damage, +40% of base HP and +10% gold, and it never adds XP.
- Loot is rolled from the task and the day, so undoing a task and redoing it gives the same roll.

### Pets (level 4)
- 10 species × 3 hatching potions = 30 pets to collect. You get a starter egg and potion when pets open.
- Your battle pet attacks the boss once on each day you finish 3 or more tasks. It grows from tasks in its favorite stat and from treats.
- Pets never die or starve. An unfed pet just stops growing.

### Parties (level 5, needs sign-in)
- 2 to 6 players share one boss. You create a party, then share its 6-character code.
- **Cheer** a teammate's win and they get +5% XP for an hour. Each player can receive up to 3 a day.
- When a teammate's Momentum drops below 0.8, the party sees "lantern low." Your next finished task can be a **Rescue**, which restores 0.1 of their Momentum. You can send 1 a day.
- Teammates see your level, class, stat shape and boss damage. **Task names and Vault amounts never leave your device.**
- After 14 days without opening the app, a member moves to Resting and stops counting toward the boss.

### Daily bounties (level 2)
- Three small goals each morning, drawn from your own task list, with one reroll a day. Each pays a chest, and finishing all three pays a bonus chest.

### The Vault (level 6)
- **Coffers** are savings goals. Your first Vault entry each day pays like a Medium Fortune task, whether it's $5 or $500. Reaching a month's planned amount pays a Hard bonus, and chests drop at 25, 50, 75 and 100%.
- **Debt Dragons**: a debt's balance is the dragon's HP. Every payment is a hit, and a payment above the minimum is a critical hit. If you enter the APR, interest heals the dragon each month. Slay it to earn the Dragonslayer title.
- Everything is self-reported. No bank is connected and the game gives no financial advice.

### Epics (level 8)
- A long-term goal split into 3 to 10 milestones, with an "at this pace you finish…" projection.
- Each milestone pays a chest, one a day. Finishing an Epic earns a trophy, plus a Rare item of your choice if it ran at least 3 weeks.

### Achievements
- 30 achievements in Bronze, Silver, Gold and Legendary tiers, adding up to an achievement score. Some unlock titles, such as the Unbroken, Wyrmbane, Dragonslayer and the Steadfast. One is secret.

### Also changed
- **Tabs:** Today, Quest (boss, party, Epics), Hero (Stats, Class, Gear, Pets, Trophies), Treasury (Vault, Rewards, Shop) and Settings.
- **Today** shows a compact boss card and the day's bounties.
- **Shop:** adds healing potions (40 gold), pet treats (15) and mystery eggs (150).
- **Ember:** new notes for boss results, achievements and party news.
- **Toasts** now announce loot, crits and achievements one at a time.

## Deliberate MVP limits (from the design doc)
- Common to Rare gear only. Epic and Legendary gear, crafting, the forge and salvage come later. Unwanted gear sells for gold.
- Battle-pet role only. Gatherer and expedition pets, and mounts, come later.
- 4 of the 6 classes. Ranger and Artificer, and specializations at level 30, come later.
- No AI morning plan or weekly review yet. Ember stays on templates until Phase 3.
- No guilds, market, seasons or mini-games yet.

## How parties work without a server
Every member publishes a weekly summary to Firestore: damage per hit, Daily completion counts, skills used, cheers and rescues. Each phone replays the same week from the same summaries with one shared resolver, so everyone sees the same fight. The trade-off is that a teammate's last-minute Sunday tasks only count once their phone has synced.

## Tests
- 58 automated tests in total. Phase 1's 29 are unchanged.
- The 29 Phase 2 tests cover saves migrating from Phase 1, combat caps, loot determinism, classes and respecs, Arcane Surge, all three boss mechanics, strikes, Shield Wall and Mend, party HP scaling, Resting and mid-week joiners, bounties, the Vault, the Debt Dragon, Epics, Cheers, Rescues, Rally, pets and achievements.
- A simulation pins the boss to Friday or Saturday for a typical player.
