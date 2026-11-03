# Swimply architecture

The rules that keep the code from turning into spaghetti. `npm run check` enforces the layer rules below; if it fails, the import you just added breaks a layer.

## Layers (a layer may only import from the layers listed)

| Folder | What lives there | May import from |
|---|---|---|
| `src/config/` | The tunables store and each system's config section | nothing |
| `src/core/` | Projection, save, input, math, RNG | config |
| `src/data/` | Registries and file formats: assets, floors, maps, enemies, tree | config, core |
| `src/sim/` | Rules in flat world space: player, projectiles, enemies, collision. No drawing | config, core, data |
| `src/render/` | Turns sim state into sprites, effects, sound. Reads sim, never changes it | config, core, data, sim |
| `src/dev/` | The dev menu | config, core |
| `src/scenes/` | Wires the layers together for a screen | everything above |
| `src/tools/` | Level editor, asset maker. The game never depends on tools | config, core, data, render, dev |

`src/main.ts` starts the game and may import anything.

## Rules

1. **No gameplay number lives in code.** Every tunable is defined with `defineConfig` (see `src/config/store.ts`) with a dev menu range. The dev menu builds itself from these, so a new config section shows up there with no extra work.
2. **The simulation is flat top-down.** Isometric is only a drawing projection (`core/iso.ts`). The sim never touches screen coordinates.
3. **Gameplay reads actions, never keys.** Keyboard, mouse and later a gamepad are interchangeable input sources.
4. **One registry per kind of thing** (assets, floors, enemies, tree nodes). Saved data refers to things by string id, so adding or changing an entry never breaks saved maps or saves.
5. **Systems talk through small interfaces**, not shared mutable arrays. A scene creates systems and passes them what they need; it must not reach into their internals.
6. **Art is swappable.** Gameplay refers to texture keys only. Code-drawn art can be replaced by drawn sprites without touching the sim.
7. **Save is versioned**, with a migration for every version bump. Permanent progress (`baseline`, `flags`) is saved; a run's own state is not. Storage keys start with `swimply.`.
8. **The sim runs on a fixed time step** (from phase 2), so dodges and hit timing behave the same on every machine.
9. **Every system ships with its dev menu entries,** in the same change.

## Data files

Game content lives as JSON under `src/data/`, read through one registry per kind (rule 4):

- `floors.json`: floor kinds (`id`, `name`, `colors`, `blocks`, `hurts`, `sound`). A floor that blocks cannot be walked on or landed on by a teleport; arrows and teleports pass over it. A floor that hurts kills the player standing on it unless they are safe (dashing, teleporting or in the grace after); enemies ignore it.
- `assets.json`: placeable things (`id`, `name`, `category`, `parts`, `collision`, `marker`, `light`, `sound`, `hit`, `health`). `hit` is what arrows stop at: circles (`x`, `y`, `radius`) and boxes (`box: true`, `x`, `y`, `w` along world x, `h` along world y, `turned` to square them to the screen instead), all on the floor in world units; with none, arrows stop at the collision circles. An asset with `health` can be broken by arrows; see `onBreak` in maps. `enemy` (`shade`, `werewolf` or `priest`) on an `enemy` marker places that enemy, which waits until the player comes within the placed thing's `aggro` (or `spawners.aggroRadius`) or shoots it; on anything else it makes a spawner, which sends one out every `spawnEvery` seconds, at most `spawnMax` alive (a placed spawner can override both), while the player stands in its zone. Breaking a spawner stops it. A `sound` on an asset or a floor is a looping sound id (a fire's crackle): each one loops once per map, as loud as its nearest source, fading out at `sound.loopRange`. Collision belongs to the asset. A part with `frames` (sprite ids) plays them in a loop at `fps`. A `light` (`color`, `x`/`y`, `radius`, `intensity`, `flicker`) adds a glow and lights up the map's darkness. A marker has no parts and is invisible in play: `playerStart` is where a map starts, `shadeSpawn` is a zone Shades appear in (radius `run.spawnZoneRadius` times its size), `door` leads to another map when walked into (radius `story.doorRadius` times its size). A map with at least one `shadeSpawn` zone is played as a run (the Mindscape); any other map is calm: no Shades, no run clock, no tree, and a death starts the map over from where he came in, with everything he broke there put back.
- `sprites.json`: pixel art drawn in the asset maker (`id`, `name`, `palette` from characters to colours, `rows` of characters, `.` is see-through). Each sprite becomes a texture under its id, so a sprite named like a code-drawn texture (`pillar`, `shade_0`) replaces that art in the game; delete the sprite and the code art comes back. Animation frames are separate sprites (`shade_0`, `shade_1`).
- `tree.json`: the Mindscape's upgrade tree (`id`, `name`, `stat`, `per` a level, `costs` per level, `parents`, `x`/`y` on the tree screen). `data/tree.ts` lists the stats a node can raise and whether they add or multiply. Buying a node stores its level in the save (`tree`) and works out the permanent `baseline` from all levels, which `sim/stats.ts` adds to the config values. Edit it by hand for now; no tool edits it.
- `pickups.json`: things enemies drop (`id`, `name`, `wallet` they fill, `value`, and the orb's `core`, `rim` and `glow` colours). `memory` is the only wallet so far (the banked memory shards; Memory Echo multiplies their value). Each kind is drawn as `pickup_<id>`, code art that a sprite of the same name replaces. Edit it by hand.
- `story.json`: who speaks (`speakers`: `id`, `name`, `color`, `face` texture, `bubble` to talk over the hero's head, `voice` sound and its `pitch`, blipped every few letters as a line types, `lineSounds`: sounds that take turns playing once as each line starts) and `scripts`: short scenes that play when their `map` starts, while their `if` flags are on and `unless` flags are off (one flag or a list). Each is a list of `steps`: `say` (speaker, `text`, optional `face`; waits for a click or F), `wait` (seconds), `tutorial` (ghostly words that blow away), `waitFor` (`move`, `teleport`, `dash` or `fire`), `flag` (sets a save flag, usually last so the script does not play again), `eyes` (`closed` is a black screen, `open` blinks awake over `time`), `control` (false stops the player moving), `pose` (`asleep`, or `stand` over `time`; plays `hero_getup_0`, `_1`... if drawn, evenly, or as `frames`: which frame and for how long, in order, so a frame can repeat to hold a struggle), `timo` (floats beside the first placed thing of that asset id, or `hero`) and `shake`. The full list with examples is at the top of `data/story.ts`. `scenes/StoryRunner.ts` plays them; edit the file by hand.
- `sounds.json`: sound effects (`id`, `file` in `src/data/sounds/`, optional `volume`) `effects`: which sound plays for each game event (`teleport`, `dash`, `fire`, `hit`, `death`, `portal`, `door`, `step`, `wolfAttack`, `wolfSmash`, and on screens `click`, `next`, `buy`, `deny`, `treeOpen`; one sound id or a list that play together), and `ambience`: a map's background sounds, played in turn every `every` seconds give or take `jitter`. The `.wav` placeholders are made by `scripts/make-placeholder-sounds.py`. Prefer `.ogg`. Where each file came from and its license go in `CREDITS.md`.
- `maps/<id>.json`: one area map per file, the file name is its id. `format`, `kind: "area"`, `name`, `tileSize`, optional `darkness` (0 to 1, how dark it is away from lights), a `legend` from characters to floor ids, `floor` as rows of characters (row = world y, character = world x, from the top-left), and `objects` as `{ "asset", "x", "y", "size" }` in world units, plus optional `"if"` / `"unless"` (a save flag: the object is only there while that flag is on / off, so one map serves before and after a story moment) `"to"` (a map id: a `door` marker goes there when walked into, anything else when the player presses F next to it) `"onBreak"` (a save flag turned on when the thing is broken, or when a placed enemy is killed; it is gone while that flag is on), `"aggro"` (a placed enemy's wake distance), `"zone"` (the zone a spawner works in; with none, it works within its aggro distance) and `"every"` / `"max"` (this spawner's own seconds between spawns and most alive; 0 or missing: its asset's). Optional `zoneLegend` and `zones` paint named areas on the tiles like the floor, `.` for none; several spawners can share a zone. Breaking happens per visit: the flags it turns on only reach the save when he leaves through a door alive, and a thing with no `onBreak` is back next visit. The map is shown again as soon as something breaks, so other things' `if`/`unless` on that flag apply at once. Leaving a map remembers where the player stood, so coming back puts him there.

The tools write these files through a small dev-server API (`scripts/data-api.ts`): it only exists under `npm run dev`, only accepts the data files above (and only deletes map files), and after a tool saves it tells an open game tab to reload instead of reloading the tool (which would lose its undo history). A tool says what it expects the file to hold, and the save is refused if another tool or a git command changed it since, so the asset maker and the level editor never silently undo each other. Tools keep their own working copy of the data and never change the game's registries.

The asset maker owns `sprites.json`, `assets.json` and `floors.json`; the level editor owns the map files. The one exception is renaming a floor or asset id that maps use: the level editor does it, because it changes the id in the data file and in every map together.

The game's address picks what to play (`?map=<id>&at=x,y&calm`, see `ArenaScene`), which is how the level editor's "play here" opens it, and it keeps the map in the address so the reload after a tool saves comes back to the same map.

Every file is checked on load. A mistake (unknown id, wrong type, short row) is reported in the browser console and skipped or given a default, never a crash. Map files carry a `format` number with migrations, like the save.

## Adding a layer or breaking a rule

Do it deliberately: change this file and `scripts/check-layers.mjs` together, and say why in the commit. A quick fix that bypasses a layer goes on the debt list below.

## Debt list

- **No render interpolation.** Drawing shows the latest fixed step. If the step rate is not a multiple of the screen's refresh rate, motion can judder slightly; raise `sim.stepRate` or add interpolation if it shows.
- **Damage piercing invulnerability is one switch, not a general flag.** Only the werewolf's slam can pierce (`werewolf_miniboss.slamPiercesInvuln`, off). Make it a flag on damage when a second attack needs it.
- **Spawn zones are only places, not encounters.** Each Shade picks a random `shadeSpawn` zone. Saying which zone spawns what and when (authored encounters, plan section 11) comes later.
- **Assets have no rotation, flip, light, twin or walkable height yet**, and floors have no edge or fleck style. The map and asset formats only hold what the game uses today; new optional fields are added when a feature needs them, which never breaks a saved file.
- **Pathfinding is built once per map.** Shades (unless `shade.throughWalls`), werewolves and Priests follow a flow field on a half-tile grid (`sim/Nav.ts`) that closes every cell blocking floor or a solid circle touches, so they route round walls. When something breaks, only the cells under it are looked at again (`refresh`); a moving obstacle would need more.
- **Saving in a tool reloads the game tab**, so a run in progress restarts on the same map (the map is kept in the address). Keeping the player's spot as well was not needed for "play here", which starts where you point.
- **Ids used in maps cannot be renamed in the asset maker**, because the maps would lose the thing. The level editor's "In every map" panel renames, swaps or removes them across every map.
- **The level editor has no rotation, flip, multi-select or copy and paste between maps.** Assets cannot store rotation or flip yet (see above); add them together when a wall piece needs them.
- **Flags are read when a map starts, and again when something breaks.** A flag a story script sets mid-map still shows only on the next visit.
- **Where the player left each map is kept only while the page is open.** A reload starts at the map's player start.
- **Sound covers map ambience, dialogue voices, dash and arrow hits so far,** the last three with placeholder sounds made from maths. Teleport, bow shots (`effects` events `teleport`, `fire`) and fire crackle (a `sound` on the fire assets and `flaming_floor`) are wired but wait for real sounds. Footsteps (`PlayerView.onStep`), deaths and the werewolf have none yet. Browsers keep a page silent until its first click or key press, so a title screen will be the natural place to unlock it.
- **Deploy workflow not added yet.** Pushing a workflow file needs the GitHub login to have the `workflow` permission, and GitHub Pages on a private repo needs a paid GitHub plan. Until both are sorted, play with `npm run dev` (or `npm run preview`) on the Deck. The ready-made workflow is Heaven's `deploy.yml`.
