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

## Adding a layer or breaking a rule

Do it deliberately: change this file and `scripts/check-layers.mjs` together, and say why in the commit. A quick fix that bypasses a layer goes on the debt list below.

## Debt list

- **The arena is hand-coded.** Its room size and pillar ring live in the `arena` config section and `ArenaWorld` (`sim/World.ts`). The data layer phase replaces both with a map file; systems only see the `CollisionWorld` interface, so they do not change.
- **Pillars are drawn into the floor layer**, so a sprite behind one is drawn over it. Depth-sorted pillar art comes with the asset maker.
- **No render interpolation.** Drawing shows the latest fixed step. If the step rate is not a multiple of the screen's refresh rate, motion can judder slightly; raise `sim.stepRate` or add interpolation if it shows.
- **Damage has no pierce flag yet.** Shade contact never goes through dash or teleport invulnerability. The flag arrives with the mini-boss, the first thing that needs it.
- **Shades spawn on the room's edge**, which can be off screen in a big room. Authored spawn zones come with the level editor.
- **No sound yet.** `PlayerView.onStep` and the fire, dash and teleport callbacks are the hooks for it.
- **Deploy workflow not added yet.** Pushing a workflow file needs the GitHub login to have the `workflow` permission, and GitHub Pages on a private repo needs a paid GitHub plan. Until both are sorted, play with `npm run dev` (or `npm run preview`) on the Deck. The ready-made workflow is Heaven's `deploy.yml`.
