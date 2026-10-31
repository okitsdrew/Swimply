import { defineConfig } from './store';

// How the simulation clock runs. The sim always advances in steps of exactly 1 / stepRate seconds, however fast
// the screen draws, so dodges and hit timing behave the same on every machine.
export const sim = defineConfig(
  'sim',
  'testing',
  {
    stepRate: 120,
    // A slow frame (or a tab coming back from the background) runs at most this many steps, then drops the rest.
    maxStepsPerFrame: 8,
    // Below 1 is slow motion, for tuning fights by eye.
    timeScale: 1,
    // Nothing can kill the player.
    godMode: false,
    // Teleport works before it has been unlocked in the story.
    allowTeleport: false,
  },
  {
    stepRate: { min: 30, max: 480, step: 30 },
    maxStepsPerFrame: { min: 1, max: 30, step: 1 },
    timeScale: { min: 0.05, max: 2, step: 0.05 },
    godMode: 'bool',
    allowTeleport: 'bool',
  },
);
