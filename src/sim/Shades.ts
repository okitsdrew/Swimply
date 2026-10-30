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
  // The pillar it is walking round and which way, so it does not dither head-on.
  avoid: Circle | null;
  side: number;
}

const off = { x: 0, y: 0 };
const way = { x: 0, y: 0 };

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

      nav.direction(s.x, s.y, s.radius, way);
      const [dx, dy] = this.steer(s, way.x, way.y, world);

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

  // Bends the walking direction round a pillar in the way. The first time one blocks the path the Shade picks
  // the side nearer its heading and keeps it until clear, so nothing stalls head-on.
  private steer(s: Shade, dx: number, dy: number, world: CollisionWorld): [number, number] {
    const look = shade.avoidLookahead;
    let blocked: Circle | null = null;
    let worst = Infinity;
    for (const o of world.near(s.x, s.y, look + s.radius, this.nearby)) {
      const ox = s.x - o.x;
      const oy = s.y - o.y;
      const od = Math.hypot(ox, oy) || 1;
      const gap = od - o.radius - s.radius;
      if (gap > look || ox * dx + oy * dy > 0.3 * od || gap >= worst) continue;
      worst = gap;
      blocked = o;
    }
    if (!blocked) {
      s.avoid = null;
      return [dx, dy];
    }
    const o = blocked;
    const ox = s.x - o.x;
    const oy = s.y - o.y;
    const od = Math.hypot(ox, oy) || 1;
    const lean = (-oy / od) * dx + (ox / od) * dy;
    if (s.avoid !== o && Math.abs(lean) < 1e-3) s.side = s.id % 2 ? 1 : -1;
    if (Math.abs(lean) > 0.25) s.side = lean > 0 ? 1 : -1;
    s.avoid = o;
    const tx = (-oy / od) * s.side;
    const ty = (ox / od) * s.side;
    const a = Math.max(0.35, Math.min(1, 1.4 - worst / Math.max(look, 1e-3)));
    const rx = dx * (1 - a) + tx * a;
    const ry = dy * (1 - a) + ty * a;
    const l = Math.hypot(rx, ry) || 1;
    return [rx / l, ry / l];
  }
}
