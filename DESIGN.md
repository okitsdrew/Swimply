# Swimply design

This is the contract for what the game is. If a change contradicts this file, stop and decide which one is right, then update the file.
All numbers in config are test values and will change.

## The current scope

**Clearing the castle.** Swimply wakes in a castle wing, wins back his strength in the Mindscape, then frees the castle area by area from the throne room hub, beating a boss and reclaiming a Vestige in each. Confirmed so far: at least 2 more enemies (likely elites), at least 3 bosses, and the Vestige (skill) system with at least 4 Vestiges. Clearing the whole castle is the end of the current scope.

## The story

- The castle was sieged about a month ago. Its owners (keep the old king vague for now) held **8 Vestiges**.
- Over that month most Vestiges were stolen, and enemies and creatures now use them. The fire butterfly is one, used by the first boss, in the kitchen.
- One Vestige became sentient and escaped capture: **Timo**. He poured some of his power into Swimply to revive him (purple text, faces: happy, laugh, shocked, mad, sad, serious).
- Next story moment, in the throne hub: Timo tells Swimply he wants him to reclaim the castle, then gather the rest of the Vestiges so they can build their own empire. Swimply gains Timo's Vestige there.
- Then the kitchen boss (Flame Torrent), then two more castle zones (likely the eastern and northern courtyards), each with an adjacent area, a boss and a new Vestige.

## Vestiges (skills)

- A **Vestige** is a skill. He equips up to **3**. Equipped ones hover around him as emblems (Timo already floats beside him).
- They are equipped in the Mindscape menu (the "thinking" menu below). A newly unlocked Vestige equips itself if a slot is empty.
- The throne hub has **8 pedestals**: an unlocked Vestige hovers over its pedestal; while it is equipped, the pedestal shows a grey outline instead.
- **Using one:** press its button, and an area shows where it will hit, following the mouse; click to cast it there. Some are toggles instead (for example, double attack speed and damage for 10 seconds).
- Skills come before the bosses, so he has them in the boss fights. Made from scratch, not ported from Heaven.
- **Timo's Doomsday Scenario** (Timo's): teleport to the target spot and explode: damage in a radius, knockback in a larger one. Cannot target water, void floor or roof tiles, so it can't break the map.
- **Flame Torrent** (the fire butterfly's): four fireballs from each side of him (eight in all) cross just in front of him, fly out to their range and come back. Two spots catch all eight: right beside him and at full range. Drew's sketch is in the project files (`vestiges/flame-torrent-sketch.png`).

## The early game (built)

The **spawn room**, the **Mindscape** and the **throne room** (the hub, the only safe place).

- **Start:** the character wakes weakened in the spawn room (a short cutscene with Timo), walks at 25% speed with no bow or dash to the void bow on its pedestal, and touching it (F) pulls him into the Mindscape to find his strength in his memories.
- **The way through:** spawn room, Mindscape, back to the spawn room at the pedestal (now just a pedestal), then through the flaming hallway to the throne room. The way back to the spawn room is closed once he is in the throne room.
- **Mindscape:** played in **runs** (die, restart, keep progress), **no time limit**. Endless **Shades**, an **upgrade tree** (stats only, no skills), and a **mini-boss**. It works like Heaven's core loop. Expect roughly 15 minutes.
- **A run:** no waves. Shades keep appearing, faster and with more health as the run's clock goes up (`run` in the dev menu), until a player who is not strong enough is overwhelmed.
- **The loop (first draft):** each Shade kill drops memory shards (`tree.shardsPerKill`): small glowing blue-white orbs that pop out of the body. Within the player's pickup radius (100, not drawn) they fly to him, faster than he can run, and are banked in the save as they reach him. The werewolf bursts into 50. Orbs never merge and never fade; any not picked up are lost when the run ends. Beating the werewolf pulls every orb left to him. Death opens the tree screen; spend shards, then start the next run. Unspent shards and bought nodes carry over. Today's tuned stats are the weakened start; the tree goes beyond them.
- **The tree:** `src/data/tree.json`. Ten nodes, each bought once or twice, in two tiers. Tier 1 (about a quarter of the power): pierce at the root, then fire rate, damage and an extra arrow around it, and Memory Echo (each memory shard is worth 2). Tier 2: move speed (after Memory Echo), more fire rate, two more pierce (after damage), a third arrow, and more damage at the top (after either fire rate or pierce). A hidden extra, Time Warp (free: runs start 35 seconds in, a shortcut to the werewolf), appears once the rest of the tree is bought and the werewolf has been met. Fully upgraded: move speed 250, 2.5 shots a second, 40 damage, 3 pierce, 3 arrows a shot. Nothing in it changes the dash or teleport. Stats only. Costs scale with `tree.costScale`; the whole tree is meant to take about 15 minutes.
- **Leaving:** killing the mini-boss ends the Mindscape ("Memories restored") and grants the whole tree, bought or not. It should be very hard without a full tree, but trying early is not punished. He returns to the spawn room at full strength, and teleport is taught there.
- **Permanent baseline:** what the tree grants becomes his lasting base stats for the rest of the game. This tutorial tree is **never shown again**; a different tree comes later in the game.
- **Later (on the horizon, not to build yet):** from the hub, a Mindscape button opens a "thinking" menu with tabs. Two are certain: **skills** (a skill tree, not built yet) and **Mindscape** (the Mindscape as it is now: a tree, and the option to go to battle). A battle is either **training** (mess about and test abilities, with simple switches such as boss spawn on or off and Shade spawn rate up, down or paused) or **story progress**: after milestones (castle cleared, city cleared, a big boss), the battle is extended, a second boss comes later, and winning raises his stats for good. In the story he is facing the demons of his past and remembering lost power.
- **Soul shards (later):** enemies outside the Mindscape will drop soul shards, a different colour. Held until there are enemies outside the Mindscape; the pickups are built so it is one new entry in `pickups.json`. The open world will get a despawn radius for orbs, never a timer.

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
- **Vestiges** (above): up to 3 equipped skills.
- Dying outside the Mindscape sends him back to the doorway he last came in by, and resets that area and everything done in it (objectives must be redone).

## Enemies

Three classes (for reference):
- **Basics:** die in 1 to 2 hits. Their only attack is touching the player, so they are easy to read and can come in numbers.
- **Elites:** die in about 10 to 20 hits. Their spawns are what needs balancing. The Mindscape's mini-boss is an empowered elite.
- **Bosses:** 50 to 100 hits.

The Mindscape is all basics (Shades), plus the empowered elite mini-boss (the werewolf, `werewolf_10`-`14` attack frames), meant to arrive about 45 seconds into a run.

- **Shade:** a basic, easy fodder to learn on. 10 health at the start of a run (the bow does 5 a shot, so two shots), more as the run goes on (`run.hpPerMinute`). Walks at the player.
- **Mini-boss, the werewolf:** 3000 health, arrives 45 seconds into a run (`bosses → werewolf_miniboss` in the dev menu). He walks at the player; when the player is within 300, he winds up (`werewolf_10`, then holds `werewolf_11`) while a rectangle 400 long and 125 wide grows along the ground toward where the player was then. He dashes to its far end (still in the windup pose), killing anyone his path passes (the danger travels with him, so the stretch behind him is safe), then slams (`werewolf_12`, `werewolf_13`) with shake and dust, killing anyone at the far end of the rectangle. His second attack is a jump, triggered from up to 1000 away. Its chance is 25% (50% right after a dash the player survived) when the player is within 350, rising to certain at 700; if he picks the dash he walks in for it, but switches to the jump if the player gets 700 away. The jump: he crouches for 0.75 seconds (`werewolf_14`), leaps at where the player was over anything in the way (`werewolf_12` at takeoff, then `werewolf_15`, a second in the air, untouchable), while a circle on the ground marks the landing and fills as he comes down; landing (`werewolf_13`) kills anyone inside it. Between attacks he has a quick dash (75 long, 0.1 seconds, every 3 seconds, with afterimages) toward the player whenever they are over 100 away; straight after it, if his attacks are ready, he starts the dash attack if the player is within its range, or rolls for the jump, either with half the usual windup. His third attack is the swipe, so he never just walks into the player while his other attacks cool down: whenever the player is within 100, cooldown or not, he winds up for 0.45 seconds (`werewolf_10`, then `werewolf_11`) while a cone 200 long and 120 degrees wide, aimed at the player, fills on the ground from him outward, then lunges 60 forward (`werewolf_12`, `werewolf_13`), killing anyone in the cone, and recovers for 0.2 seconds. His body circle grows with his scale. Touching him also kills. Killing him bursts him into 50 memory shards; with the full tree it clears the Mindscape (save flag `mindscapeCleared`).
- **Elite werewolf** (`werewolf` in the dev menu's enemies group): the same three attacks, smaller and slower to wind up, 1000 health, met in the castle.
- **Priest:** a ranged caster, 250 health. It walks into range (650) and needs to see him to start a cast; it teleports into position (even through walls) and away when he gets close. Its star orbs home in for their first 1.5 seconds and speed up from 150 to 600, stop at walls, and never expire.

**Outside the Mindscape** enemies are placed in maps (they wait until he comes within their aggro distance or shoots them, and a "killed sets" flag keeps one dead), or sent out by **spawners**: breakable things that send out one kind while he stands in their painted zone, at their own rate and alive cap. Breaking a spawner stops it. Shades outside the Mindscape drop nothing yet (soul shards come later).

**Bosses** (coming): one per castle area, each with lots of unique attacks, each holding a stolen Vestige. The first is in the kitchen, using the fire butterfly.

## The world map and fast travel (not urgent)

The world map is a top-down view of the castle's areas (throne, garden, courtyards and so on). Fast travel stays inside the castle: a fast travel point appears where a boss is beaten and takes him to the throne hub; from the world map he can click any such point, or the throne, to go there at once.

## Out of scope for now (do not plan or build)

The long-term vision, listed so the ideas are safe, not so code is written for them:

- A large world map beyond the castle, travelling to and **sieging an enemy castle** (more humanoid enemies with weapons, siege equipment; this needs big preparation).
- **City management:** light at most, a puzzle minigame, tied to "liberating" sections of the castle. The `liberated_X` style flags maps already use are all the preparation it needs.
- Large-scale siege combat, factory management, a second upgrade tree, map generation.

Large-scale combat conflicts with pillar 1 and would need its own simulation, so it must not shape the current scope.

## Stage order

1. Foundation  2. Character in an empty room  3. Shade, collision and run loop in a plain arena  4. Data layer  5. Asset maker with pixel editor  6. Level editor (areas only)  7. Upgrade tree and permanent baseline  8. Mini-boss  9. Polish pass  10. Spawn room, throne room and wake-up (cutscene approach agreed: steps in a data file, played by one small runner). Then castle maps, breakables, the elite werewolf, spawners and the Priest.
11. Enemy cleanup: one shape for every enemy, the arena scene split, `npm run smoke`.
12. Throne hub and Timo's cutscene (show Drew the approach first), the Vestige system, Timo's Doomsday Scenario.
13. The kitchen boss and Flame Torrent.
14. The eastern courtyard (and its adjacent area): a new elite, a boss, a Vestige.
15. The northern courtyard (and its adjacent area): a new elite, a boss, a Vestige. The castle is cleared.
