import { flameTorrent as cfg } from '../config/vestiges';
import { Vec2 } from '../core/iso';
import { Target } from './targets';

export interface Fireball {
  // Seconds since it left (negative while it waits its turn).
  age: number;
  // Which side of him it leaves from: 1 or -1.
  side: number;
  // The way it was aimed, as a unit vector, and its side axis.
  dirX: number;
  dirY: number;
  x: number;
  y: number;
  // Its heading this step, for drawing.
  velX: number;
  velY: number;
  // When it may next hit each enemy, by id.
  hitAt: Map<number, number>;
}

// Flame Torrent's fireballs. Each flies a loop that moves with him: out from his side, across just in front of him,
// wide on the other side to the aimed tip, and back down its own side to him. They pass through walls. No drawing:
// render/FireballsView reads `list`.
export class Fireballs {
  readonly list: Fireball[] = [];
  private time = 0;

  onHit: (target: Target, damage: number, x: number, y: number) => void = () => {};
  // The last one came home.
  onDone: () => void = () => {};

  get active(): boolean {
    return this.list.length > 0;
  }

  // The fireball the butterfly rides: the first one out, while it flies.
  get lead(): Fireball | null {
    const f = this.list[0];
    return f && f.age >= 0 ? f : null;
  }

  // A torrent from him at (x, y) toward (dirX, dirY).
  cast(x: number, y: number, dirX: number, dirY: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    const n = Math.max(1, Math.round(cfg.perSide));
    for (let i = 0; i < n; i++) {
      for (const side of [1, -1]) {
        const f: Fireball = { age: -i * cfg.gap, side, dirX: dirX / len, dirY: dirY / len, x: 0, y: 0, velX: 0, velY: 0, hitAt: new Map() };
        this.place(f, 0, x, y, f);
        this.list.push(f);
      }
    }
  }

  // Where a fireball is at `t` (0 to 1 along its loop), for a hero at (hx, hy).
  private place(f: Fireball, t: number, hx: number, hy: number, out: Vec2): void {
    const forward = cfg.range * Math.sin(Math.PI * t);
    const s = f.side * (-cfg.width * Math.sin(2 * Math.PI * t) + cfg.side * (1 - t) ** 4);
    // The side axis is the aim turned a quarter.
    out.x = hx + f.dirX * forward - f.dirY * s;
    out.y = hy + f.dirY * forward + f.dirX * s;
  }

  update(dt: number, heroX: number, heroY: number, targets: readonly Target[]): void {
    this.time += dt;
    const time = this.time;
    if (!this.list.length) return;
    const p = { x: 0, y: 0 };
    for (const f of this.list) {
      f.age += dt;
      if (f.age < 0) continue;
      const t = Math.min(1, f.age / cfg.loopTime);
      this.place(f, t, heroX, heroY, p);
      f.velX = p.x - f.x;
      f.velY = p.y - f.y;
      f.x = p.x;
      f.y = p.y;
      for (const target of targets) {
        if (!target.alive || (f.hitAt.get(target.id) ?? 0) > time) continue;
        if (Math.hypot(target.x - f.x, target.y - f.y) > target.radius + cfg.hitRadius) continue;
        f.hitAt.set(target.id, time + cfg.rehitTime);
        this.onHit(target, cfg.damage, f.x, f.y);
      }
    }
    const before = this.list.length;
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].age >= cfg.loopTime) this.list.splice(i, 1);
    if (before && !this.list.length) this.onDone();
  }

  clear(): void {
    this.list.length = 0;
  }
}
