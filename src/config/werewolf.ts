import { defineConfig } from './store';

// The Mindscape's werewolf mini-boss, an empowered elite. He walks at the player and, once close, winds up a
// dash attack: a rectangle grows out along the ground toward where the player was, then he dashes to its far end
// and slams, hurting everything inside it. The plain werewolf (a recurring elite) will get its own section with
// the same fields when it is built; sim/Werewolf.ts takes whichever section it is given.
export const werewolfMiniboss = defineConfig(
  'werewolf_miniboss',
  'bosses',
  {
    hp: 1000,
    // Seconds into a run when he arrives.
    arriveTime: 45,
    speed: 130,
    uniformScreenSpeed: true,
    radius: 26,
    scale: 1,
    // The player dies when his hit circle meets this fraction of the werewolf's radius.
    contactScale: 0.6,
    turnRate: 5,
    // Seconds his spawn mark shows before he rises.
    spawnTell: 1.5,
    walkFps: 8,
    // He starts an attack when the player is this close.
    triggerRange: 200,
    // The attack rectangle's length (how far he dashes) and width.
    attackRange: 250,
    attackWidth: 70,
    // The rectangle grows to full length over the windup; its direction is locked when the windup starts.
    windupTime: 0.8,
    // Dash speed. The player's dash is about 2000, so 1500 is about 75% of it.
    dashSpeed: 1500,
    // How long the slam pose holds, then how long he stands before walking again.
    slamTime: 0.3,
    recoverTime: 0.5,
    // Seconds after an attack before he can start the next one.
    attackCooldown: 1,
    // The slam hurts the player even mid-dash or mid-teleport.
    slamPiercesInvuln: false,
    slamShake: 9,
    slamSmoke: 24,
    // Shards for killing him.
    shards: 50,
    deathSmoke: 50,
  },
  {
    hp: { min: 1, max: 10000, step: 10 },
    arriveTime: { min: 0, max: 600, step: 1 },
    speed: { min: 10, max: 800, step: 5 },
    uniformScreenSpeed: 'bool',
    radius: { min: 4, max: 100, step: 1 },
    scale: { min: 0.3, max: 4, step: 0.05 },
    contactScale: { min: 0, max: 2, step: 0.05 },
    turnRate: { min: 0.5, max: 40, step: 0.5 },
    spawnTell: { min: 0, max: 5, step: 0.05 },
    walkFps: { min: 1, max: 30, step: 1 },
    triggerRange: { min: 0, max: 800, step: 10 },
    attackRange: { min: 0, max: 1000, step: 10 },
    attackWidth: { min: 10, max: 300, step: 5 },
    windupTime: { min: 0.05, max: 3, step: 0.05 },
    dashSpeed: { min: 100, max: 6000, step: 50 },
    slamTime: { min: 0, max: 2, step: 0.05 },
    recoverTime: { min: 0, max: 3, step: 0.05 },
    attackCooldown: { min: 0, max: 10, step: 0.1 },
    slamPiercesInvuln: 'bool',
    slamShake: { min: 0, max: 40, step: 1 },
    slamSmoke: { min: 0, max: 100, step: 1 },
    shards: { min: 0, max: 500, step: 5 },
    deathSmoke: { min: 0, max: 150, step: 1 },
  },
);

export type WolfConfig = typeof werewolfMiniboss;
