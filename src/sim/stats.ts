import { bow, player } from '../config/character';
import { sim } from '../config/sim';
import { story } from '../config/story';
import { save } from '../core/save';

// The permanent baseline from the upgrade tree, by stat id (see data/tree.ts for which stats add and which multiply).
const add = (id: string): number => save.baseline[id] ?? 0;
const pct = (id: string): number => Math.max(0.05, 1 + (save.baseline[id] ?? 0));

// The character's effective stats: config plus the baseline. Systems read these, never the raw config, so the
// baseline is added in exactly one place: here.
export const stats = {
  // Freshly woken: slow, no bow, no dash, until he first enters the Mindscape (save flag enteredMindscape).
  weak: (): boolean => !save.flags.enteredMindscape,
  moveSpeed: (): number => (player.moveSpeed + add('moveSpeed')) * (stats.weak() ? story.weakSpeedMult : 1),
  canFire: (): boolean => !stats.weak(),
  canDash: (): boolean => !stats.weak(),
  fireRate: (): number => bow.fireRate + add('fireRate'),
  arrows: (): number => Math.round(bow.arrowsPerShot + add('arrows')),
  pierce: (): number => Math.round(bow.pierce + add('pierce')),
  range: (): number => bow.arrowRange * pct('range'),
  damage: (): number => bow.damage + add('damage'),
  arrowSize: (): number => 1,
  // Seconds a run's clock starts at (Time Warp).
  runStart: (): number => add('runStart'),
  // Multiplies the memory shards each kill gives.
  shardGain: (): number => pct('shardGain'),
  // Teleport is locked until it is unlocked after the Mindscape (a save flag), or by the dev menu.
  hasTeleport: (): boolean => !!save.flags.teleport || sim.allowTeleport,
};
