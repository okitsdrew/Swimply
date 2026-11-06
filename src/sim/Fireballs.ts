import { flameTorrent } from '../config/vestiges';
import { Vec2 } from '../core/iso';
import { Placed } from '../data/maps';
import { Target } from './targets';
import { CollisionWorld } from './World';

export interface Fireball {
  // Seconds since it left (negative while it waits its turn).
  age: number;
  // How far out its tip is.
  range: number;
  // Which side of him it leaves from: 1 or -1.
  side: number;
  // Where it was shot from and which way, as a unit vector: its way out is fixed from these.
  fromX: number;
  fromY: number;
  dirX: number;
  dirY: number;
  // The point it is homing on, which follows him at no more than trackSpeed.
  chaseX: number;
  chaseY: number;
  // Out along its path, or back to him.
  back: boolean;
  x: number;
  y: number;
  // Its heading this step, for drawing.
  velX: number;
  velY: number;
  // When it may next hit each enemy (by id) and each breakable thing.
  hitAt: Map<number | Placed, number>;
}

// The settings a set of fireballs flies by: Flame Torrent's own, or a boss's (kate_fireballs). Without damage they
// hurt nothing but the hero, which their owner checks itself.
export interface FireballPath {
  range: number;
  width: number;
  side: number;
  outTime: number;
  returnSpeed: number;
  catchRadius: number;
  perSide: number;
  gap: number;
  damage?: number;
  hitRadius: number;
  rehitTime: number;
  // Steering (a boss's; none for Flame Torrent): for the first homingTime seconds it homes on a point that follows
  // `chase` at up to trackSpeed: its path turns toward the point at up to homingTurn degrees a second, and its tip
  // stays overshoot past the point (minRange to range from where it left).
  homingTurn?: number;
  trackSpeed?: number;
  homingTime?: number;
  overshoot?: number;
  minRange?: number;
}

const next = { x: 0, y: 0 };
// Fireballs fly over and through everything but walls (the level editor's "walls" category) and the map's edge.
const onlyWalls = (o: { asset: { category: string } }) => o.asset.category === 'walls';
const DEG = Math.PI / 180;

// Flame Torrent's fireballs, like boomerangs. Each flies out on its own path, set where it was shot: from his side,
// across just in front of him and curving out to the tip. From the tip (or a wall on the way) it flies straight back
// at him (or whoever threw them: `update` is told where home is), wherever he is now, until it reaches him; a wall on
// the way back puts it out. No drawing: render/FireballsView reads `list`.
export class Fireballs {
  readonly list: Fireball[] = [];
  private time = 0;

  onHit: (target: Target, damage: number, x: number, y: number) => void = () => {};
  // It passed through something that breaks.
  onHitThing: (thing: Placed, damage: number, x: number, y: number) => void = () => {};
  // One went out against a wall on its way back.
  onSnuffed: (x: number, y: number) => void = () => {};

  // `breaks` says which placed things it can hit (the ones with health); it flies through them.
  constructor(private world: CollisionWorld, private breaks: (o: Placed) => boolean, readonly cfg: FireballPath = flameTorrent) {}

  get active(): boolean {
    return this.list.length > 0;
  }

  // The fireball the butterfly rides: the first one out, while it flies.
  get lead(): Fireball | null {
    const f = this.list[0];
    return f && f.age >= 0 ? f : null;
  }

  // A torrent from him at (x, y) toward (dirX, dirY), its tip `range` away (the config's, unless given).
  cast(x: number, y: number, dirX: number, dirY: number, range = this.cfg.range): void {
    const cfg = this.cfg;
    const len = Math.hypot(dirX, dirY) || 1;
    const n = Math.max(1, Math.round(cfg.perSide));
    for (let i = 0; i < n; i++) {
      for (const side of [1, -1]) {
        const aim = range - (cfg.overshoot ?? 0);
        const f: Fireball = { age: -i * cfg.gap, side, range, fromX: x, fromY: y, dirX: dirX / len, dirY: dirY / len, chaseX: x + (dirX / len) * aim, chaseY: y + (dirY / len) * aim, back: false, x: 0, y: 0, velX: 0, velY: 0, hitAt: new Map() };
        this.place(f, 0, f);
        this.list.push(f);
      }
    }
  }

  // Where a fireball is on its way out at `t` (0 at his side, 1 at the tip).
  private place(f: Fireball, t: number, out: Vec2): void {
    const cfg = this.cfg;
    const h = t / 2;
    const forward = f.range * Math.sin(Math.PI * h);
    const s = f.side * (-cfg.width * Math.sin(2 * Math.PI * h) + cfg.side * (1 - h) ** 4);
    // The side axis is the aim turned a quarter.
    out.x = f.fromX + f.dirX * forward - f.dirY * s;
    out.y = f.fromY + f.dirY * forward + f.dirX * s;
  }

  // Bends a fireball's way out toward (x, y). It homes on its chase point, so a dash or teleport leaves that behind
  // and the path swings over smoothly instead of jumping.
  private steer(f: Fireball, dt: number, x: number, y: number): void {
    const cfg = this.cfg;
    const gapX = x - f.chaseX;
    const gapY = y - f.chaseY;
    const gap = Math.hypot(gapX, gapY);
    const follow = gap > 1e-6 ? Math.min(1, ((cfg.trackSpeed ?? 0) * dt) / gap) : 0;
    f.chaseX += gapX * follow;
    f.chaseY += gapY * follow;
    const dx = f.chaseX - f.fromX;
    const dy = f.chaseY - f.fromY;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const now = Math.atan2(f.dirY, f.dirX);
    const off = Math.atan2(Math.sin(Math.atan2(dy, dx) - now), Math.cos(Math.atan2(dy, dx) - now));
    const most = (cfg.homingTurn ?? 0) * DEG * dt;
    const a = now + Math.max(-most, Math.min(most, off));
    f.dirX = Math.cos(a);
    f.dirY = Math.sin(a);
    f.range = Math.max(cfg.minRange ?? 0, Math.min(cfg.range, d + (cfg.overshoot ?? 0)));
  }

  update(dt: number, heroX: number, heroY: number, targets: readonly Target[], chase?: Vec2): void {
    const cfg = this.cfg;
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.age += dt;
      if (f.age < 0) continue;
      let gone = false;
      if (!f.back) {
        if (chase && cfg.homingTurn && f.age <= (cfg.homingTime ?? 0)) this.steer(f, dt, chase.x, chase.y);
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
        const wall = this.world.raycast(f.x, f.y, mx / move, my / move, move, onlyWalls);
        if (wall >= 0) {
          next.x = f.x + (mx / move) * wall;
          next.y = f.y + (my / move) * wall;
          if (f.back) {
            gone = true;
            this.onSnuffed(next.x, next.y);
          } else f.back = true;
        }
      }
      this.hitThings(f, next.x, next.y);
      f.velX = next.x - f.x;
      f.velY = next.y - f.y;
      f.x = next.x;
      f.y = next.y;
      for (const target of targets) {
        if (!target.alive || (f.hitAt.get(target.id) ?? 0) > this.time) continue;
        if (Math.hypot(target.x - f.x, target.y - f.y) > target.radius + cfg.hitRadius) continue;
        f.hitAt.set(target.id, this.time + cfg.rehitTime);
        this.onHit(target, cfg.damage ?? 0, f.x, f.y);
      }
      if (gone) this.list.splice(i, 1);
    }
  }

  // Breakable things along its step, from where it was to (x, y), on three lines as wide as its hit radius.
  private hitThings(f: Fireball, x: number, y: number): void {
    const cfg = this.cfg;
    const mx = x - f.x;
    const my = y - f.y;
    const len = Math.hypot(mx, my);
    if (len < 1e-6) return;
    const ux = mx / len;
    const uy = my / len;
    for (const off of [0, cfg.hitRadius, -cfg.hitRadius]) {
      const sx = f.x - uy * off;
      const sy = f.y + ux * off;
      if (this.world.raycast(sx, sy, ux, uy, len, this.breaks) < 0) continue;
      const thing = this.world.lastHit;
      if (!thing || (f.hitAt.get(thing) ?? 0) > this.time) continue;
      f.hitAt.set(thing, this.time + cfg.rehitTime);
      this.onHitThing(thing, cfg.damage ?? 0, x, y);
    }
  }

  clear(): void {
    this.list.length = 0;
  }
}
