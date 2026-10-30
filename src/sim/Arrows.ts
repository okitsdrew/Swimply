import { bow } from '../config/character';
import { segmentCircle } from '../core/geometry';
import { toScreen, toWorld } from '../core/iso';
import { Pool } from '../core/pool';
import { stats } from './stats';
import { Target } from './targets';
import { CollisionWorld } from './World';

export interface Arrow {
  active: boolean;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  // How much world distance one screen pixel of travel covers in this direction.
  stretch: number;
  traveled: number;
  range: number;
  speed: number;
  damage: number;
  pierce: number;
  hitRadius: number;
  size: number;
  hits: Set<number>;
}

// Arrow flight and hits. No drawing: render/ArrowsView reads `pool.items`.
export class Arrows {
  readonly pool: Pool<Arrow>;
  private contacts: { t: number; target: Target }[] = [];

  onBlocked: (x: number, y: number) => void = () => {};
  onHit: (target: Target, damage: number, arrowX: number, arrowY: number, dirX: number, dirY: number) => void = () => {};
  onRelease: (a: Arrow) => void = () => {};
  onSpawn: (a: Arrow) => void = () => {};

  constructor() {
    this.pool = new Pool<Arrow>(() => ({
      active: false, x: 0, y: 0, dirX: 1, dirY: 0, stretch: 1, traveled: 0, range: 0, speed: 0,
      damage: 0, pierce: 0, hitRadius: 0, size: 1, hits: new Set(),
    }));
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  // Fires a volley; extra arrows fan out around the aim direction. Speed, range and the fan are measured
  // on screen, so every arrow visibly travels the same distance whichever way the iso projection skews it.
  fire(x: number, y: number, dirX: number, dirY: number): void {
    const count = stats.arrows();
    const aim = toScreen(dirX, dirY);
    const base = Math.atan2(aim.y, aim.x);
    const spread = (bow.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const angle = base + (i - (count - 1) / 2) * spread;
      const a = this.pool.obtain();
      a.active = true;
      const w = toWorld(Math.cos(angle), Math.sin(angle));
      a.stretch = Math.hypot(w.x, w.y);
      a.dirX = w.x / a.stretch;
      a.dirY = w.y / a.stretch;
      a.x = x;
      a.y = y;
      a.traveled = 0;
      a.range = stats.range();
      a.speed = bow.arrowSpeed;
      a.damage = stats.damage();
      a.pierce = stats.pierce();
      a.size = stats.arrowSize();
      a.hitRadius = bow.arrowHitRadius * a.size;
      a.hits.clear();
      this.onSpawn(a);
    }
  }

  update(dt: number, targets: readonly Target[], world: CollisionWorld): void {
    for (const a of this.pool.items) {
      if (!a.active) continue;
      const stepPx = Math.min(a.speed * dt, a.range - a.traveled);
      const step = stepPx * a.stretch;
      const x1 = a.x + a.dirX * step;
      const y1 = a.y + a.dirY * step;

      // Terrain stops the arrow where it first touches something solid; anything behind that point is safe.
      const wall = world.raycast(a.x, a.y, a.dirX, a.dirY, step);
      // Swept test along this frame's segment so fast arrows can't tunnel through targets.
      this.contacts.length = 0;
      for (const target of targets) {
        if (!target.alive || a.hits.has(target.id)) continue;
        const t = segmentCircle(a.x, a.y, a.dirX, a.dirY, step, target.x, target.y, target.radius + a.hitRadius);
        if (t >= 0 && (wall < 0 || t <= wall)) this.contacts.push({ t, target });
      }
      this.contacts.sort((p, q) => p.t - q.t);

      let stopAt = -1;
      for (const { t, target } of this.contacts) {
        a.hits.add(target.id);
        this.onHit(target, a.damage, a.x + a.dirX * t, a.y + a.dirY * t, a.dirX, a.dirY);
        if (a.pierce > 0) {
          a.pierce--;
        } else {
          stopAt = t;
          break;
        }
      }

      if (stopAt >= 0) {
        this.release(a);
        continue;
      }
      if (wall >= 0) {
        this.onBlocked(a.x + a.dirX * wall, a.y + a.dirY * wall);
        this.release(a);
        continue;
      }
      a.x = x1;
      a.y = y1;
      a.traveled += stepPx;
      if (a.traveled >= a.range - 1e-6) this.release(a);
    }
  }

  clear(): void {
    for (const a of this.pool.items) if (a.active) this.release(a);
  }

  private release(a: Arrow): void {
    a.active = false;
    this.onRelease(a);
  }
}
