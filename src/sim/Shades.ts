import { feel } from '../config/feel';
import { render } from '../config/render';
import { shade } from '../config/shade';
import { Circle } from '../core/geometry';
import { toScreen } from '../core/iso';
import { Navigator } from './Nav';
import { Target } from './targets';
import { CollisionWorld } from './World';

export interface Shade extends Target {
  hp: number;
  vx: number;
  vy: number;
  // Knockback velocity, kept apart from walking so it fades on its own.
  kx: number;
  ky: number;
  // Seconds left on the spawn mark. While above 0 the Shade is not out yet: it cannot hurt or be hit.
  rising: number;
  flash: number;
  phase: number;
  // The pillar it is walking round and which side it passes on (1 or -1), so it does not dither head-on.
  avoid: Circle | null;
  side: number;
}

const off = { x: 0, y: 0 };
const way = { x: 0, y: 0 };
// Extra gap kept from a pillar's edge while walking round it.
const CLEARANCE = 2;

// Shades walk at the player (round water by the navigator's route, round pillars by steering), and push gently
// off each other. No drawing:
// render/ShadesView reads `list`.
export class Shades {
  readonly list: Shade[] = [];
  private nextId = 1;
  private nearby: Circle[] = [];

  onKilled: (x: number, y: number) => void = () => {};
  onRisen: (s: Shade) => void = () => {};

  // Shades still to fight, counting ones whose spawn mark is showing.
  get remaining(): number {
    return this.list.length;
  }

  spawn(x: number, y: number): void {
    this.list.push({
      id: this.nextId++, x, y, radius: shade.radius, alive: false, hp: shade.hp, vx: 0, vy: 0, kx: 0, ky: 0,
      rising: Math.max(shade.spawnTell, 1e-4), flash: 0, phase: Math.random() * Math.PI * 2, avoid: null, side: 1,
    });
  }

  clear(): void {
    this.list.length = 0;
  }

  damage(target: Target, amount: number, fromX: number, fromY: number): void {
    const s = target as Shade;
    if (!s.alive) return;
    s.hp -= amount;
    s.flash = feel.hitFlashTime;
    const dx = s.x - fromX;
    const dy = s.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    s.kx += (dx / d) * shade.knockback;
    s.ky += (dy / d) * shade.knockback;
    if (s.hp <= 0) this.kill(s);
  }

  kill(s: Shade): void {
    s.alive = false;
    this.list.splice(this.list.indexOf(s), 1);
    this.onKilled(s.x, s.y);
  }

  // True if a walking Shade overlaps the circle (the player's forgiving hit circle).
  touching(x: number, y: number, r: number): boolean {
    for (const s of this.list) {
      if (!s.alive) continue;
      const min = r + s.radius * shade.contactScale;
      if ((s.x - x) ** 2 + (s.y - y) ** 2 < min * min) return true;
    }
    return false;
  }

  update(dt: number, world: CollisionWorld, nav: Navigator): void {
    const turn = 1 - Math.exp(-shade.turnRate * dt);
    const kdecay = Math.exp(-shade.knockbackDecay * dt);
    const sepK = shade.separation * Math.min(1, shade.separationRate * dt);

    for (const s of this.list) {
      s.radius = shade.radius;
      s.flash -= dt;
      s.phase += dt * shade.bobSpeed;
      if (s.rising > 0) {
        s.rising -= dt;
        if (s.rising <= 0) {
          s.alive = true;
          this.onRisen(s);
        }
        continue;
      }

      const dist = nav.direction(s.x, s.y, s.radius, way);
      const [dx, dy] = this.steer(s, way.x, way.y, dist, world);

      let speed = shade.speed;
      // The iso projection squashes vertical screen travel, so even out on-screen speed the way the player's is.
      if (shade.uniformScreenSpeed) {
        toScreen(dx, dy, off);
        speed *= (render.isoScale * Math.SQRT2) / (Math.hypot(off.x, off.y) || 1);
      }
      s.vx += (dx * speed - s.vx) * turn;
      s.vy += (dy * speed - s.vy) * turn;
      s.kx *= kdecay;
      s.ky *= kdecay;

      // Soft push away from overlapping neighbours.
      let sx = 0;
      let sy = 0;
      for (const n of this.list) {
        if (n === s || n.rising > 0) continue;
        const nx = s.x - n.x;
        const ny = s.y - n.y;
        const min = s.radius + n.radius;
        const d2 = nx * nx + ny * ny;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-3) {
          sx += (Math.random() - 0.5) * min;
          sy += (Math.random() - 0.5) * min;
          continue;
        }
        sx += (nx * (min - d)) / d;
        sy += (ny * (min - d)) / d;
      }

      s.x += (s.vx + s.kx) * dt + sx * sepK;
      s.y += (s.vy + s.ky) * dt + sy * sepK;
      world.resolve(s);
    }
  }

  // Walks the shortest way round a pillar in its path: it heads for the pillar's edge along a tangent, then follows
  // the curve until the way is clear. It picks the side nearer its heading and keeps that side while the pillar is
  // in the way, switching only if the other side becomes clearly shorter, so it never dithers head-on.
  private steer(s: Shade, dx: number, dy: number, dist: number, world: CollisionWorld): [number, number] {
    const look = shade.avoidLookahead;
    let blocked: Circle | null = null;
    let nearest = Infinity;
    for (const o of world.near(s.x, s.y, look + s.radius, this.nearby)) {
      const ox = o.x - s.x;
      const oy = o.y - s.y;
      const along = ox * dx + oy * dy;
      const R = o.radius + s.radius + CLEARANCE;
      // Behind it, beside its path, or past the point it is walking to: not in the way.
      if (along <= 0 || Math.abs(ox * dy - oy * dx) >= R || along - o.radius > dist || along >= nearest) continue;
      nearest = along;
      blocked = o;
    }
    if (!blocked) {
      s.avoid = null;
      return [dx, dy];
    }
    const o = blocked;
    const ox = o.x - s.x;
    const oy = o.y - s.y;
    const d = Math.hypot(ox, oy) || 1;
    const R = o.radius + s.radius + CLEARANCE;
    // The two tangent directions from the Shade to the pillar's edge (straight along the edge when touching it).
    const a = Math.asin(Math.min(1, R / d));
    const tangent = (side: number): [number, number] => {
      const c = Math.cos(a * side);
      const sn = Math.sin(a * side);
      return [(ox * c - oy * sn) / d, (ox * sn + oy * c) / d];
    };
    const left = tangent(1);
    const right = tangent(-1);
    const gainLeft = left[0] * dx + left[1] * dy - (right[0] * dx + right[1] * dy);
    if (s.avoid !== o) s.side = Math.abs(gainLeft) < 1e-3 ? (s.id % 2 ? 1 : -1) : gainLeft > 0 ? 1 : -1;
    else if (gainLeft * s.side < -shade.avoidSwitch) s.side = -s.side;
    s.avoid = o;
    return s.side > 0 ? left : right;
  }
}
