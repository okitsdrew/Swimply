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

- `floors.json`: floor kinds (`id`, `name`, `colors`, `blocks`). A floor that blocks cannot be walked on or landed on by a teleport; arrows and teleports pass over it.
- `assets.json`: placeable things (`id`, `name`, `category`, `parts`, `collision`, `marker`). Collision belongs to the asset. A marker (such as `playerStart`) has no parts and is invisible in play.
- `sprites.json`: pixel art drawn in the asset maker (`id`, `name`, `palette` from characters to colours, `rows` of characters, `.` is see-through). Each sprite becomes a texture under its id, so a sprite named like a code-drawn texture (`pillar`, `shade_0`) replaces that art in the game; delete the sprite and the code art comes back. Animation frames are separate sprites (`shade_0`, `shade_1`).
- `maps/<id>.json`: one area map per file, the file name is its id. `format`, `kind: "area"`, `name`, `tileSize`, a `legend` from characters to floor ids, `floor` as rows of characters (row = world y, character = world x, from the top-left), and `objects` as `{ "asset", "x", "y", "size" }` in world units.

The tools write these files through a small dev-server API (`scripts/data-api.ts`): it only exists under `npm run dev`, only accepts the data files above, and after a tool saves it tells an open game tab to reload instead of reloading the tool (which would lose its undo history). Tools keep their own working copy of the data and never change the game's registries.

Every file is checked on load. A mistake (unknown id, wrong type, short row) is reported in the browser console and skipped or given a default, never a crash. Map files carry a `format` number with migrations, like the save.

## Adding a layer or breaking a rule

Do it deliberately: change this file and `scripts/check-layers.mjs` together, and say why in the commit. A quick fix that bypasses a layer goes on the debt list below.

## Debt list

- **No render interpolation.** Drawing shows the latest fixed step. If the step rate is not a multiple of the screen's refresh rate, motion can judder slightly; raise `sim.stepRate` or add interpolation if it shows.
- **Damage has no pierce flag yet.** Shade contact never goes through dash or teleport invulnerability. The flag arrives with the mini-boss, the first thing that needs it.
- **Shades spawn on the map's edge**, which can be off screen in a big map, and maps have no spawn zones yet. Spawn zone markers come with the level editor.
- **Assets have no rotation, flip, light, twin or walkable height yet**, and floors have no edge or fleck style. The map and asset formats only hold what the game uses today; new optional fields are added when a feature needs them, which never breaks a saved file.
- **Pathfinding only knows about floor tiles.** Shades follow a flow field round blocking floor (`sim/Nav.ts`) and steer round pillars as they meet them. A big solid asset (a wall piece) would need to mark its tiles in the flow field too; add that when such assets exist.
- **Saving in a tool reloads the game tab**, so a run in progress restarts. The level editor's "play here" is where keeping your place matters; revisit then.
- **Ids used in maps cannot be renamed in the asset maker**, because the maps would lose the thing. Renaming across maps belongs in the level editor, which can rewrite map files.
- **No sound yet.** `PlayerView.onStep` and the fire, dash and teleport callbacks are the hooks for it.
- **Deploy workflow not added yet.** Pushing a workflow file needs the GitHub login to have the `workflow` permission, and GitHub Pages on a private repo needs a paid GitHub plan. Until both are sorted, play with `npm run dev` (or `npm run preview`) on the Deck. The ready-made workflow is Heaven's `deploy.yml`.
