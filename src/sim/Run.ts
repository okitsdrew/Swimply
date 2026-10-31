import { run } from '../config/run';
import { shade } from '../config/shade';
import { Shades } from './Shades';

export type RunState = 'fighting' | 'dead';

// One run: Shades appear without pause, more often and with more health as the run's clock goes up, until the
// player dies. Run state is never saved; a restart starts fresh.
export class Run {
  state: RunState = 'fighting';
  kills = 0;
  // Memory shards earned this run (they are banked in the save as they are earned).
  shards = 0;
  time = 0;
  // Seconds since death, so the tree does not open too early.
  deadTime = 0;
  // Spawning paused from the dev menu.
  holdSpawns = false;
  // Shades owed, carried between steps so fractional rates add up.
  private owed = 0;

  // The scene picks where a Shade appears, since it knows the room and the player.
  spawnPoint: () => { x: number; y: number } = () => ({ x: 0, y: 0 });

  constructor(private shades: Shades) {}

  reset(): void {
    this.state = 'fighting';
    this.kills = 0;
    this.shards = 0;
    this.time = 0;
    this.deadTime = 0;
    this.owed = 0;
  }

  die(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadTime = 0;
  }

  get canRestart(): boolean {
    return this.state === 'dead' && this.deadTime >= run.restartDelay;
  }

  // Shades per second right now.
  get spawnRate(): number {
    return Math.min(run.maxSpawnRate, run.spawnRate + run.spawnRatePerMinute * (this.time / 60));
  }

  // Health of a Shade spawned right now.
  get shadeHp(): number {
    return Math.round(shade.hp + run.hpPerMinute * (this.time / 60));
  }

  spawn(): void {
    const p = this.spawnPoint();
    this.shades.spawn(p.x, p.y, this.shadeHp);
  }

  update(dt: number): void {
    if (this.state === 'dead') {
      this.deadTime += dt;
      return;
    }
    this.time += dt;
    if (this.holdSpawns || this.time < run.startDelay) return;
    this.owed += this.spawnRate * dt;
    while (this.owed >= 1) {
      this.owed--;
      if (this.shades.remaining < run.maxAlive) this.spawn();
    }
  }
}
