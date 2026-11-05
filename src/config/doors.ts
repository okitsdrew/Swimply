import { defineConfig } from './store';

// How door rings look: a glowing ring on the ground at every door, blue when F will take him through, red when not.
// The colours are in the sprites (door_ring, door_ring_closed).
export const doors = defineConfig(
  'doors',
  'look and feel',
  {
    // How solid the ring is, open and locked.
    openAlpha: 0.75,
    lockedAlpha: 0.7,
    // An open ring breathes: how much (a fraction of its alpha) and how many times a second.
    pulse: 0.3,
    pulseSpeed: 0.8,
    // Seconds the colour takes to change when a door unlocks or locks.
    fadeTime: 0.5,
  },
  {
    openAlpha: { min: 0, max: 1, step: 0.05 },
    lockedAlpha: { min: 0, max: 1, step: 0.05 },
    pulse: { min: 0, max: 1, step: 0.05 },
    pulseSpeed: { min: 0, max: 4, step: 0.1 },
    fadeTime: { min: 0, max: 3, step: 0.05 },
  },
);
