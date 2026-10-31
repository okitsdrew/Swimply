import { defineConfig } from './store';

// Getting from map to map, and the early story's rules: how weak he is before the Mindscape, interacting, doors,
// fades, and coming back after a death in a calm map.
export const story = defineConfig(
  'story',
  'story',
  {
    // Before he first enters the Mindscape he walks at this fraction of his speed, and cannot shoot or dash.
    weakSpeedMult: 0.25,
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

// The dialogue box, the speech bubble and the ghostly tutorial words.
export const dialogue = defineConfig(
  'dialogue',
  'story',
  {
    // Letters a second as a line types out.
    typeSpeed: 40,
    // A typed line stays this long, plus readPerChar a letter, before the next one. F skips ahead.
    readTime: 1.2,
    readPerChar: 0.04,
    // Seconds tutorial words stay before the wind takes them.
    tutorialTime: 3,
    // Seconds each letter takes to blow away, and the delay from one letter to the next.
    blowTime: 1.4,
    blowStagger: 0.035,
    // How hard the wind pushes the letters (pixels a second, squared).
    wind: 900,
  },
  {
    typeSpeed: { min: 5, max: 200, step: 5 },
    readTime: { min: 0, max: 5, step: 0.1 },
    readPerChar: { min: 0, max: 0.2, step: 0.005 },
    tutorialTime: { min: 0.5, max: 10, step: 0.5 },
    blowTime: { min: 0.2, max: 5, step: 0.1 },
    blowStagger: { min: 0, max: 0.2, step: 0.005 },
    wind: { min: 0, max: 4000, step: 50 },
  },
);
