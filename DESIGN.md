# Swimply design

This is the contract for what the game is. If a change contradicts this file, stop and decide which one is right, then update the file.
All numbers in config are test values and will change.

## The slice we are building

The whole early game is the **Mindscape** plus a **single hub room**. Nothing else is planned or built until this feels really good.

- **Start:** the character wakes weakened in the hub, limps to his bow, and is pulled into the Mindscape to find his strength in his memories. (The wake-up cutscene comes last.)
- **Mindscape:** played in **runs** (die, restart, keep progress), **no time limit**. Endless **Shades**, an **upgrade tree** (stats only, no skills), and a **mini-boss**. It works like Heaven's core loop. Expect roughly 15 minutes.
- **A run:** no waves. Shades keep appearing, faster and with more health as the run's clock goes up (`run` in the dev menu), until a player who is not strong enough is overwhelmed.
- **The loop (first draft):** each Shade kill gives memory shards (`tree.shardsPerKill`), banked in the save at once. Death opens the tree screen; spend shards, then start the next run. Unspent shards and bought nodes carry over. Today's tuned stats are the weakened start; the tree goes beyond them.
- **The tree:** `src/data/tree.json`. Ten nodes, each bought once or twice, in two tiers. Tier 1 (about a quarter of the power): pierce at the root, then move speed, fire rate, damage and an extra arrow around it. Tier 2: double shards (after move speed), more fire rate, more damage, a third arrow, and two more pierce at the top (after either fire rate or damage). Fully upgraded: move speed 250, 2.5 shots a second, 40 damage, 3 pierce, 3 arrows a shot. Nothing in it changes the dash or teleport. Stats only. Costs scale with `tree.costScale`; the whole tree is meant to take about 15 minutes.
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
- **Bow** (primary), **dash** (stops at walls and props), **teleport**. Teleport is locked at the start and unlocked shortly after winning the Mindscape (save flag `teleport`; `testing → allowTeleport` in the dev menu bypasses it). Heaven's stats are the starting point; values live in config.
- Dash and teleport grant invulnerability. Some enemy damage can pierce it (damage carries a flag).

## Enemies

Three classes (for reference):
- **Basics:** die in 1 to 2 hits. Their only attack is touching the player, so they are easy to read and can come in numbers.
- **Elites:** die in about 10 to 20 hits. Their spawns are what needs balancing. The Mindscape's mini-boss is an empowered elite.
- **Bosses:** 50 to 100 hits.

The Mindscape is all basics (Shades), plus the empowered elite mini-boss (the werewolf, `werewolf_10`-`14` attack frames), meant to arrive about 45 seconds into a run.

- **Shade:** a basic, easy fodder to learn on. 10 health at the start of a run (the bow does 5 a shot, so two shots), more as the run goes on (`run.hpPerMinute`). Walks at the player.
- **Mini-boss, the werewolf:** 3000 health, arrives 45 seconds into a run (`bosses → werewolf_miniboss` in the dev menu). He walks at the player; when the player is within 300, he winds up (`werewolf_10`, then holds `werewolf_11`) while a rectangle 400 long and 125 wide grows along the ground toward where the player was then. He dashes to its far end (still in the windup pose), killing anyone his path passes (the danger travels with him, so the stretch behind him is safe), then slams (`werewolf_12`, `werewolf_13`) with shake and dust, killing anyone at the far end of the rectangle. Touching him also kills. Killing him gives 50 shards; with the full tree it clears the Mindscape (save flag `mindscapeCleared`).

## Out of scope for now (do not plan or build)

Castle, city, open world, city and factory management, large-scale siege combat, skills and equipping, a second upgrade tree, cutscenes, map generation. They are listed so the ideas are safe, not so code is written for them.

Large-scale combat conflicts with pillar 1 and would need its own simulation, so it must not shape the slice.

## Stage order

1. Foundation  2. Character in an empty room  3. Shade, collision and run loop in a plain arena  4. Data layer  5. Asset maker with pixel editor  6. Level editor (areas only)  7. Upgrade tree and permanent baseline  8. Mini-boss  9. Polish pass  10. Hub room and wake-up (cutscene approach must be shown to Drew first).
