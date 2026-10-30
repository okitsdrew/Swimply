import { Circle, pushOut, segmentCircle } from '../core/geometry';

// What every moving thing asks about solid ground. Systems hold a CollisionWorld, never the list of shapes
// behind it, so the hand-coded arena can be swapped for a world built from map data without touching them.
export interface CollisionWorld {
  // Pushes a circle out of everything solid.
  resolve(c: Circle): void;
  // How much of a move (0 to 1) a circle of radius r can make from (x, y) before it touches something solid.
  sweep(x: number, y: number, dx: number, dy: number, r: number): number;
  // Distance along a ray (unit direction) to the first solid thing within len, or -1.
  raycast(x: number, y: number, dirX: number, dirY: number, len: number): number;
  // Solid circles near a point, for steering round them.
  near(x: number, y: number, range: number, out: Circle[]): Circle[];
}

// A square room centred on the origin with round pillars in it.
export class ArenaWorld implements CollisionWorld {
  half = 0;
  readonly pillars: Circle[] = [];

  resolve(c: Circle): void {
    pushOut(c, this.pillars);
    const h = this.half - c.radius;
    c.x = Math.max(-h, Math.min(h, c.x));
    c.y = Math.max(-h, Math.min(h, c.y));
  }

  sweep(x: number, y: number, dx: number, dy: number, r: number): number {
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return 1;
    let best = 1;
    for (const o of this.pillars) {
      const t = segmentCircle(x, y, dx / len, dy / len, len, o.x, o.y, o.radius + r);
      // Already touching counts as free, so a circle pressed against a pillar can still move away from it.
      if (t > 0 && t / len < best) best = t / len;
    }
    const h = this.half - r;
    best = Math.min(best, wallFraction(x, dx, h), wallFraction(y, dy, h));
    return best;
  }

  raycast(x: number, y: number, dirX: number, dirY: number, len: number): number {
    let best = -1;
    for (const o of this.pillars) {
      const t = segmentCircle(x, y, dirX, dirY, len, o.x, o.y, o.radius);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    const f = Math.min(wallFraction(x, dirX * len, this.half), wallFraction(y, dirY * len, this.half));
    if (f < 1 && (best < 0 || f * len < best)) best = f * len;
    return best;
  }

  near(x: number, y: number, range: number, out: Circle[]): Circle[] {
    out.length = 0;
    for (const o of this.pillars) {
      const r = range + o.radius;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < r * r) out.push(o);
    }
    return out;
  }
}

// How much of a 1D move from p by d stays inside [-h, h].
function wallFraction(p: number, d: number, h: number): number {
  if (d > 0 && p + d > h) return Math.max(0, (h - p) / d);
  if (d < 0 && p + d < -h) return Math.max(0, (-h - p) / d);
  return 1;
}
