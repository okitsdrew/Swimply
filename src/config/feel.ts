import { defineConfig } from './store';

// How the character looks and moves on screen: arms, bow, walk, cloak, camera.

export const feel = defineConfig(
  'feel',
  'look and feel',
  {
    hitFlashTime: 0.06,
    bowKickTime: 0.5,
    strideLength: 140,
    // Lifts the whole hero while walking, feet too. The walk frames already dip the body on each step, so it is off.
    walkBob: 0,
    armReadyTime: 0.6,
    shootPoseTime: 0.08,
    shootArmSpread: 7,
    shootArmDrop: -10,
    shootFlapRate: 8,
    bowFloatDistance: 30,
    bowPhaseInTime: 0.06,
    bowPhaseOutTime: 0.3,
    handGlow: 0.8,
    bowFloatBob: 1.5,
    drawTime: 0.3,
    drawDistance: 6,
    armLength: 3,
    walkArmSpread: 14,
    walkArmDrop: 2,
    walkArmFlap: 7.5,
    damageNumbers: true,
    maxNumbersPerFrame: 10,
    maxNumbersAlive: 60,
  },
  {
    hitFlashTime: { min: 0, max: 0.5, step: 0.01 },
    bowKickTime: { min: 0, max: 0.5, step: 0.01 },
    strideLength: { min: 40, max: 400, step: 5 },
    walkBob: { min: 0, max: 5, step: 0.1 },
    armReadyTime: { min: 0, max: 3, step: 0.05 },
    shootPoseTime: { min: 0.005, max: 1, step: 0.005 },
    shootArmSpread: { min: 0, max: 30, step: 0.5 },
    shootArmDrop: { min: -20, max: 15, step: 0.5 },
    shootFlapRate: { min: 0, max: 60, step: 1 },
    bowFloatDistance: { min: 0, max: 80, step: 1 },
    bowPhaseInTime: { min: 0.005, max: 1, step: 0.005 },
    bowPhaseOutTime: { min: 0.005, max: 2, step: 0.05 },
    handGlow: { min: 0, max: 2, step: 0.05 },
    bowFloatBob: { min: 0, max: 8, step: 0.5 },
    drawTime: { min: 0.02, max: 1.5, step: 0.01 },
    drawDistance: { min: 0, max: 12, step: 0.5 },
    armLength: { min: 3, max: 15, step: 0.5 },
    walkArmSpread: { min: 0, max: 30, step: 0.5 },
    walkArmDrop: { min: -10, max: 15, step: 0.5 },
    walkArmFlap: { min: 0, max: 8, step: 0.5 },
    damageNumbers: 'bool',
    maxNumbersPerFrame: { min: 1, max: 100, step: 1 },
    maxNumbersAlive: { min: 5, max: 400, step: 5 },
  },
);

// The hero's code-drawn parts: arms (two-part lines bent at the elbow), gloves, and the glows on hands and eyes.
// Colours and sizes here, so they can be matched to his sprite without touching code. Sizes are in art pixels.
export const heroLook = defineConfig(
  'hero look',
  'look and feel',
  {
    sleeveColor: 0x7a46c8,
    sleeveEdgeColor: 0x1a0c30,
    gloveColor: 0x17121f,
    sleeveWidth: 1.75,
    sleeveEdge: 0,
    gloveSize: 1.2,
    handGlowColor: 0xa060ff,
    eyeGlowColor: 0xa060ff,
    // Where the eye glows sit, from the bottom middle of his sprite.
    eyeSpread: 2.5,
    eyeHeight: 15,
  },
  {
    sleeveColor: 'color',
    sleeveEdgeColor: 'color',
    gloveColor: 'color',
    sleeveWidth: { min: 0.25, max: 6, step: 0.25 },
    sleeveEdge: { min: 0, max: 3, step: 0.25 },
    gloveSize: { min: 0, max: 4, step: 0.1 },
    handGlowColor: 'color',
    eyeGlowColor: 'color',
    eyeSpread: { min: 0, max: 8, step: 0.5 },
    eyeHeight: { min: 0, max: 30, step: 0.5 },
  },
);

export const cloak = defineConfig(
  'cloak',
  'look and feel',
  {
    segments: 4,
    length: 9,
    width: 8,
    gravity: 760,
    drag: 20,
    eyeGlow: 0.4,
  },
  {
    segments: { min: 3, max: 12, step: 1 },
    length: { min: 8, max: 50, step: 1 },
    width: { min: 4, max: 30, step: 1 },
    gravity: { min: 0, max: 2000, step: 20 },
    drag: { min: 0, max: 20, step: 0.2 },
    eyeGlow: { min: 0, max: 1.5, step: 0.05 },
  },
);

export const camera = defineConfig(
  'camera',
  'look and feel',
  {
    followRate: 12,
    shakeOnCast: 4,
    shakeOnHit: 0.5,
    shakeDecay: 18,
  },
  {
    followRate: { min: 1, max: 60, step: 1 },
    shakeOnCast: { min: 0, max: 30, step: 0.5 },
    shakeOnHit: { min: 0, max: 20, step: 0.5 },
    shakeDecay: { min: 1, max: 60, step: 1 },
  },
);
