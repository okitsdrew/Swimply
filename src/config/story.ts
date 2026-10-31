import { defineConfig } from './store';

// Getting from map to map, and the early story's rules: how weak he is before the Mindscape, interacting, doors,
// fades, and coming back after a death in a calm map.
export const story = defineConfig(
  'story',
  'story',
  {
    // Before he first enters the Mindscape he walks at this fraction of his speed, and cannot shoot or dash.
    weakSpeedMult: 0.1,
    // How close (world units, from the edge of its collision) he must be to a thing to interact with it.
    interactRange: 40,
    // A door marker's radius at size 1.
    doorRadius: 32,
    // Seconds the screen takes to fade out or in when changing map.
    fadeTime: 0.4,
    // Seconds after a death in a calm map before he is back at the start.
    respawnDelay: 1,
    // Seconds "Memories restored" shows before he leaves the Mindscape.
    clearedDelay: 2.5,
  },
  {
    weakSpeedMult: { min: 0.05, max: 1, step: 0.05 },
    interactRange: { min: 0, max: 200, step: 5 },
    doorRadius: { min: 4, max: 200, step: 4 },
    fadeTime: { min: 0, max: 2, step: 0.05 },
    respawnDelay: { min: 0, max: 5, step: 0.1 },
    clearedDelay: { min: 0, max: 10, step: 0.1 },
  },
);
