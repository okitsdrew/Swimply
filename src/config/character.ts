import { defineConfig } from './store';

// The player character's tunables, carried over from Heaven's tuned values.

export const player = defineConfig(
  'player',
  'player',
  {
    moveSpeed: 150,
    // While shooting, walking slows to this fraction for shootSlowTime seconds.
    shootSpeedMult: 0.5,
    shootSlowTime: 0.25,
    // Keeps on-screen speed equal in every direction (iso would otherwise make horizontal movement faster).
    uniformScreenSpeed: true,
    screenSpeedMult: 1,
    accel: 4000,
    // The small forgiving circle enemies must touch to kill him.
    hitRadius: 6,
    // The circle that collides with walls.
    bodyRadius: 10,
    // Safe time after a dash or teleport ends.
    invulnAfter: 0.2,
  },
  {
    moveSpeed: { min: 50, max: 800, step: 5 },
    shootSpeedMult: { min: 0.1, max: 1.5, step: 0.05 },
    shootSlowTime: { min: 0, max: 2, step: 0.05 },
    uniformScreenSpeed: 'bool',
    screenSpeedMult: { min: 0.3, max: 2, step: 0.05 },
    accel: { min: 200, max: 20000, step: 100 },
    hitRadius: { min: 1, max: 30, step: 1 },
    bodyRadius: { min: 1, max: 40, step: 1 },
    invulnAfter: { min: 0, max: 2, step: 0.05 },
  },
);

export const bow = defineConfig(
  'bow',
  'player',
  {
    fireRate: 1,
    damage: 5,
    pierce: 0,
    arrowsPerShot: 1,
    spreadDeg: 6,
    arrowSpeed: 1000,
    arrowRange: 600,
    arrowHitRadius: 15,
    fireWhileDashing: true,
  },
  {
    fireRate: { min: 0.1, max: 20, step: 0.1 },
    damage: { min: 1, max: 500, step: 1 },
    pierce: { min: 0, max: 20, step: 1 },
    arrowsPerShot: { min: 1, max: 15, step: 1 },
    spreadDeg: { min: 0, max: 45, step: 0.5 },
    arrowSpeed: { min: 100, max: 3000, step: 10 },
    arrowRange: { min: 50, max: 2000, step: 10 },
    arrowHitRadius: { min: 1, max: 40, step: 1 },
    fireWhileDashing: 'bool',
  },
);

export const dash = defineConfig(
  'dash',
  'player',
  {
    duration: 0.075,
    distance: 150,
    cooldown: 0.25,
    // A dash pressed this early before it is ready still happens when it becomes ready.
    inputBuffer: 0.12,
    lockTime: 0,
    slideStartMult: 1,
    slideEndMult: 1,
    afterimages: 4,
    afterimageFade: 0.25,
  },
  {
    duration: { min: 0.02, max: 1, step: 0.01 },
    distance: { min: 0, max: 800, step: 5 },
    cooldown: { min: 0, max: 5, step: 0.05 },
    inputBuffer: { min: 0, max: 0.5, step: 0.01 },
    lockTime: { min: 0, max: 1, step: 0.05 },
    slideStartMult: { min: 0, max: 4, step: 0.05 },
    slideEndMult: { min: 0, max: 4, step: 0.05 },
    afterimages: { min: 0, max: 20, step: 1 },
    afterimageFade: { min: 0.05, max: 1.5, step: 0.05 },
  },
);

export const teleport = defineConfig(
  'teleport',
  'player',
  {
    distance: 200,
    cooldown: 0.1,
    speed: 3500,
    lockTime: 0.2,
    slideStartMult: 1.5,
    slideEndMult: 0.3,
    armsUpTime: 0.4,
    zipTime: 0.06,
    lineFade: 0.1,
    lineWidth: 2.5,
    puffs: 2,
  },
  {
    distance: { min: 50, max: 1000, step: 10 },
    cooldown: { min: 0, max: 10, step: 0.05 },
    speed: { min: 0, max: 8000, step: 50 },
    lockTime: { min: 0, max: 1, step: 0.05 },
    slideStartMult: { min: 0, max: 4, step: 0.05 },
    slideEndMult: { min: 0, max: 4, step: 0.05 },
    armsUpTime: { min: 0, max: 3, step: 0.05 },
    zipTime: { min: 0.01, max: 0.5, step: 0.01 },
    lineFade: { min: 0.05, max: 2, step: 0.05 },
    lineWidth: { min: 0.5, max: 10, step: 0.5 },
    puffs: { min: 0, max: 60, step: 1 },
  },
);
