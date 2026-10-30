import { dummy } from '../config/dummy';
import { feel } from '../config/feel';
import { Target } from './targets';

export interface Dummy extends Target {
  hp: number;
  respawn: number;
  flash: number;
}

// Training targets for testing the bow before real enemies exist.
export class Dummies {
  readonly list: Dummy[] = [];
  private nextId = 1e9;

  onDestroyed: (x: number, y: number) => void = () => {};

  spawnRing(cx: number, cy: number): void {
    const n = Math.round(dummy.count);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      this.spawn(cx + Math.cos(angle) * dummy.ringRadius, cy + Math.sin(angle) * dummy.ringRadius);
    }
  }

  spawn(x: number, y: number): void {
    this.list.push({ id: this.nextId++, x, y, radius: dummy.radius, alive: true, hp: dummy.hp, respawn: 0, flash: 0 });
  }

  clear(): void {
    this.list.length = 0;
  }

  damage(target: Target, amount: number): void {
    const d = target as Dummy;
    d.hp -= amount;
    d.flash = feel.hitFlashTime;
    if (d.hp <= 0) {
      d.alive = false;
      d.respawn = dummy.respawnTime;
      this.onDestroyed(d.x, d.y);
    }
  }

  update(dt: number): void {
    for (const d of this.list) {
      d.radius = dummy.radius;
      d.flash -= dt;
      if (!d.alive) {
        d.respawn -= dt;
        if (d.respawn <= 0) {
          d.alive = true;
          d.hp = dummy.hp;
        }
      }
    }
  }
}
