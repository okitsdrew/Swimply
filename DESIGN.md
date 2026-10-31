# Swimply design

This is the contract for what the game is. If a change contradicts this file, stop and decide which one is right, then update the file.
All numbers in config are test values and will change.

## The slice we are building

The whole early game is the **spawn room**, the **Mindscape** and the **throne room** (the hub, the only safe place). Nothing else is built until this feels really good.

- **Start:** the character wakes weakened in the spawn room (a short cutscene with Timo), walks at 25% speed with no bow or dash to the void bow on its pedestal, and touching it (F) pulls him into the Mindscape to find his strength in his memories.
- **The way through:** spawn room, Mindscape, back to the spawn room at the pedestal (now just a pedestal), then through the flaming hallway to the throne room. The way back to the spawn room is closed once he is in the throne room.
- **Mindscape:** played in **runs** (die, restart, keep progress), **no time limit**. Endless **Shades**, an **upgrade tree** (stats only, no skills), and a **mini-boss**. It works like Heaven's core loop. Expect roughly 15 minutes.
- **A run:** no waves. Shades keep appearing, faster and with more health as the run's clock goes up (`run` in the dev menu), until a player who is not strong enough is overwhelmed.
- **The loop (first draft):** each Shade kill gives memory shards (`tree.shardsPerKill`), banked in the save at once. Death opens the tree screen; spend shards, then start the next run. Unspent shards and bought nodes carry over. Today's tuned stats are the weakened start; the tree goes beyond them.
- **The tree:** `src/data/tree.json`. Ten nodes, each bought once or twice, in two tiers. Tier 1 (about a quarter of the power): pierce at the root, then fire rate, damage and an extra arrow around it, and double shards. Tier 2: move speed (after double shards), more fire rate, two more pierce (after damage), a third arrow, and more damage at the top (after either fire rate or pierce). A hidden extra, Time Warp (free: runs start 35 seconds in, a shortcut to the werewolf), appears once the rest of the tree is bought and the werewolf has been met. Fully upgraded: move speed 250, 2.5 shots a second, 40 damage, 3 pierce, 3 arrows a shot. Nothing in it changes the dash or teleport. Stats only. Costs scale with `tree.costScale`; the whole tree is meant to take about 15 minutes.
- **Leaving:** killing the mini-boss ends the Mindscape ("Memories restored") and grants the whole tree, bought or not. It should be very hard without a full tree, but trying early is not punished. He returns to the spawn room at full strength, and teleport is taught there.
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
- **Mini-boss, the werewolf:** 3000 health, arrives 45 seconds into a run (`bosses → werewolf_miniboss` in the dev menu). He walks at the player; when the player is within 300, he winds up (`werewolf_10`, then holds `werewolf_11`) while a rectangle 400 long and 125 wide grows along the ground toward where the player was then. He dashes to its far end (still in the windup pose), killing anyone his path passes (the danger travels with him, so the stretch behind him is safe), then slams (`werewolf_12`, `werewolf_13`) with shake and dust, killing anyone at the far end of the rectangle. His second attack is a jump, triggered from up to 1000 away. Its chance is 25% (50% right after a dash the player survived) when the player is within 350, rising to certain at 700; if he picks the dash he walks in for it, but switches to the jump if the player gets 700 away. The jump: he crouches for 0.75 seconds (`werewolf_14`), leaps at where the player was over anything in the way (`werewolf_12` at takeoff, then `werewolf_15`, a second in the air, untouchable), while a circle on the ground marks the landing and fills as he comes down; landing (`werewolf_13`) kills anyone inside it. Between attacks he has a quick dash (75 long, 0.1 seconds, every 3 seconds, with afterimages) toward the player whenever they are over 100 away; straight after it, if his attacks are ready, he starts the dash attack if the player is within its range, or rolls for the jump, either with half the usual windup. His body circle grows with his scale. Touching him also kills. Killing him gives 50 shards; with the full tree it clears the Mindscape (save flag `mindscapeCleared`).

## Out of scope for now (do not plan or build)

Castle, city, city and factory management, large-scale siege combat, skills and equipping, a second upgrade tree, map generation. They are listed so the ideas are safe, not so code is written for them.

Large-scale combat conflicts with pillar 1 and would need its own simulation, so it must not shape the slice.

## Stage order

1. Foundation  2. Character in an empty room  3. Shade, collision and run loop in a plain arena  4. Data layer  5. Asset maker with pixel editor  6. Level editor (areas only)  7. Upgrade tree and permanent baseline  8. Mini-boss  9. Polish pass  10. Spawn room, throne room and wake-up (cutscene approach agreed: steps in a data file, played by one small runner).
