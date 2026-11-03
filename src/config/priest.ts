import { defineConfig } from './store';

// The Priest: a basic enemy that keeps its distance and casts. It walks until the player is in range and in
// sight, stops, raises its arms (the warning), then throws a slow orb straight at where the player stands.
export const priest = defineConfig(
  'priest',
  'enemies',
  {
    hp: 250,
    speed: 90,
    radius: 18,
    scale: 1.5,
    // The player dies when his hit circle meets this fraction of the Priest's radius.
    contactScale: 0.6,
    turnRate: 6,
    knockback: 60,
    knockbackDecay: 12,
    // It stops walking once the player is this close (and in sight). Closer than tooClose, it teleports away (or
    // steps back while its teleport is cooling down).
    castRange: 650,
    tooClose: 200,
    backSpeed: 60,
    // The teleport: out of range or out of sight, it blinks to a spot that can see him (through walls); too close,
    // it blinks escapeDistance away from him along open ground (never through a wall).
    teleportCooldown: 4,
    firstTeleport: 1.5,
    // The farthest it blinks into position from where it stands.
    teleportRange: 900,
    escapeDistance: 300,
    // Seconds it takes to fade out, and again to fade in at the new spot.
    blinkTime: 0.2,
    // Arms up for this long before the orb goes; then frame 12 holds for castHold.
    castWindup: 0.7,
    castHold: 0.3,
    castCooldown: 2.2,
    // The first cast after it wakes or rises comes this soon.
    firstCast: 0.8,
    // Orbs fly through walls and anything else solid. Off, they stop where an arrow would.
    orbsThroughWalls: false,
    // It only starts a cast when nothing solid is between it and the player; off, being in range is enough.
    needsSight: true,
    // An orb leaves slowly and speeds up to its top speed over orbRampTime seconds.
    orbStartSpeed: 150,
    orbEndSpeed: 600,
    orbRampTime: 0.75,
    orbRadius: 9,
    // Seconds an orb flies before it fades out. 0: it flies until it hits him or leaves the map.
    orbLife: 0,
    // How hard an orb turns toward him (degrees a second), for its first homingTime seconds; then it flies straight
    // on, so one that missed leaves instead of circling him forever.
    homingTurn: 60,
    homingTime: 1.5,
    // The orb hurts the player when it is this fraction of its radius from his hit circle.
    orbContact: 0.8,
    // Seconds the spawn mark shows before it rises; it cannot hurt or be hit until then.
    spawnTell: 0.7,
    walkFrameTime: 0.25,
    // Seconds per frame when the orb is drawn from sprites named priest_orb_0, priest_orb_1, ...
    orbFrameTime: 0.07,
    // The orb's trail: pixel sparks shed each second, and how long one lasts as it drifts back, falls and darkens.
    trailSparks: 40,
    trailLife: 0.4,
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
    teleportCooldown: { min: 0.2, max: 20, step: 0.1 },
    firstTeleport: { min: 0, max: 10, step: 0.1 },
    teleportRange: { min: 50, max: 3000, step: 10 },
    escapeDistance: { min: 50, max: 1500, step: 10 },
    blinkTime: { min: 0.02, max: 1, step: 0.02 },
    castWindup: { min: 0.05, max: 3, step: 0.05 },
    castHold: { min: 0, max: 2, step: 0.05 },
    castCooldown: { min: 0.1, max: 10, step: 0.1 },
    firstCast: { min: 0, max: 5, step: 0.1 },
    orbsThroughWalls: 'bool',
    needsSight: 'bool',
    orbStartSpeed: { min: 10, max: 2000, step: 10 },
    orbEndSpeed: { min: 20, max: 3000, step: 10 },
    orbRampTime: { min: 0, max: 10, step: 0.1 },
    orbRadius: { min: 2, max: 60, step: 1 },
    orbLife: { min: 0, max: 10, step: 0.1 },
    homingTurn: { min: 0, max: 720, step: 5 },
    homingTime: { min: 0, max: 10, step: 0.1 },
    orbContact: { min: 0.1, max: 2, step: 0.05 },
    spawnTell: { min: 0, max: 3, step: 0.05 },
    walkFrameTime: { min: 0.05, max: 1, step: 0.01 },
    orbFrameTime: { min: 0.02, max: 1, step: 0.01 },
    trailSparks: { min: 0, max: 200, step: 5 },
    trailLife: { min: 0.05, max: 2, step: 0.05 },
    deathSmoke: { min: 0, max: 60, step: 1 },
  },
);
