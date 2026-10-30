import { defineConfig } from './store';

// How the flat world is drawn. The simulation never reads these; only drawing code does.
export const render = defineConfig(
  'render',
  'look and feel',
  {
    // Iso projection: screen x = (x - y) * isoScale, screen y = (x + y) * isoScale / 2.
    isoScale: Math.SQRT1_2,
    // Each art pixel is drawn as this many screen pixels.
    pixelScale: 2,
    // Size of one floor tile in world units.
    tileSize: 64,
  },
  {
    isoScale: { min: 0.3, max: 1.5, step: 0.01 },
    pixelScale: { min: 1, max: 6, step: 1 },
    tileSize: { min: 16, max: 256, step: 8 },
  },
);
