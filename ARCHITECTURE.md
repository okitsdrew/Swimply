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

- `floors.json`: floor kinds (`id`, `name`, `colors`, `blocks`, `hurts`). A floor that blocks cannot be walked on or landed on by a teleport; arrows and teleports pass over it. A floor that hurts kills the player standing on it unless they are safe (dashing, teleporting or in the grace after); enemies ignore it.
- `assets.json`: placeable things (`id`, `name`, `category`, `parts`, `collision`, `marker`, `light`). Collision belongs to the asset. A part with `frames` (sprite ids) plays them in a loop at `fps`. A `light` (`color`, `x`/`y`, `radius`, `intensity`, `flicker`) adds a glow and lights up the map's darkness. A marker has no parts and is invisible in play: `playerStart` is where a run starts, `shadeSpawn` is a zone Shades appear in (radius `run.spawnZoneRadius` times its size; a map with no zones spawns along its edge).
- `sprites.json`: pixel art drawn in the asset maker (`id`, `name`, `palette` from characters to colours, `rows` of characters, `.` is see-through). Each sprite becomes a texture under its id, so a sprite named like a code-drawn texture (`pillar`, `shade_0`) replaces that art in the game; delete the sprite and the code art comes back. Animation frames are separate sprites (`shade_0`, `shade_1`).
- `tree.json`: the Mindscape's upgrade tree (`id`, `name`, `stat`, `per` a level, `costs` per level, `parents`, `x`/`y` on the tree screen). `data/tree.ts` lists the stats a node can raise and whether they add or multiply. Buying a node stores its level in the save (`tree`) and works out the permanent `baseline` from all levels, which `sim/stats.ts` adds to the config values. Edit it by hand for now; no tool edits it.
- `maps/<id>.json`: one area map per file, the file name is its id. `format`, `kind: "area"`, `name`, `tileSize`, optional `darkness` (0 to 1, how dark it is away from lights), a `legend` from characters to floor ids, `floor` as rows of characters (row = world y, character = world x, from the top-left), and `objects` as `{ "asset", "x", "y", "size" }` in world units.

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
- **Pathfinding is built once per map.** Shades and the werewolf follow a flow field on a half-tile grid (`sim/Nav.ts`) that closes every cell blocking floor or a solid circle touches, so they route round walls. Nothing in the world moves, so it is never rebuilt; a moving obstacle would need that.
- **Saving in a tool reloads the game tab**, so a run in progress restarts on the same map (the map is kept in the address). Keeping the player's spot as well was not needed for "play here", which starts where you point.
- **Ids used in maps cannot be renamed in the asset maker**, because the maps would lose the thing. The level editor's "In every map" panel renames, swaps or removes them across every map.
- **The level editor has no rotation, flip, multi-select or copy and paste between maps.** Assets cannot store rotation or flip yet (see above); add them together when a wall piece needs them.
- **The tree is never retired yet,** and clearing the Mindscape only sets the `mindscapeCleared` flag and shows a banner. Leaving for the hub and unlocking teleport come with the hub.
- **No sound yet.** `PlayerView.onStep` and the fire, dash and teleport callbacks are the hooks for it.
- **Deploy workflow not added yet.** Pushing a workflow file needs the GitHub login to have the `workflow` permission, and GitHub Pages on a private repo needs a paid GitHub plan. Until both are sorted, play with `npm run dev` (or `npm run preview`) on the Deck. The ready-made workflow is Heaven's `deploy.yml`.
