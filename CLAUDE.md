# CLAUDE.md

Guidance for Claude working in this repo (`okitsdrew/Swimply`).

## Who you work with

Drew is new to making games and to programming. Teach as you go: explain what you are doing and why, warn what a change could affect, and prefer plain words. Treat this repo as a "how to make a game with Claude's help" guide. When Drew asks for something that contradicts an earlier decision or would make a mess, **say so before building** and recommend the clean way. Do not just agree.

## Read first

- `DESIGN.md`: what the game is. The contract. Flag contradictions, do not guess.
- `ARCHITECTURE.md`: the layer rules. `npm run check` enforces them.

## How we work

- Claude writes the code, makes placeholder art (code-drawn) and manages GitHub. Drew supplies ideas, tweaks values and playtests on a Steam Deck.
- Work in the local clone at `/home/deck/Swimply`. Use **one short-lived branch per phase**, small named commits, and merge to `main` only after Drew has played it and likes it. `main` stays playable.
- Never commit or push without being asked, except the phase branch for the phase Drew said "go" to.
- Bring files over from Heaven (`/home/deck/Heaven`, read-only reference) **one at a time**, reading each. Never copy the whole repo.
- No new feature starts until the previous one is finished and committed. Ideas go in the parking lot in the plan doc or `DESIGN.md`, not into code.
- Do not build for the "out of scope" list in `DESIGN.md`.
- Before designing the cutscene system, show Drew the approach first.
- Keep code in the style of the surrounding code. Comment sparingly. Do not put a model name or version in commits or code.

## Commands

- `npm install`: install dependencies.
- `npm run dev`: dev server with hot reload (`localhost:5173`).
- `npm run check`: layer check plus type check.
- `npm run build`: check, then build to `dist/` (what CI runs).
- `npm run preview`: serve the built `dist/`.
- Asset maker: `localhost:5173/asset-maker.html` while `npm run dev` runs.
- Level editor: `localhost:5173/level-editor.html` while `npm run dev` runs.

## Code map

- `src/config/store.ts`: `defineConfig` and the tweaks store. `src/config/render.ts`: the render section.
- `src/core/iso.ts`: world to screen projection and back. `src/core/save.ts`: versioned save.
- `src/dev/DevMenu.ts`: the dev menu, built from the config registry. ` (backtick) toggles it.
- `src/config/character.ts` (player, bow, dash, teleport), `feel.ts` (arms, hero look colours, bow, cloak, camera), `render.ts`, `sim.ts` (fixed step, slow motion, god mode), `shade.ts`, `run.ts` (spawn rate and Shade health ramp, death, hit-stop), `werewolf.ts` (`werewolf_miniboss`, in the dev menu's bosses group: the mini-boss and its dash attack; plain elite werewolves will get their own section), `tree.ts` (shards per kill, cost scale), `story.ts` (`story`: weak speed before the Mindscape, interact range, door radius, fades, respawn; `dialogue`: typing speed, read time, tutorial time, wind): tunables, each with its dev menu range.
- `src/core/input.ts`: action-based input (F is interact). `core/geometry.ts`: circle maths. `core/pool.ts`: object pool.
- `src/data/`: `registry.ts` (the `Registry` class and JSON readers), `floors.ts`/`floors.json`, `assets.ts`/`assets.json`, `maps.ts` (map format, loader, `maps` registry) and `maps/*.json`, `tree.ts`/`tree.json` (upgrade tree nodes, buying, the baseline), `story.ts`/`story.json` (speakers and scripts: the lines, faces, pauses and tutorials). See "Data files" in `ARCHITECTURE.md`.
- `src/sim/`: `World.ts` (the `CollisionWorld` interface and `MapWorld`, built from a map: asset circles, blocking floor boxes, the map's edge), `Nav.ts` (the `Navigator` interface and `FlowField`, which routes walkers round blocking floor), `Player` (movement, dash, teleport, firing), `Arrows`, `Shades`, `Werewolf` (the mini-boss state machine), `Run` (the spawn ramp and run state), `stats.ts` (effective stats: config plus the tree's baseline, and the weakness before the Mindscape).
- `src/render/`: `MapView` (floor and placed assets), `PlayerView`, `BowView`, `ArrowsView`, `ShadesView`, `WerewolfView` (frames, the attack rectangle, the slam, the health bar), `RunHud`, `InteractHint` (the F over his head), `DialogueBox` (the line at the top with a face, or a bubble over the hero), `GhostText` (tutorial words the wind blows away), `Fx`, `art.ts` (code-drawn textures under the keys in `Tex`; asset parts name these keys).
- `src/scenes/StoryRunner.ts`: plays a script from `story.json` step by step; F skips ahead through lines.
- `src/scenes/TreeScene.ts`: the upgrade tree screen, laid over the arena after a death (or from the dev menu).
- `src/scenes/ArenaScene.ts`: the arena, loaded from a map file (`spawn` by default, or `?map=<id>&at=x,y&calm` in the address). A map with Shade spawn zones is a run; any other is calm. Travels between maps through `to` links (fade out, remember where he stood), and beating the werewolf grants the full tree and teleport and sends him back. Runs the sim on a fixed time step (`step()`), draws once per frame. Shades and the werewolf spawn in the map's `shadeSpawn` zones. Dev menu buttons: restart, spawn, skip 15s, spawn werewolf, kill werewolf, kill all, open tree, +50 shards, reset tree, max tree, hold spawns, pause, step, hitboxes (also shows blocking floor, markers and spawn zones), next map, story: fresh start, story: Mindscape won, asset maker, level editor.
- `src/tools/`: the asset maker (`asset-maker.html`, dev server only; also the "Asset maker" dev menu button). `assetMaker.ts` (the page and tabs), `Workspace.ts` (working copies and save), `files.ts` (writes the JSON in the hand-written style, and the calls to the dev-server API), `SpriteTab.ts` (pixel editor), `AssetTab.ts`, `FloorTab.ts`, `Preview.ts` (a small Phaser view using the game's own `MapView`), `tools.css` (the look of both tool pages).
- The level editor (`level-editor.html`, dev server only; also a dev menu button): `levelEditor.ts` (the page, tools, panels, keys, save, play here, renaming ids across maps), `MapDoc.ts` (one map's working copy, its undo history, paint, fill, resize), `MapCanvas.ts` (the Phaser view: the game's `MapView` plus the editor's overlay, pan and zoom).
- `src/data/sprites.ts`/`sprites.json`: drawn pixel art; `render/art.ts` turns each sprite into a texture over any code art of the same name.
- `scripts/check-layers.mjs`: the layer guard. `scripts/data-api.ts`: the dev-server API the tools use (save with a check that nobody else changed the file, delete a map, read the maps).
