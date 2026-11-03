import { defineConfig } from './store';

// The Priest: a basic enemy that keeps its distance and casts. It walks until the player is in range and in
// sight, stops, raises its arms (the warning), then throws a slow orb straight at where the player stands.
export const priest = defineConfig(
  'priest',
  'enemies',
  {
    hp: 60,
    speed: 90,
    radius: 18,
    scale: 1,
    // The player dies when his hit circle meets this fraction of the Priest's radius.
    contactScale: 0.6,
    turnRate: 6,
    knockback: 60,
    knockbackDecay: 12,
    // It stops walking once the player is this close (and in sight), and steps back if he comes closer than tooClose.
    castRange: 450,
    tooClose: 200,
    backSpeed: 60,
    // Arms up for this long before the orb goes; then frame 12 holds for castHold.
    castWindup: 0.7,
    castHold: 0.3,
    castCooldown: 2.2,
    // The first cast after it wakes or rises comes this soon.
    firstCast: 0.8,
    // Orbs fly through walls and anything else solid. Off, they stop where an arrow would.
    orbsThroughWalls: true,
    // It only starts a cast when nothing solid is between it and the player; off, being in range is enough.
    needsSight: true,
    orbSpeed: 260,
    orbRadius: 9,
    // Seconds an orb flies before it fades out.
    orbLife: 3,
    // The orb hurts the player when it is this fraction of its radius from his hit circle.
    orbContact: 0.8,
    // Seconds the spawn mark shows before it rises; it cannot hurt or be hit until then.
    spawnTell: 0.7,
    walkFrameTime: 0.25,
    deathSmoke: 10,
  },
  {
    hp: { min: 1, max: 2000, step: 1 },
    speed: { min: 10, max: 800, step: 5 },
    radius: { min: 2, max: 80, step: 1 },
    scale: { min: 0.3, max: 4, step: 0.05 },
    contactScale: { min: 0.1, max: 2, step: 0.05 },
    turnRate: { min: 0.5, max: 40, step: 0.5 },
    knockback: { min: 0, max: 1000, step: 10 },
    knockbackDecay: { min: 1, max: 60, step: 1 },
    castRange: { min: 50, max: 2000, step: 10 },
    tooClose: { min: 0, max: 1000, step: 10 },
    backSpeed: { min: 0, max: 400, step: 5 },
    castWindup: { min: 0.05, max: 3, step: 0.05 },
    castHold: { min: 0, max: 2, step: 0.05 },
    castCooldown: { min: 0.1, max: 10, step: 0.1 },
    firstCast: { min: 0, max: 5, step: 0.1 },
    orbsThroughWalls: 'bool',
    needsSight: 'bool',
    orbSpeed: { min: 20, max: 1500, step: 10 },
    orbRadius: { min: 2, max: 60, step: 1 },
    orbLife: { min: 0.2, max: 10, step: 0.1 },
    orbContact: { min: 0.1, max: 2, step: 0.05 },
    spawnTell: { min: 0, max: 3, step: 0.05 },
    walkFrameTime: { min: 0.05, max: 1, step: 0.01 },
    deathSmoke: { min: 0, max: 60, step: 1 },
  },
);
