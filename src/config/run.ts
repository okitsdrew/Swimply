import { defineConfig } from './store';

// One run in the Mindscape: Shades appear without pause, faster and tougher as the run goes on, until the player
// is overwhelmed. Then the tree, then a fresh run.
export const run = defineConfig(
  'run',
  'run',
  {
    // Seconds of calm at the start of a run before the first Shade.
    startDelay: 1,
    // Shades per second at the start of a run.
    spawnRate: 1,
    // The spawn rate rises by this much (Shades per second) each minute.
    spawnRatePerMinute: 2,
    maxSpawnRate: 6,
    // No new Shades while this many are already out.
    maxAlive: 80,
    // Each minute of the run adds this much health to newly spawned Shades.
    hpPerMinute: 20,
    // Shades never appear closer to the player than this.
    minSpawnDistance: 260,
    // A Shade spawn zone marker covers a circle this big (times the marker's size). A map with no zones is calm (dev spawns go
    // along its edge).
    spawnZoneRadius: 96,
    // Pause after death before the tree opens.
    restartDelay: 0.8,
    deathShake: 10,
    deathSmoke: 30,
    // A kill freezes the sim for this long, so each one lands.
    killHitStop: 0,
    // After a hit-stop, kills within this many seconds do not freeze again, so a piercing arrow that kills
    // several Shades one after another gives one freeze, not a stutter.
    hitStopGap: 0.25,
    killShake: 2,
  },
  {
    startDelay: { min: 0, max: 10, step: 0.25 },
    spawnRate: { min: 0, max: 10, step: 0.05 },
    spawnRatePerMinute: { min: 0, max: 10, step: 0.05 },
    maxSpawnRate: { min: 0.1, max: 30, step: 0.1 },
    maxAlive: { min: 1, max: 200, step: 1 },
    hpPerMinute: { min: 0, max: 200, step: 1 },
    minSpawnDistance: { min: 0, max: 800, step: 10 },
    spawnZoneRadius: { min: 8, max: 400, step: 8 },
    restartDelay: { min: 0, max: 5, step: 0.1 },
    deathShake: { min: 0, max: 40, step: 1 },
    deathSmoke: { min: 0, max: 100, step: 1 },
    killHitStop: { min: 0, max: 0.3, step: 0.01 },
    hitStopGap: { min: 0, max: 2, step: 0.05 },
    killShake: { min: 0, max: 20, step: 0.5 },
  },
);
