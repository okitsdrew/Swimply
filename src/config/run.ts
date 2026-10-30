import { defineConfig } from './store';

// One run in the arena: endless waves of Shades until the player dies, then a restart.
export const run = defineConfig(
  'run',
  'run',
  {
    firstWave: 3,
    // Each wave brings this many more Shades than the last.
    perWave: 1,
    // Waves never grow past this many Shades.
    maxPerWave: 20,
    // Pause between clearing a wave and the next one starting.
    waveDelay: 2,
    // Gap between Shades of the same wave appearing.
    spawnStagger: 0.35,
    // Shades never appear closer to the player than this.
    minSpawnDistance: 260,
    // Pause after death before a click restarts.
    restartDelay: 0.8,
    deathShake: 10,
    deathSmoke: 30,
    // A kill freezes the sim for this long, so each one lands.
    killHitStop: 0.04,
    killShake: 2,
  },
  {
    firstWave: { min: 1, max: 40, step: 1 },
    perWave: { min: 0, max: 10, step: 1 },
    maxPerWave: { min: 1, max: 100, step: 1 },
    waveDelay: { min: 0, max: 10, step: 0.25 },
    spawnStagger: { min: 0, max: 3, step: 0.05 },
    minSpawnDistance: { min: 0, max: 800, step: 10 },
    restartDelay: { min: 0, max: 5, step: 0.1 },
    deathShake: { min: 0, max: 40, step: 1 },
    deathSmoke: { min: 0, max: 100, step: 1 },
    killHitStop: { min: 0, max: 0.3, step: 0.01 },
    killShake: { min: 0, max: 20, step: 0.5 },
  },
);
