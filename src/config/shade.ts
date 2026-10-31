import { defineConfig } from './store';

// The Shade: easy fodder that walks at the player. Carried over from Heaven, with its own health and speed.
export const shade = defineConfig(
  'shade',
  'enemies',
  {
    hp: 10,
    speed: 120,
    // Keeps on-screen speed equal in every direction, as the player's does.
    uniformScreenSpeed: true,
    radius: 20,
    scale: 1,
    // The player dies when his hit circle meets this fraction of the Shade's radius.
    contactScale: 0.6,
    turnRate: 6,
    // Soft push between overlapping Shades.
    separation: 0.5,
    separationRate: 14,
    knockback: 80,
    knockbackDecay: 12,
    // How far ahead a Shade looks for a pillar to walk round.
    avoidLookahead: 70,
    // How much shorter the other side of a pillar must get before a Shade changes which way it goes round.
    avoidSwitch: 0.4,
    // Seconds the spawn mark shows before the Shade rises; it cannot hurt until then.
    spawnTell: 0.7,
    bobHeight: 1.5,
    bobSpeed: 3,
    hemFlicker: 6,
    deathSmoke: 8,
    deathFlash: 0.6,
  },
  {
    hp: { min: 1, max: 2000, step: 1 },
    speed: { min: 10, max: 800, step: 5 },
    uniformScreenSpeed: 'bool',
    radius: { min: 2, max: 80, step: 1 },
    scale: { min: 0.3, max: 4, step: 0.05 },
    contactScale: { min: 0.1, max: 2, step: 0.05 },
    turnRate: { min: 0.5, max: 40, step: 0.5 },
    separation: { min: 0, max: 2, step: 0.05 },
    separationRate: { min: 0, max: 60, step: 1 },
    knockback: { min: 0, max: 1000, step: 10 },
    knockbackDecay: { min: 1, max: 60, step: 1 },
    avoidLookahead: { min: 0, max: 300, step: 5 },
    avoidSwitch: { min: 0, max: 2, step: 0.05 },
    spawnTell: { min: 0, max: 3, step: 0.05 },
    bobHeight: { min: 0, max: 8, step: 0.5 },
    bobSpeed: { min: 0, max: 20, step: 0.5 },
    hemFlicker: { min: 0, max: 30, step: 1 },
    deathSmoke: { min: 0, max: 60, step: 1 },
    deathFlash: { min: 0, max: 3, step: 0.1 },
  },
);
