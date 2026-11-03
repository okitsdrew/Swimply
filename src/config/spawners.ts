import { defineConfig } from './store';

// Enemies in the world, outside the Mindscape: placed ones that wait for the player, and spawners. What each
// spawner spawns, how often and how many is on its asset (asset maker); its zone or aggro distance is on the placed
// thing (level editor).
export const spawners = defineConfig(
  'spawners',
  'enemies',
  {
    // How close the player comes before a placed enemy wakes, or a spawner with no zone starts, unless the placed
    // thing sets its own.
    aggroRadius: 400,
    // Seconds after the player arrives before a spawner's first enemy, then one every spawnEvery.
    firstSpawn: 0.5,
    // How far from the spawner's middle its enemies rise.
    spawnDistance: 70,
  },
  {
    aggroRadius: { min: 0, max: 2000, step: 10 },
    firstSpawn: { min: 0, max: 10, step: 0.1 },
    spawnDistance: { min: 0, max: 400, step: 5 },
  },
);
