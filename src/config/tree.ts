import { defineConfig } from './store';

// The Mindscape's upgrade tree. The nodes themselves (names, stats, costs, layout) live in src/data/tree.json.
export const tree = defineConfig(
  'tree',
  'upgrades',
  {
    // Memory shards each Shade kill gives.
    shardsPerKill: 1,
    // Multiplies every node's cost, to speed up or slow down the whole tree at once.
    costScale: 1,
  },
  {
    shardsPerKill: { min: 0, max: 20, step: 1 },
    costScale: { min: 0, max: 5, step: 0.05 },
  },
);
