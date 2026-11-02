import { defineConfig } from './store';

// Werewolves. He walks at the player and, once close, winds up a dash attack: a rectangle grows out along the
// ground toward where the player was, then he dashes to its far end and slams, hurting everything inside it. Right up
// close he swipes instead: a cone in front of him. Two sections share these fields: the Mindscape's mini-boss (an
// empowered elite) and the plain werewolf, an elite met in the world. sim/Werewolf.ts takes whichever it is given.
const wolf = {
  hp: 3000,
  // Seconds into a run when he arrives.
  arriveTime: 45,
  speed: 400,
  uniformScreenSpeed: true,
  // Body circle at scale 1; it grows with scale, so the hitbox always matches the picture.
  radius: 15,
  scale: 3,
  // The player dies when his hit circle meets this fraction of the werewolf's radius.
  contactScale: 1,
  turnRate: 5,
  // Seconds his spawn mark shows before he rises.
  spawnTell: 1.5,
  walkFps: 8,
  // He dashes when the player is this close.
  triggerRange: 300,
  // The attack rectangle's length (how far he dashes) and width. During the dash, the stretch he passes
  // through hurts (it travels with him); the slam then hurts the last attackWidth of the rectangle.
  attackRange: 400,
  attackWidth: 125,
  // The rectangle grows to full length over the windup; its direction is locked when the windup starts.
  windupTime: 0.4,
  // Dash speed. The player's dash is about 2000, so 1500 is about 75% of it.
  dashSpeed: 1500,
  // How long the slam pose holds, then how long he stands before walking again.
  slamTime: 0.3,
  recoverTime: 0.2,
  // Seconds after an attack before he can start the next one.
  attackCooldown: 1,
  // Once he can attack and the player is within jumpTriggerRange, he picks an attack. The chance of the jump is
  // jumpChance (jumpChanceAfterMiss right after a dash the player survived) up to jumpRampStart away, rising to
  // certain at jumpRampEnd. If he picks the dash, he walks in until the player is within triggerRange, but
  // switches to the jump if the player gets jumpRampEnd away.
  jumpTriggerRange: 1000,
  jumpChance: 0.25,
  jumpChanceAfterMiss: 0.5,
  jumpRampStart: 350,
  jumpRampEnd: 700,
  // The jump: he crouches, then leaps at where the player was (no further than jumpRange), over anything in the
  // way. A circle on the ground marks where he will land and fills as he comes down; landing hurts inside it.
  jumpWindup: 0.75,
  jumpAirTime: 0.75,
  jumpRange: 1000,
  jumpRadius: 110,
  // Height of the arc at its top, in screen pixels.
  jumpHeight: 140,
  // Seconds at the start of the jump shown in the in-between pose (werewolf_12) before the air pose.
  jumpTakeoff: 0.12,
  // How long the landing pose holds before he recovers.
  jumpLandTime: 0.35,
  // His quick dash (movement, not an attack): whenever it is ready and the player is further than
  // quickDashMinRange, he dashes toward them, leaving afterimages like the player's dash. Right after it, if his
  // attacks are ready, he starts the dash attack at once if the player is within triggerRange, or else rolls for
  // the jump; either starts with its windup cut to quickDashWindupScale.
  quickDashDistance: 75,
  quickDashDuration: 0.1,
  quickDashCooldown: 3,
  quickDashMinRange: 200,
  quickDashAfterimages: 2,
  quickDashWindupScale: 0.5,
  // The swipe, for when the player is right next to him: it ignores attackCooldown, so he never just walks
  // into them. When the player is within swipeTriggerRange he winds up (a cone on the ground, swipeAngle degrees
  // wide and swipeRange long, aimed at the player, fills from him outward), then lunges swipeLunge forward over
  // swipeTime, killing anyone in the cone, then recovers (recoverTime).
  swipeTriggerRange: 100,
  swipeRange: 200,
  swipeAngle: 120,
  swipeWindup: 0.45,
  swipeLunge: 60,
  swipeTime: 0.12,
  // The slam hurts the player even mid-dash or mid-teleport.
  slamPiercesInvuln: false,
  slamShake: 9,
  slamSmoke: 24,
  // Shards for killing him.
  shards: 50,
  deathSmoke: 50,
};

const ranges = {
  hp: { min: 1, max: 10000, step: 10 },
  arriveTime: { min: 0, max: 600, step: 1 },
  speed: { min: 10, max: 800, step: 5 },
  uniformScreenSpeed: 'bool',
  radius: { min: 2, max: 100, step: 1 },
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
  jumpTriggerRange: { min: 0, max: 2000, step: 10 },
  jumpChance: { min: 0, max: 1, step: 0.05 },
  jumpChanceAfterMiss: { min: 0, max: 1, step: 0.05 },
  jumpRampStart: { min: 0, max: 2000, step: 10 },
  jumpRampEnd: { min: 0, max: 2000, step: 10 },
  jumpWindup: { min: 0.05, max: 3, step: 0.05 },
  jumpAirTime: { min: 0.1, max: 3, step: 0.05 },
  jumpRange: { min: 50, max: 2000, step: 10 },
  jumpRadius: { min: 10, max: 400, step: 5 },
  jumpHeight: { min: 0, max: 400, step: 10 },
  jumpTakeoff: { min: 0, max: 1, step: 0.02 },
  jumpLandTime: { min: 0, max: 2, step: 0.05 },
  quickDashDistance: { min: 0, max: 600, step: 5 },
  quickDashDuration: { min: 0.02, max: 1, step: 0.01 },
  quickDashCooldown: { min: 0, max: 20, step: 0.1 },
  quickDashMinRange: { min: 0, max: 1000, step: 10 },
  quickDashAfterimages: { min: 0, max: 20, step: 1 },
  quickDashWindupScale: { min: 0.05, max: 1, step: 0.05 },
  swipeTriggerRange: { min: 0, max: 500, step: 5 },
  swipeRange: { min: 10, max: 600, step: 5 },
  swipeAngle: { min: 5, max: 360, step: 5 },
  swipeWindup: { min: 0.05, max: 3, step: 0.05 },
  swipeLunge: { min: 0, max: 300, step: 5 },
  swipeTime: { min: 0.02, max: 1, step: 0.01 },
  slamPiercesInvuln: 'bool',
  slamShake: { min: 0, max: 40, step: 1 },
  slamSmoke: { min: 0, max: 100, step: 1 },
  shards: { min: 0, max: 500, step: 5 },
  deathSmoke: { min: 0, max: 150, step: 1 },
} as const;

export const werewolfMiniboss = defineConfig('werewolf_miniboss', 'bosses', wolf, ranges);

// The plain werewolf: smaller, slower to wind up and less eager to attack, and about 15 arrows with the full tree.
// arriveTime is not used: he is placed or spawned, not brought in by a run's clock.
export const werewolf = defineConfig('werewolf', 'enemies', {
  ...wolf,
  hp: 600,
  speed: 300,
  scale: 2.25,
  windupTime: 0.6,
  jumpWindup: 0.9,
  swipeWindup: 0.55,
  attackCooldown: 1.6,
  jumpChance: 0.15,
  jumpChanceAfterMiss: 0.3,
  jumpRange: 700,
  jumpRadius: 85,
  attackRange: 320,
  attackWidth: 100,
  quickDashCooldown: 4,
  slamShake: 5,
  slamSmoke: 16,
  shards: 0,
  deathSmoke: 30,
}, ranges);

export type WolfConfig = typeof werewolfMiniboss;
