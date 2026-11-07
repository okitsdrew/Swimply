import { bow, player } from '../config/character';
import { sim } from '../config/sim';
import { story } from '../config/story';
import { doomsday, enhancementValues, flameTorrent } from '../config/vestiges';
import { save } from '../core/save';
import { enhancementOn } from '../data/enhancements';

// The permanent baseline from the upgrade tree, by stat id (see data/tree.ts for which stats add and which multiply).
const add = (id: string): number => save.baseline[id] ?? 0;
const pct = (id: string): number => Math.max(0.05, 1 + (save.baseline[id] ?? 0));

// Momentum (an enhancement): what arrow hits have added to damage and attack speed, for as long as they keep landing.
export const momentum = {
  bonus: 0,
  left: 0,
  hit(): void {
    if (!enhancementOn('momentum')) return;
    this.bonus = Math.min(enhancementValues.momentumMax, this.bonus + enhancementValues.momentumPerHit);
    this.left = enhancementValues.momentumTime;
  },
  update(dt: number): void {
    this.left = Math.max(0, this.left - dt);
    if (this.left <= 0) this.bonus = 0;
  },
  reset(): void {
    this.bonus = 0;
    this.left = 0;
  },
  now(): number {
    return enhancementOn('momentum') ? this.bonus : 0;
  },
};

// The character's effective stats: config plus the baseline. Systems read these, never the raw config, so the
// baseline is added in exactly one place: here.
export const stats = {
  // Freshly woken: slow, no bow, no dash, until he first enters the Mindscape (save flag enteredMindscape).
  weak: (): boolean => !save.flags.enteredMindscape,
  moveSpeed: (): number => (player.moveSpeed + add('moveSpeed')) * (stats.weak() ? story.weakSpeedMult : 1),
  canFire: (): boolean => !stats.weak(),
  canDash: (): boolean => !stats.weak(),
  fireRate: (): number => (bow.fireRate + add('fireRate')) * (1 + momentum.now()),
  arrows: (): number => Math.round(bow.arrowsPerShot + add('arrows')),
  pierce: (): number => Math.round(bow.pierce + add('pierce')),
  range: (): number => bow.arrowRange * pct('range'),
  damage: (): number => (bow.damage + add('damage')) * (1 + momentum.now()),
  doomsdayDamage: (): number => doomsday.damage * (enhancementOn('soul_mending') ? enhancementValues.soulMendingDamage : 1),
  torrentDamage: (): number => flameTorrent.damage * (enhancementOn('kitchen_rush') ? enhancementValues.kitchenRushDamage : 1),
  // All his burn, however it was lit: fire is universal.
  burnPower: (): number => flameTorrent.burnPower * (enhancementOn('kitchen_rush') ? enhancementValues.kitchenRushDamage : 1),
  arrowSize: (): number => 1,
  // Seconds a run's clock starts at (Time Warp).
  runStart: (): number => add('runStart'),
  // Multiplies what each memory shard is worth.
  shardGain: (): number => pct('shardGain'),
  // Teleport is locked until it is unlocked after the Mindscape (a save flag), or by the dev menu.
  hasTeleport: (): boolean => !!save.flags.teleport || sim.allowTeleport,
};
