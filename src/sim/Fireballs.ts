import { flameTorrent as cfg } from '../config/vestiges';
import { Vec2 } from '../core/iso';
import { Target } from './targets';
import { CollisionWorld } from './World';

export interface Fireball {
  // Seconds since it left (negative while it waits its turn).
  age: number;
  // Which side of him it leaves from: 1 or -1.
  side: number;
  // Where it was shot from and which way, as a unit vector: its way out is fixed from these.
  fromX: number;
  fromY: number;
  dirX: number;
  dirY: number;
  // Out along its path, or back to him.
  back: boolean;
  x: number;
  y: number;
  // Its heading this step, for drawing.
  velX: number;
  velY: number;
  // When it may next hit each enemy, by id.
  hitAt: Map<number, number>;
}

const next = { x: 0, y: 0 };

// Flame Torrent's fireballs, like boomerangs. Each flies out on its own path, set where it was shot: from his side,
// across just in front of him and curving out to the tip. From the tip (or a wall on the way) it flies straight back
// at him, wherever he is now, until it reaches him; a wall on the way back puts it out. No drawing:
// render/FireballsView reads `list`.
export class Fireballs {
  readonly list: Fireball[] = [];
  private time = 0;

  onHit: (target: Target, damage: number, x: number, y: number) => void = () => {};
  // One went out against a wall on its way back.
  onSnuffed: (x: number, y: number) => void = () => {};

  constructor(private world: CollisionWorld) {}

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
        const f: Fireball = { age: -i * cfg.gap, side, fromX: x, fromY: y, dirX: dirX / len, dirY: dirY / len, back: false, x: 0, y: 0, velX: 0, velY: 0, hitAt: new Map() };
        this.place(f, 0, f);
        this.list.push(f);
      }
    }
  }

  // Where a fireball is on its way out at `t` (0 at his side, 1 at the tip).
  private place(f: Fireball, t: number, out: Vec2): void {
    const h = t / 2;
    const forward = cfg.range * Math.sin(Math.PI * h);
    const s = f.side * (-cfg.width * Math.sin(2 * Math.PI * h) + cfg.side * (1 - h) ** 4);
    // The side axis is the aim turned a quarter.
    out.x = f.fromX + f.dirX * forward - f.dirY * s;
    out.y = f.fromY + f.dirY * forward + f.dirX * s;
  }

  update(dt: number, heroX: number, heroY: number, targets: readonly Target[]): void {
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.age += dt;
      if (f.age < 0) continue;
      let gone = false;
      if (!f.back) {
        const t = Math.min(1, f.age / cfg.outTime);
        this.place(f, t, next);
        if (t >= 1) f.back = true;
      } else {
        const dx = heroX - f.x;
        const dy = heroY - f.y;
        const d = Math.hypot(dx, dy);
        const step = cfg.returnSpeed * dt;
        if (d <= step + cfg.catchRadius) {
          next.x = heroX;
          next.y = heroY;
          gone = true;
        } else {
          next.x = f.x + (dx / d) * step;
          next.y = f.y + (dy / d) * step;
        }
      }
      // Walls: on the way out it turns back where it touched; on the way back it goes out.
      const mx = next.x - f.x;
      const my = next.y - f.y;
      const move = Math.hypot(mx, my);
      if (move > 1e-6 && !gone) {
        const wall = this.world.raycast(f.x, f.y, mx / move, my / move, move);
        if (wall >= 0) {
          next.x = f.x + (mx / move) * wall;
          next.y = f.y + (my / move) * wall;
          if (f.back) {
            gone = true;
            this.onSnuffed(next.x, next.y);
          } else f.back = true;
        }
      }
      f.velX = next.x - f.x;
      f.velY = next.y - f.y;
      f.x = next.x;
      f.y = next.y;
      for (const target of targets) {
        if (!target.alive || (f.hitAt.get(target.id) ?? 0) > this.time) continue;
        if (Math.hypot(target.x - f.x, target.y - f.y) > target.radius + cfg.hitRadius) continue;
        f.hitAt.set(target.id, this.time + cfg.rehitTime);
        this.onHit(target, cfg.damage, f.x, f.y);
      }
      if (gone) this.list.splice(i, 1);
    }
  }

  clear(): void {
    this.list.length = 0;
  }
}
