# Swimply design

This is the contract for what the game is. If a change contradicts this file, stop and decide which one is right, then update the file.
All numbers in config are test values and will change.

## The slice we are building

The whole early game is the **Mindscape** plus a **single hub room**. Nothing else is planned or built until this feels really good.

- **Start:** the character wakes weakened in the hub, limps to his bow, and is pulled into the Mindscape to find his strength in his memories. (The wake-up cutscene comes last.)
- **Mindscape:** played in **runs** (die, restart, keep progress), **no time limit**. Endless waves of **Shades**, an **upgrade tree** (stats only, no skills), and a **mini-boss**. It works like Heaven's core loop. Expect roughly 15 minutes.
- **The loop (first draft):** each Shade kill gives memory shards (`tree.shardsPerKill`), banked in the save at once. Death opens the tree screen; spend shards, then start the next run. Unspent shards and bought nodes carry over. Today's tuned stats are the weakened start; the tree goes beyond them.
- **The tree:** `src/data/tree.json`. Nine nodes in three branches from one root: bow (damage, pierce, extra arrows), hands (fire rate, range), body (move speed, dash cooldown, teleport distance). Stats only. Costs scale with `tree.costScale`; the whole tree is meant to take about 15 minutes.
- **Leaving:** when the tree is complete and the mini-boss is cleared, he leaves the Mindscape at full strength and returns to the hub.
- **Permanent baseline:** what the tree grants becomes his lasting base stats for the rest of the game. This tutorial tree is **never shown again**; a different tree comes later in the game.
- **Later:** the Mindscape also serves as a training ground where skills are equipped and tested. Skills do not exist yet.

## Pillars

1. **Few, tough, readable enemies.** Quality encounters, not spam. Higher health, lower spawn rates than Heaven.
2. **The character feels strong, with perfect control.** Every input responds at once.
3. **Enemies are strong and snappy too.** Fights feel like fighting another player: fast, alive, a dance.
4. **The fun is thinking on your feet:** the sick dodge, the counter, the attack.
5. **Readability first.** One-hit death means every attack needs a clear tell before it hurts. Too many tells beats too few.

## The character

- One-hit death, with a small forgiving hitbox.
- Moves with WASD (screen directions), aims with the mouse.
- **Bow** (primary), **dash**, **teleport**. Heaven's stats are the starting point; values live in config.
- Dash and teleport grant invulnerability. Some enemy damage can pierce it (damage carries a flag).

## Enemies

- **Shade:** easy fodder to learn on. 10 health (the bow does 5 a shot, so two shots). Walks at the player.
- **Mini-boss (built late):** dash and melee. 300 health. A visible windup, then a dash at about 75% of the player's dash speed, locked on to where the player was when the windup began, then a strike. After a miss it turns toward the player. Collision is checked along the whole dash path.

## Out of scope for now (do not plan or build)

Castle, city, open world, city and factory management, large-scale siege combat, skills and equipping, a second upgrade tree, cutscenes, map generation. They are listed so the ideas are safe, not so code is written for them.

Large-scale combat conflicts with pillar 1 and would need its own simulation, so it must not shape the slice.

## Stage order

1. Foundation  2. Character in an empty room  3. Shade, collision and run loop in a plain arena  4. Data layer  5. Asset maker with pixel editor  6. Level editor (areas only)  7. Upgrade tree and permanent baseline  8. Mini-boss  9. Polish pass  10. Hub room and wake-up (cutscene approach must be shown to Drew first).
