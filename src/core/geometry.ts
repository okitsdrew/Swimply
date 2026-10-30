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

// An axis-aligned rectangle in world space: a blocked run of floor tiles, or the solid frame round a map.
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Pushes a circle out of every box it overlaps, along the shortest way out.
export function pushOutOfBoxes(c: Circle, boxes: readonly Box[]): void {
  for (const b of boxes) {
    const nx = Math.max(b.x0, Math.min(b.x1, c.x));
    const ny = Math.max(b.y0, Math.min(b.y1, c.y));
    const dx = c.x - nx;
    const dy = c.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= c.radius * c.radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      c.x = nx + (dx / d) * c.radius;
      c.y = ny + (dy / d) * c.radius;
      continue;
    }
    // Centre inside the box: leave by the nearest side.
    const left = c.x - b.x0;
    const right = b.x1 - c.x;
    const up = c.y - b.y0;
    const down = b.y1 - c.y;
    const m = Math.min(left, right, up, down);
    if (m === left) c.x = b.x0 - c.radius;
    else if (m === right) c.x = b.x1 + c.radius;
    else if (m === up) c.y = b.y0 - c.radius;
    else c.y = b.y1 + c.radius;
  }
}

// Distance along the ray (within [0, len]) where a circle of radius r moving along it first touches the box,
// or -1. A ray that starts touching returns 0. With r = 0 it is a plain ray against the box.
export function segmentBox(x: number, y: number, dx: number, dy: number, len: number, b: Box, r: number): number {
  const nx = Math.max(b.x0, Math.min(b.x1, x));
  const ny = Math.max(b.y0, Math.min(b.y1, y));
  if ((x - nx) ** 2 + (y - ny) ** 2 <= r * r) return 0;
  let best = -1;
  const take = (t: number) => {
    if (t >= 0 && t <= len && (best < 0 || t < best)) best = t;
  };
  // The flat sides, pushed out by r.
  if (dx !== 0) {
    for (const sx of [b.x0 - r, b.x1 + r]) {
      const t = (sx - x) / dx;
      const py = y + dy * t;
      if (py >= b.y0 && py <= b.y1) take(t);
    }
  }
  if (dy !== 0) {
    for (const sy of [b.y0 - r, b.y1 + r]) {
      const t = (sy - y) / dy;
      const px = x + dx * t;
      if (px >= b.x0 && px <= b.x1) take(t);
    }
  }
  // The rounded corners.
  if (r > 0) {
    for (const cx of [b.x0, b.x1]) for (const cy of [b.y0, b.y1]) take(segmentCircle(x, y, dx, dy, len, cx, cy, r));
  }
  return best;
}
