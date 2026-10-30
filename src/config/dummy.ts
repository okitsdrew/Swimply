import { defineConfig } from './store';

// Training dummies: targets for testing the bow before real enemies exist.
export const dummy = defineConfig(
  'dummy',
  'testing',
  {
    hp: 50,
    count: 8,
    ringRadius: 220,
    radius: 12,
    respawnTime: 1,
  },
  {
    hp: { min: 1, max: 5000, step: 1 },
    count: { min: 1, max: 64, step: 1 },
    ringRadius: { min: 40, max: 800, step: 10 },
    radius: { min: 2, max: 60, step: 1 },
    respawnTime: { min: 0, max: 10, step: 0.1 },
  },
);
