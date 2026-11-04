import { defineConfig } from './store';

// How stuns, freezes, slows and burns look on an enemy (sim/status.ts says what they do).
export const status = defineConfig(
  'status',
  'look and feel',
  {
    // Stunned: stars circling over its head. How many, how fast (turns a second), how wide (art pixels), and how
    // high over it, as a multiple of its body radius plus a few art pixels.
    stunStars: 3,
    stunSpin: 1.2,
    stunWidth: 10,
    headHeight: 1.6,
    headExtra: 14,
    starColor: 0xffe14a,
    // Frozen, slowed and burning: a glow on it in these colours.
    freezeColor: 0x9ad8ff,
    slowColor: 0x6a7ab0,
    burnColor: 0xff8a2a,
  },
  {
    stunStars: { min: 1, max: 8, step: 1 },
    stunSpin: { min: 0, max: 5, step: 0.1 },
    stunWidth: { min: 0, max: 40, step: 1 },
    headHeight: { min: 0, max: 6, step: 0.1 },
    headExtra: { min: 0, max: 80, step: 1 },
    starColor: 'color',
    freezeColor: 'color',
    slowColor: 'color',
    burnColor: 'color',
  },
);
