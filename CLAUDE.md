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

## Code map

- `src/config/store.ts`: `defineConfig` and the tweaks store. `src/config/render.ts`: the render section.
- `src/core/iso.ts`: world to screen projection and back. `src/core/save.ts`: versioned save.
- `src/dev/DevMenu.ts`: the dev menu, built from the config registry. ` (backtick) toggles it.
- `src/config/character.ts` (player, bow, dash, teleport), `feel.ts` (arms, hero look colours, bow, cloak, camera), `render.ts`, `sim.ts` (fixed step, slow motion, god mode), `shade.ts`, `run.ts` (waves, death, hit-stop): tunables, each with its dev menu range.
- `src/core/input.ts`: action-based input. `core/geometry.ts`: circle maths. `core/pool.ts`: object pool.
- `src/data/`: `registry.ts` (the `Registry` class and JSON readers), `floors.ts`/`floors.json`, `assets.ts`/`assets.json`, `maps.ts` (map format, loader, `maps` registry) and `maps/*.json`. See "Data files" in `ARCHITECTURE.md`.
- `src/sim/`: `World.ts` (the `CollisionWorld` interface and `MapWorld`, built from a map: asset circles, blocking floor boxes, the map's edge), `Nav.ts` (the `Navigator` interface and `FlowField`, which routes walkers round blocking floor), `Player` (movement, dash, teleport, firing), `Arrows`, `Shades`, `Run` (waves and run state), `stats.ts` (effective stats; the upgrade baseline is added here later).
- `src/render/`: `MapView` (floor and placed assets), `PlayerView`, `BowView`, `ArrowsView`, `ShadesView`, `RunHud`, `Fx`, `art.ts` (code-drawn textures under the keys in `Tex`; asset parts name these keys).
- `src/scenes/ArenaScene.ts`: the arena, loaded from a map file (`arena` by default). Runs the sim on a fixed time step (`step()`), draws once per frame. Dev menu buttons: restart, next wave, spawn, kill all, hold waves, pause, step, hitboxes (also shows blocking floor and markers), next map.
- `src/tools/`: the asset maker (`asset-maker.html`, dev server only; also the "Asset maker" dev menu button). `assetMaker.ts` (the page and tabs), `Workspace.ts` (working copies and save), `files.ts` (writes the JSON in the hand-written style), `SpriteTab.ts` (pixel editor), `AssetTab.ts`, `FloorTab.ts`, `Preview.ts` (a small Phaser view using the game's own `MapView`).
- `src/data/sprites.ts`/`sprites.json`: drawn pixel art; `render/art.ts` turns each sprite into a texture over any code art of the same name.
- `scripts/check-layers.mjs`: the layer guard. `scripts/data-api.ts`: the dev-server save API the tools use.
