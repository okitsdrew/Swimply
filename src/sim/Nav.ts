import { Circle } from '../core/geometry';
import { Vec2 } from '../core/iso';
import { AreaMap } from '../data/maps';
import { CollisionWorld } from './World';

// How walkers find their way round blocking floor (water) and solid things (walls, pillars). The map is cut into a
// grid of cells half a tile across, and every cell that blocking floor or a solid circle touches is closed. That
// grid becomes a "flow field": every open cell knows how far it is from the player's cell by the shortest open
// route, and a walker that cannot walk straight at the player heads for whichever neighbouring cell is closer.
export interface Navigator {
  // Call once per step with the target's position (the player).
  setGoal(x: number, y: number): void;
  // The unit direction a walker of radius r at (x, y) should head in, put in out. Straight at the goal when nothing
  // blocks it. Returns the distance to the point it is heading for (the goal, or the next tile on its route).
  direction(x: number, y: number, r: number, out: Vec2): number;
}

const SQRT2 = Math.SQRT2;
// Neighbour offsets: four sides first, then four corners.
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];

// Cells per tile along each side. Walls are thin (a row of small circles), so cells smaller than a tile keep the
// gaps beside them open.
const CELLS_PER_TILE = 2;

export class FlowField implements Navigator {
  // Cell size in world units.
  private readonly t: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly walkable: boolean[];
  private readonly hasBlocks: boolean;
  private readonly dist: Float32Array;
  private goalTile = -1;
  private gx = 0;
  private gy = 0;
  private nearby: Circle[] = [];

  constructor(map: AreaMap, private world: CollisionWorld) {
    this.t = map.tileSize / CELLS_PER_TILE;
    this.cols = map.cols * CELLS_PER_TILE;
    this.rows = map.rows * CELLS_PER_TILE;
    this.walkable = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const floor = map.tiles[Math.floor(r / CELLS_PER_TILE) * map.cols + Math.floor(c / CELLS_PER_TILE)];
        this.walkable.push(!floor?.blocks && !this.touchesSolid(c, r));
      }
    }
    this.hasBlocks = this.walkable.includes(false);
    this.dist = new Float32Array(this.cols * this.rows);
  }

  setGoal(x: number, y: number): void {
    this.gx = x;
    this.gy = y;
    const tile = this.tileOf(x, y);
    // Only rebuilt when the player crosses into another tile.
    if (tile === this.goalTile || !this.hasBlocks) return;
    this.goalTile = tile;
    this.build(tile);
  }

  direction(x: number, y: number, r: number, out: Vec2): number {
    let tx = this.gx;
    let ty = this.gy;
    if (this.hasBlocks && !this.clearLine(x, y, tx, ty, r)) {
      const next = this.nextTile(this.tileOf(x, y));
      if (next >= 0) {
        tx = ((next % this.cols) + 0.5) * this.t;
        ty = (Math.floor(next / this.cols) + 0.5) * this.t;
      }
    }
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    out.x = dx / d;
    out.y = dy / d;
    return d;
  }

  private tileOf(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.t)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.t)));
    return r * this.cols + c;
  }

  // True if a circle of radius r can walk straight from a to b without touching anything solid.
  private clearLine(ax: number, ay: number, bx: number, by: number, r: number): boolean {
    return this.world.sweep(ax, ay, bx - ax, by - ay, r) >= 1;
  }

  // True if any solid circle overlaps cell (c, r).
  private touchesSolid(c: number, r: number): boolean {
    const x0 = c * this.t;
    const y0 = r * this.t;
    const cx = x0 + this.t / 2;
    const cy = y0 + this.t / 2;
    for (const o of this.world.near(cx, cy, this.t, this.nearby)) {
      const nx = Math.max(x0, Math.min(x0 + this.t, o.x));
      const ny = Math.max(y0, Math.min(y0 + this.t, o.y));
      if ((o.x - nx) ** 2 + (o.y - ny) ** 2 < o.radius * o.radius) return true;
    }
    return false;
  }

  // Can a walker step from cell (c, r) by (dx, dy)? Corners only when both sides beside them are open, so nobody
  // cuts across the corner of a pond or the end of a wall.
  private canStep(c: number, r: number, dx: number, dy: number): boolean {
    const nc = c + dx;
    const nr = r + dy;
    if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows || !this.walkable[nr * this.cols + nc]) return false;
    if (dx && dy) return this.walkable[r * this.cols + nc] && this.walkable[nr * this.cols + c];
    return true;
  }

  // The neighbouring tile closest to the goal, or -1 if this tile has no route.
  private nextTile(tile: number): number {
    const c = tile % this.cols;
    const r = Math.floor(tile / this.cols);
    let best = -1;
    let bestDist = this.dist[tile];
    for (let i = 0; i < 8; i++) {
      if (!this.canStep(c, r, NX[i], NY[i])) continue;
      const n = (r + NY[i]) * this.cols + c + NX[i];
      if (this.dist[n] < bestDist) {
        bestDist = this.dist[n];
        best = n;
      }
    }
    return best;
  }

  // Shortest open distance (in cells) from every cell to the goal cell. Corners cost a bit more than sides.
  private build(goal: number): void {
    this.dist.fill(Infinity);
    this.dist[goal] = 0;
    const open: number[] = [goal];
    while (open.length) {
      // The open list stays small on maps this size, so picking its smallest by scanning is fine.
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (this.dist[open[i]] < this.dist[open[bi]]) bi = i;
      const tile = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      const c = tile % this.cols;
      const r = Math.floor(tile / this.cols);
      for (let i = 0; i < 8; i++) {
        if (!this.canStep(c, r, NX[i], NY[i])) continue;
        const n = (r + NY[i]) * this.cols + c + NX[i];
        const d = this.dist[tile] + (i < 4 ? 1 : SQRT2);
        if (d >= this.dist[n]) continue;
        if (this.dist[n] === Infinity) open.push(n);
        this.dist[n] = d;
      }
    }
  }
}
