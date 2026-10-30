import { run } from '../config/run';
import { Shades } from './Shades';

export type RunState = 'fighting' | 'dead';

// One run: waves of Shades that grow until the player dies. Run state is never saved; a restart starts fresh.
export class Run {
  state: RunState = 'fighting';
  wave = 0;
  kills = 0;
  time = 0;
  // Seconds since death, so a restart click is not taken too early.
  deadTime = 0;
  // Spawning paused from the dev menu.
  holdWaves = false;
  private toSpawn = 0;
  private spawnTimer = 0;
  private breakTimer = 0;

  // The scene picks where a Shade appears, since it knows the room and the player.
  spawnPoint: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
  onWave: (wave: number) => void = () => {};

  constructor(private shades: Shades) {}

  reset(): void {
    this.state = 'fighting';
    this.wave = 0;
    this.kills = 0;
    this.time = 0;
    this.deadTime = 0;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.breakTimer = run.waveDelay;
  }

  die(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadTime = 0;
  }

  get canRestart(): boolean {
    return this.state === 'dead' && this.deadTime >= run.restartDelay;
  }

  // Starts the next wave at once.
  nextWave(): void {
    this.wave++;
    this.toSpawn = Math.min(Math.round(run.maxPerWave), Math.round(run.firstWave + run.perWave * (this.wave - 1)));
    this.spawnTimer = 0;
    this.onWave(this.wave);
  }

  update(dt: number): void {
    if (this.state === 'dead') {
      this.deadTime += dt;
      return;
    }
    this.time += dt;
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      while (this.toSpawn > 0 && this.spawnTimer <= 0) {
        const p = this.spawnPoint();
        this.shades.spawn(p.x, p.y);
        this.toSpawn--;
        this.spawnTimer += run.spawnStagger;
      }
      return;
    }
    if (this.holdWaves || this.shades.remaining > 0) {
      this.breakTimer = run.waveDelay;
      return;
    }
    this.breakTimer -= dt;
    if (this.breakTimer <= 0) this.nextWave();
  }
}
