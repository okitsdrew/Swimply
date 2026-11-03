import { CollisionWorld } from '../sim/World';

// What an enemy view gets each screen frame.
export interface ViewFrame {
  // Real seconds since the last frame, and the same slowed or stopped as the sim is (slow motion, pause).
  dt: number;
  simDt: number;
  playerX: number;
  playerY: number;
  world: CollisionWorld;
  // The camera's width, for bars pinned to the screen.
  width: number;
}

// The one shape every enemy kind's view has (see sim/enemies.ts for the sim side).
export interface EnemyView<E> {
  render(f: ViewFrame): void;
  clear(): void;
  onRisen(e: E): void;
  onKilled(x: number, y: number, e: E): void;
}
