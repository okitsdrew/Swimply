// Circle maths shared by the sim.

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

// Distance along the ray (within [0, len]) where it first touches the circle, or -1.
export function segmentCircle(x: number, y: number, dx: number, dy: number, len: number, cx: number, cy: number, r: number): number {
  const ox = x - cx;
  const oy = y - cy;
  const c = ox * ox + oy * oy - r * r;
  if (c <= 0) return 0;
  const b = ox * dx + oy * dy;
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t <= len ? t : -1;
}

// Pushes a circle out of every obstacle it overlaps.
export function pushOut(c: Circle, obstacles: readonly Circle[]): void {
  for (const o of obstacles) {
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    const min = o.radius + c.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-3) {
      c.x += min;
      continue;
    }
    c.x = o.x + (dx / d) * min;
    c.y = o.y + (dy / d) * min;
  }
}
