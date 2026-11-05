import { defineConfig } from './store';

// Things arrows can break (an asset with health, set in the asset maker): how a hit and a break look and feel, and
// how often a burning one takes damage.
export const breakables = defineConfig(
  'breakables',
  'look and feel',
  {
    // Seconds a struck thing flashes white.
    flashTime: 0.08,
    hitShake: 0,
    // The break: a puff of smoke along its collision circles, a shake and a short freeze.
    breakSmoke: 2,
    breakShake: 0,
    breakHitStop: 0,
    // A burning thing takes its burn's damage in ticks this many seconds apart, flames rising off it.
    burnTick: 0.5,
  },
  {
    flashTime: { min: 0, max: 0.5, step: 0.01 },
    hitShake: { min: 0, max: 20, step: 0.5 },
    breakSmoke: { min: 0, max: 100, step: 1 },
    breakShake: { min: 0, max: 40, step: 1 },
    breakHitStop: { min: 0, max: 0.3, step: 0.01 },
    burnTick: { min: 0.1, max: 2, step: 0.05 },
  },
);
