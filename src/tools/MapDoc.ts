import { assets } from '../data/assets';
import { floors } from '../data/floors';
import { AreaMap, Placed } from '../data/maps';
import { MapFile, mapText } from './files';

const MAX_UNDO = 200;
export const MAX_TILES = 200;

// One placed thing in the level editor's working copy. Assets and floors are kept as ids, so the working copy is
// plain data: it can be copied for undo, kept in the browser as a draft, and written to the file as is.
export interface EditObject {
  asset: string;
  x: number;
  y: number;
  size: number;
  // Save flags and a map link, as in data/maps.ts's Placed. Empty for none.
  if: string;
  unless: string;
  to: string;
}

export interface EditMap extends MapFile {
  rows: number;
  objects: EditObject[];
}

export type Side = 'top' | 'bottom' | 'left' | 'right';

export function fromAreaMap(m: AreaMap): EditMap {
  return {
    name: m.name,
    tileSize: m.tileSize,
    cols: m.cols,
    rows: m.rows,
    legend: { ...m.legend },
    darkness: m.darkness,
    tiles: m.tiles.map((t) => t.id),
    objects: m.objects.map((o) => ({ asset: o.asset.id, x: o.x, y: o.y, size: o.size, if: o.if, unless: o.unless, to: o.to })),
  };
}

// One map being edited: its working copy, the text of its file on disk, and its own undo history. Every change goes
// through change(), which records an undo step first.
export class MapDoc {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  // A drag (a brush stroke, moving a thing) is one undo step, recorded at its first change.
  private drag: 'off' | 'waiting' | 'recorded' = 'off';

  constructor(
    public id: string,
    public map: EditMap,
    // The file's text on disk as last read or written; null for a map not saved yet.
    public disk: string | null,
    public dirty = false,
  ) {}

  text(): string {
    return mapText(this.map);
  }

  // Draws as the game would: unknown ids (a floor or asset renamed since this page opened) fall back or drop out.
  toAreaMap(): AreaMap {
    const m = this.map;
    const fallback = floors.list()[0];
    const objects: Placed[] = [];
    for (const o of m.objects) {
      const asset = assets.get(o.asset);
      if (asset) objects.push({ asset, x: o.x, y: o.y, size: o.size, if: o.if ?? '', unless: o.unless ?? '', to: o.to ?? '' });
    }
    return { id: this.id, name: m.name, tileSize: m.tileSize, cols: m.cols, rows: m.rows, legend: m.legend, tiles: m.tiles.map((id) => floors.get(id) ?? fallback), objects, darkness: m.darkness ?? 0 };
  }

  // Records an undo step (unless a drag already has one), then lets fn change the map.
  change(fn: (m: EditMap) => void): void {
    if (this.drag !== 'recorded') this.record();
    if (this.drag === 'waiting') this.drag = 'recorded';
    fn(this.map);
    this.dirty = true;
  }

  beginDrag(): void {
    this.drag = 'waiting';
  }

  endDrag(): void {
    this.drag = 'off';
  }

  private record(): void {
    this.undoStack.push(JSON.stringify(this.map));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.redoStack.push(JSON.stringify(this.map));
    this.map = JSON.parse(s) as EditMap;
    this.dirty = true;
    return true;
  }

  redo(): boolean {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.undoStack.push(JSON.stringify(this.map));
    this.map = JSON.parse(s) as EditMap;
    this.dirty = true;
    return true;
  }

  tile(col: number, row: number): string | undefined {
    const m = this.map;
    if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return undefined;
    return m.tiles[row * m.cols + col];
  }

  // Paints a box of tiles (inclusive corners, in any order). Returns true if anything changed.
  paintBox(c0: number, r0: number, c1: number, r1: number, floor: string): boolean {
    const m = this.map;
    const [ca, cb] = [Math.max(0, Math.min(c0, c1)), Math.min(m.cols - 1, Math.max(c0, c1))];
    const [ra, rb] = [Math.max(0, Math.min(r0, r1)), Math.min(m.rows - 1, Math.max(r0, r1))];
    let any = false;
    for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) if (m.tiles[r * m.cols + c] !== floor) any = true;
    if (!any) return false;
    this.change((mm) => {
      for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) mm.tiles[r * mm.cols + c] = floor;
    });
    return true;
  }

  // Fills the patch of same-floor tiles touching (col, row), along rows and columns, not corners.
  fill(col: number, row: number, floor: string): boolean {
    const from = this.tile(col, row);
    if (from === undefined || from === floor) return false;
    this.change((m) => {
      const todo = [[col, row]];
      while (todo.length) {
        const [c, r] = todo.pop()!;
        if (c < 0 || r < 0 || c >= m.cols || r >= m.rows || m.tiles[r * m.cols + c] !== from) continue;
        m.tiles[r * m.cols + c] = floor;
        todo.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
      }
    });
    return true;
  }

  // How many placed things a grow or shrink would leave outside the map.
  lostBy(side: Side, delta: number): number {
    if (delta >= 0) return 0;
    const m = this.map;
    const t = m.tileSize;
    const w = m.cols * t;
    const h = m.rows * t;
    const cut = -delta * t;
    return m.objects.filter((o) => (side === 'left' ? o.x < cut : side === 'right' ? o.x >= w - cut : side === 'top' ? o.y < cut : o.y >= h - cut)).length;
  }

  // Adds (delta > 0) or removes rows or columns on one side. New tiles get `floor`. Things placed on the cut part
  // are removed; growing or shrinking the top or left moves everything else along, so it stays on the same tiles.
  resize(side: Side, delta: number, floor: string): boolean {
    const m = this.map;
    const horizontal = side === 'left' || side === 'right';
    const next = (horizontal ? m.cols : m.rows) + delta;
    if (next < 1 || next > MAX_TILES || delta === 0) return false;
    this.change((mm) => {
      const t = mm.tileSize;
      const cols = horizontal ? next : mm.cols;
      const rows = horizontal ? mm.rows : next;
      const dc = side === 'left' ? delta : 0;
      const dr = side === 'top' ? delta : 0;
      const tiles: string[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const oc = c - dc;
          const or = r - dr;
          tiles.push(oc >= 0 && or >= 0 && oc < mm.cols && or < mm.rows ? mm.tiles[or * mm.cols + oc] : floor);
        }
      }
      mm.objects = mm.objects
        .map((o) => ({ ...o, x: o.x + dc * t, y: o.y + dr * t }))
        .filter((o) => o.x >= 0 && o.y >= 0 && o.x < cols * t && o.y < rows * t);
      mm.cols = cols;
      mm.rows = rows;
      mm.tiles = tiles;
    });
    return true;
  }
}
