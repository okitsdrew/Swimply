import { Box, Circle, pushOut, pushOutOfBoxes, segmentBox, segmentCircle } from '../core/geometry';
import { AreaMap, tileAt } from '../data/maps';

// What every moving thing asks about solid ground. Systems hold a CollisionWorld, never the list of shapes
// behind it, so how the world is built from map data can change without touching them.
export interface CollisionWorld {
  // Pushes a circle out of everything solid. With overFloors, blocking floors (water) are ignored, as for a teleport
  // in flight.
  resolve(c: Circle, overFloors?: boolean): void;
  // How much of a move (0 to 1) a circle of radius r can make from (x, y) before it touches something solid.
  sweep(x: number, y: number, dx: number, dy: number, r: number, overFloors?: boolean): number;
  // True if a circle of radius r at (x, y) overlaps a blocking floor, so nothing can stand there.
  onBlockingFloor(x: number, y: number, r: number): boolean;
  // Distance along a ray (unit direction) to the first solid thing within len, or -1.
  raycast(x: number, y: number, dirX: number, dirY: number, len: number): number;
  // Solid circles near a point, for steering round them.
  near(x: number, y: number, range: number, out: Circle[]): Circle[];
}

// The solid parts of a map: circles from each placed asset's collision, boxes over blocking floor tiles, and a
// thick frame round the outside so nothing leaves the map. Arrows stop at circles and the frame but fly over
// blocking floors such as water.
export class MapWorld implements CollisionWorld {
  readonly circles: Circle[] = [];
  // Blocking floor, merged into one box per run of tiles along a row so there are few boxes to test.
  readonly floorBoxes: Box[] = [];
  readonly frame: Box[] = [];
  width = 0;
  height = 0;

  constructor(map: AreaMap) {
    const t = map.tileSize;
    this.width = map.cols * t;
    this.height = map.rows * t;
    for (const o of map.objects) {
      for (const c of o.asset.collision) {
        this.circles.push({ x: o.x + c.x * o.size, y: o.y + c.y * o.size, radius: c.radius * o.size });
      }
    }
    for (let row = 0; row < map.rows; row++) {
      let start = -1;
      for (let col = 0; col <= map.cols; col++) {
        const blocked = col < map.cols && !!tileAt(map, col, row)?.blocks;
        if (blocked && start < 0) start = col;
        if (!blocked && start >= 0) {
          this.floorBoxes.push({ x0: start * t, y0: row * t, x1: col * t, y1: (row + 1) * t });
          start = -1;
        }
      }
    }
    const w = this.width;
    const h = this.height;
    const k = 1e4;
    this.frame.push({ x0: -k, y0: -k, x1: w + k, y1: 0 }, { x0: -k, y0: h, x1: w + k, y1: h + k });
    this.frame.push({ x0: -k, y0: 0, x1: 0, y1: h }, { x0: w, y0: 0, x1: w + k, y1: h });
  }

  resolve(c: Circle, overFloors = false): void {
    pushOut(c, this.circles);
    if (!overFloors) pushOutOfBoxes(c, this.floorBoxes);
    pushOutOfBoxes(c, this.frame);
  }

  sweep(x: number, y: number, dx: number, dy: number, r: number, overFloors = false): number {
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return 1;
    const ux = dx / len;
    const uy = dy / len;
    let best = 1;
    // A circle already touching something may move away from it, but not further into it.
    for (const o of this.circles) {
      const t = segmentCircle(x, y, ux, uy, len, o.x, o.y, o.radius + r);
      if (t > 0 && t / len < best) best = t / len;
      else if (t === 0 && (x - o.x) * ux + (y - o.y) * uy < 0) best = 0;
    }
    if (!overFloors) for (const b of this.floorBoxes) best = Math.min(best, boxFraction(x, y, ux, uy, len, b, r));
    for (const b of this.frame) best = Math.min(best, boxFraction(x, y, ux, uy, len, b, r));
    return best;
  }

  onBlockingFloor(x: number, y: number, r: number): boolean {
    for (const b of this.floorBoxes) {
      const nx = Math.max(b.x0, Math.min(b.x1, x));
      const ny = Math.max(b.y0, Math.min(b.y1, y));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
    }
    return false;
  }

  raycast(x: number, y: number, dirX: number, dirY: number, len: number): number {
    let best = -1;
    const take = (t: number) => {
      if (t >= 0 && (best < 0 || t < best)) best = t;
    };
    for (const o of this.circles) take(segmentCircle(x, y, dirX, dirY, len, o.x, o.y, o.radius));
    for (const b of this.frame) take(segmentBox(x, y, dirX, dirY, len, b, 0));
    return best;
  }

  near(x: number, y: number, range: number, out: Circle[]): Circle[] {
    out.length = 0;
    for (const o of this.circles) {
      const r = range + o.radius;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < r * r) out.push(o);
    }
    return out;
  }
}

// Like the circles, a circle already touching a box may move away from it, but not further into it.
function boxFraction(x: number, y: number, ux: number, uy: number, len: number, b: Box, r: number): number {
  const t = segmentBox(x, y, ux, uy, len, b, r);
  if (t > 0) return t / len;
  if (t < 0) return 1;
  const nx = Math.max(b.x0, Math.min(b.x1, x));
  const ny = Math.max(b.y0, Math.min(b.y1, y));
  return (x - nx) * ux + (y - ny) * uy < 0 ? 0 : 1;
}
