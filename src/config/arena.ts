import { defineConfig } from './store';

// The plain hand-coded arena: a square room with a ring of pillars. Replaced by a map from the level editor later.
export const arena = defineConfig(
  'arena',
  'arena',
  {
    roomTiles: 24,
    pillars: 4,
    pillarRing: 260,
    pillarRadius: 28,
  },
  {
    roomTiles: { min: 6, max: 60, step: 1 },
    pillars: { min: 0, max: 16, step: 1 },
    pillarRing: { min: 0, max: 900, step: 10 },
    pillarRadius: { min: 4, max: 120, step: 2 },
  },
);
