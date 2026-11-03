import { Box, Circle, pushOut, pushOutOfBoxes, segmentBox, segmentCircle } from '../core/geometry';
import { AreaMap, Placed, tileAt } from '../data/maps';

// What every moving thing asks about solid ground. Systems hold a CollisionWorld, never the list of shapes
// behind it, so how the world is built from map data can change without touching them.
export interface CollisionWorld {
  // The map's size in world units; everything inside is between 0 and these.
  readonly width: number;
  readonly height: number;
  // Pushes a circle out of everything solid. With overFloors, blocking floors (water) are ignored, as for a teleport
  // in flight.
  resolve(c: Circle, overFloors?: boolean): void;
  // How much of a move (0 to 1) a circle of radius r can make from (x, y) before it touches something solid.
  sweep(x: number, y: number, dx: number, dy: number, r: number, overFloors?: boolean): number;
  // True if a circle of radius r at (x, y) overlaps a blocking floor, so nothing can stand there.
  onBlockingFloor(x: number, y: number, r: number): boolean;
  // True if the floor under (x, y) kills the player who stands on it.
  onHurtingFloor(x: number, y: number): boolean;
  // Distance along a ray (unit direction) to the first solid thing within len, or -1.
  raycast(x: number, y: number, dirX: number, dirY: number, len: number): number;
  // The placed thing whose circle the last raycast stopped at, or null (the map's edge, or nothing).
  readonly lastHit: Placed | null;
  // Solid circles near a point, for steering round them.
  near(x: number, y: number, range: number, out: Circle[]): Circle[];
}

// The solid parts of a map: circles from each placed asset's collision, boxes over blocking floor tiles, and a
// thick frame round the outside so nothing leaves the map. Arrows stop at circles and the frame but fly over
// blocking floors such as water.
export class MapWorld implements CollisionWorld {
  readonly circles: Circle[] = [];
  // The placed thing each circle belongs to, in the same order.
  private owners: Placed[] = [];
  // What arrows stop at: an asset's hit shapes, or its collision circles when it has none.
  readonly arrowCircles: Circle[] = [];
  private arrowCircleOwners: Placed[] = [];
  readonly arrowBoxes: HitBox[] = [];
  private arrowBoxOwners: Placed[] = [];
  lastHit: Placed | null = null;
  // Blocking floor, merged into one box per run of tiles along a row so there are few boxes to test.
  readonly floorBoxes: Box[] = [];
  readonly frame: Box[] = [];
  width = 0;
  height = 0;

  constructor(private map: AreaMap) {
    const t = map.tileSize;
    this.width = map.cols * t;
    this.height = map.rows * t;
    this.addCircles(map.objects);
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

  // Takes these things' circles away (they broke) and adds those things' (they appeared, as a flag changed). Returns
  // every circle that came or went, so pathfinding can look at those spots again.
  change(removed: readonly Placed[], added: readonly Placed[]): Circle[] {
    const changed: Circle[] = [];
    if (removed.length) {
      const gone = new Set(removed);
      for (let i = this.circles.length - 1; i >= 0; i--) {
        if (!gone.has(this.owners[i])) continue;
        changed.push(this.circles[i]);
        this.circles.splice(i, 1);
        this.owners.splice(i, 1);
      }
      const drop = <T>(items: T[], owners: Placed[]) => {
        for (let i = items.length - 1; i >= 0; i--) {
          if (!gone.has(owners[i])) continue;
          items.splice(i, 1);
          owners.splice(i, 1);
        }
      };
      drop(this.arrowCircles, this.arrowCircleOwners);
      drop(this.arrowBoxes, this.arrowBoxOwners);
    }
    const before = this.circles.length;
    this.addCircles(added);
    changed.push(...this.circles.slice(before));
    return changed;
  }

  private addCircles(objects: readonly Placed[]): void {
    for (const o of objects) {
      const k = o.size;
      for (const c of o.asset.collision) {
        const circle = { x: o.x + c.x * k, y: o.y + c.y * k, radius: c.radius * k };
        this.circles.push(circle);
        this.owners.push(o);
        if (o.asset.hit.length) continue;
        this.arrowCircles.push(circle);
        this.arrowCircleOwners.push(o);
      }
      for (const h of o.asset.hit) {
        if (h.box) {
          this.arrowBoxes.push({ x: o.x + h.x * k, y: o.y + h.y * k, a: (h.w * k) / 2, b: (h.h * k) / 2, turned: h.turned });
          this.arrowBoxOwners.push(o);
        } else {
          this.arrowCircles.push({ x: o.x + h.x * k, y: o.y + h.y * k, radius: h.radius * k });
          this.arrowCircleOwners.push(o);
        }
      }
    }
  }

  onHurtingFloor(x: number, y: number): boolean {
    const t = this.map.tileSize;
    return !!tileAt(this.map, Math.floor(x / t), Math.floor(y / t))?.hurts;
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
    this.lastHit = null;
    for (let i = 0; i < this.arrowCircles.length; i++) {
      const o = this.arrowCircles[i];
      const t = segmentCircle(x, y, dirX, dirY, len, o.x, o.y, o.radius);
      if (t >= 0 && (best < 0 || t < best)) {
        best = t;
        this.lastHit = this.arrowCircleOwners[i];
      }
    }
    for (let i = 0; i < this.arrowBoxes.length; i++) {
      const t = rayHitBox(x, y, dirX, dirY, len, this.arrowBoxes[i]);
      if (t >= 0 && (best < 0 || t < best)) {
        best = t;
        this.lastHit = this.arrowBoxOwners[i];
      }
    }
    for (const b of this.frame) {
      const t = segmentBox(x, y, dirX, dirY, len, b, 0);
      if (t >= 0 && (best < 0 || t < best)) {
        best = t;
        this.lastHit = null;
      }
    }
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

// A box arrows hit, in world units: its middle, half its w and h, and whether it is turned (see HitShape).
export interface HitBox {
  x: number;
  y: number;
  a: number;
  b: number;
  turned: boolean;
}

// A ray against a hit box: the ray is turned into the box's own frame, where the box is square to the axes. Turning
// keeps lengths, so the distance found there is the distance along the real ray.
function rayHitBox(x: number, y: number, dx: number, dy: number, len: number, h: HitBox): number {
  let px = x - h.x;
  let py = y - h.y;
  let ux = dx;
  let uy = dy;
  if (h.turned) {
    const r = Math.SQRT1_2;
    [px, py] = [(px - py) * r, (px + py) * r];
    [ux, uy] = [(ux - uy) * r, (ux + uy) * r];
  }
  return segmentBox(px, py, ux, uy, len, { x0: -h.a, y0: -h.b, x1: h.a, y1: h.b }, 0);
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
