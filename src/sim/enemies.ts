import { Vec2 } from '../core/iso';
import { Navigator } from './Nav';
import { Status } from './status';
import { Target } from './targets';
import { CollisionWorld } from './World';

// One enemy of any kind, as arrows and the scene see it.
export interface Enemy extends Target {
  hp: number;
  // Stuns, slows, burns (sim/status.ts). While `status.held` it does nothing, and its touch and attacks do not hurt.
  status: Status;
}

// Shapes an enemy group reports for the dev menu's hitboxes: `hurts` is what kills the hero on touch.
export interface DebugDraw {
  ring(x: number, y: number, r: number, hurts: boolean): void;
  line(x0: number, y0: number, x1: number, y1: number): void;
}

// The one shape every kind of enemy has: a group that holds all enemies of that kind in the map. The scene only ever
// talks to enemies through this, so a new kind is a new group (and its view), not new code in the scene. What an
// enemy does (walking, casting, dashing, jumping) stays inside its own group: the scene only asks the questions here.
export interface EnemyGroup<E extends Enemy = Enemy> {
  readonly list: readonly E[];
  // Body radius, for keeping spawns clear of walls.
  readonly bodyRadius: number;
  // How much of an effect (stun, slow, burn) its kind shrugs off, 0 to 1.
  readonly ccResist: number;

  // One rising at (x, y): its spawn mark shows first.
  spawn(x: number, y: number): E;
  // Placed in a map: it stands there, and can be shot, until wake(). Kinds with no standing pose leave this out; the
  // scene then spawns them when the hero comes near.
  wait?(x: number, y: number): E;
  wake(e: E): void;
  // Still standing where it was placed, not yet woken.
  waiting(e: E): boolean;
  damage(e: E, amount: number, fromX: number, fromY: number): void;
  // Thrown away from (fromX, fromY), as hard as `amount` (a blast). A kind too heavy to move leaves this out.
  push?(e: E, fromX: number, fromY: number, amount: number): void;
  kill(e: E): void;
  clear(): void;
  update(dt: number, world: CollisionWorld, nav: Navigator, target: Vec2): void;

  // What arrows can hit right now.
  targets(out: Target[]): void;
  // Its attacks (not its body): true if one catches the hero's circle this step. `safe` is the hero's dodge
  // invulnerability; an attack that pierces it still counts. Called every step while he is alive, god mode or not.
  strikes(x: number, y: number, r: number, safe: boolean): boolean;
  // Its bodies (and anything it leaves in the air, like orbs): true if one touches the hero's circle.
  touching(x: number, y: number, r: number): boolean;
  debug(d: DebugDraw): void;

  onRisen: (e: E) => void;
  onKilled: (x: number, y: number, e: E) => void;
}
