import './tools.css';
import Phaser from 'phaser';
import { render } from '../config/render';
import { run } from '../config/run';
import { story } from '../config/story';
import { ellipseHalfSize, toScreen, Vec2 } from '../core/iso';
import { Asset, assets } from '../data/assets';
import { floors } from '../data/floors';
import { parseMap } from '../data/maps';
import { Problems, report } from '../data/registry';
import { deleteFile, hex, readFile, readMapFiles, renameInDataFile, saveFile } from './files';
import { MapCanvas } from './MapCanvas';
import { EditMap, EditObject, fromAreaMap, MapDoc, MAX_TILES, Side } from './MapDoc';
import { button, el, ID_PATTERN, numberInput, round, row, select, textInput, uniqueId } from './ui';

// The level editor page (level-editor.html, dev server only). Paints floors and places assets and markers in the
// area maps under src/data/maps, and writes them back in the hand-written style. It also renames or replaces a
// floor or asset across every map, which the asset maker leaves to it because it is the tool that owns the maps.

type Tool = 'select' | 'place' | 'paint' | 'fill' | 'rect';
const TOOL_KEYS: Record<string, Tool> = { v: 'select', a: 'place', b: 'paint', g: 'fill', r: 'rect' };
const TOOL_NAMES: Record<Tool, string> = { select: 'Select (V)', place: 'Place (A)', paint: 'Brush (B)', fill: 'Fill (G)', rect: 'Box (R)' };
const TOOL_HINTS: Record<Tool, string> = {
  select: 'Click a thing to select it, or drag a box round several. Shift adds to the selection. Drag to move, Alt+drag to move a copy. Delete removes, [ and ] resize, arrows nudge, Ctrl+C / Ctrl+V copy and paste at the cursor, Ctrl+D copies in place, Ctrl+A selects all.',
  place: 'Click to place the chosen asset. Right-click a thing to place more of that. Hold Shift to place off the grid.',
  paint: 'Drag to paint the chosen floor. [ and ] change the brush size. Right-click picks up the floor under the cursor.',
  fill: 'Click to fill the patch of the same floor under the cursor. Right-click picks up a floor.',
  rect: 'Drag a box to fill it with the chosen floor. Right-click picks up a floor.',
};
const FLOOR_TOOLS: Tool[] = ['paint', 'fill', 'rect'];
// Grid steps for placing and moving things, in world units (a tile is 64).
const SNAPS = ['off', '8', '16', '32', '64'];
// Map file names: the dev server only writes lowercase ids.
const MAP_ID = /^[a-z0-9_-]+$/;
const DRAFT_KEY = 'swimply.levelEditor.draft';
const LAST_KEY = 'swimply.levelEditor.last';
const path = (id: string) => `src/data/maps/${id}.json`;

interface Draft {
  [id: string]: { base: string | null; map: EditMap };
}

type Drag =
  | { kind: 'paint'; col: number; row: number }
  | { kind: 'rect'; c0: number; r0: number; c1: number; r1: number }
  // Moves every selected thing by the same amount. `from` is where each one started; `anchor` is the one under the
  // cursor, which snaps to the grid, and the others keep their places relative to it.
  | { kind: 'move'; from: Vec2[]; anchor: number; dx: number; dy: number }
  // A box dragged on the screen (screen units), selecting every thing whose ground point is inside it.
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number; add: boolean };

class LevelEditor {
  private docs: MapDoc[] = [];
  private doc: MapDoc | null = null;
  private tool: Tool = 'select';
  private floor = floors.list()[0]?.id ?? '';
  private asset = assets.list().find((a) => !a.marker)?.id ?? assets.list()[0]?.id ?? '';
  private brush = 1;
  private snap = 32;
  private grid = true;
  private collision = true;
  // Indexes into the map's objects, in the order they were picked.
  private selection: number[] = [];
  // Things copied with Ctrl+C, relative to the first one, so they can be pasted into any map.
  private clipboard: EditObject[] = [];
  private drag: Drag | null = null;
  private shift = false;
  private note = '';
  private draftTimer = 0;

  private canvas: MapCanvas;
  private list = el('aside', { class: 'list' });
  private props = el('aside', { class: 'props' });
  private toolbar = el('div', { class: 'toolbar' });
  private hint = el('div', { class: 'hint' });
  private status = el('span', { class: 'status' });
  private banner = el('div', { class: 'banner', style: 'display:none' });
  private saveButton = button('Save (Ctrl+S)', () => void this.save());
  private discardButton = button('Discard unsaved', () => this.discard());

  constructor() {
    const host = el('div', { class: 'map-host' });
    document.body.append(
      el('header', {},
        el('h1', { text: 'Swimply level editor' }),
        this.saveButton, this.discardButton,
        button('Play here (P)', () => void this.play(this.canvas.pointer ?? this.selectedPos() ?? this.canvas.viewCenter()), { title: 'Saves, then opens the game on this map with no Shades, at the cursor (or the selected thing)' }),
        button('Play from start', () => void this.play(null), { title: 'Saves, then opens the game on this map for a normal run' }),
        this.status,
        el('a', { href: 'asset-maker.html', target: 'swimply-asset-maker', text: 'asset maker' }),
        el('a', { href: '/', target: 'swimply-game', text: 'open the game', style: 'margin-left:0' }),
      ),
      this.banner,
      el('div', { class: 'layout editor' }, this.list, el('main', { class: 'center' }, this.toolbar, host, this.hint), this.props),
    );
    this.canvas = new MapCanvas(host, {
      down: (p, e) => this.down(p, e.alt),
      move: (p) => this.move(p),
      up: () => this.up(),
      rightClick: (p) => this.rightClick(p),
      overlay: (g) => this.drawOverlay(g),
    });
    this.bindKeys();
    import.meta.hot?.on('swimply:data', (d: { file: string }) => {
      const m = /(assets|floors|sprites)\.json$/.exec(d.file);
      if (m && !this.renaming) this.showBanner(`${m[1]}.json was saved (by the asset maker). Reload to see the change here; your unsaved maps are kept.`);
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.docs.some((d) => d.dirty) && !this.reloading) e.preventDefault();
    });
  }

  private renaming = false;
  private reloading = false;

  async load(): Promise<void> {
    this.status.textContent = 'Loading maps…';
    let files: Record<string, string>;
    try {
      files = await readMapFiles();
    } catch (e) {
      this.status.textContent = `Could not read the maps: ${e instanceof Error ? e.message : e}. The level editor only works under npm run dev.`;
      this.status.className = 'status error';
      return;
    }
    const problems: Problems = [];
    for (const [id, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        problems.push(`maps/${id}.json is not valid JSON, not loaded`);
        continue;
      }
      const map = parseMap(id, data, problems);
      if (map) this.docs.push(new MapDoc(id, fromAreaMap(map), text));
    }
    report('level editor', problems);
    if (problems.length) this.note = `${problems.length} problem(s) reading the maps; see the browser console. Saving a map fixes what was reported.`;
    this.restoreDraft();
    await this.canvas.ready;
    const want = new URLSearchParams(location.search).get('map') ?? this.lastMap();
    const first = this.docs.find((d) => d.id === want) ?? this.docs[0];
    if (first) this.open(first);
    else this.refresh();
  }

  private lastMap(): string | null {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  }

  // ---- drafts: unsaved maps are kept in the browser, so a page reload loses nothing ----

  private restoreDraft(): void {
    let draft: Draft = {};
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Draft;
    } catch {
      return;
    }
    const kept: string[] = [];
    const stale: string[] = [];
    for (const [id, { base, map }] of Object.entries(draft)) {
      const doc = this.docs.find((d) => d.id === id);
      if (doc && doc.disk === base) {
        doc.map = map;
        doc.dirty = true;
        kept.push(id);
      } else if (!doc && base === null) {
        this.docs.push(new MapDoc(id, map, null, true));
        kept.push(id);
      } else stale.push(id);
    }
    if (kept.length) this.note += ` Brought back your unsaved ${kept.join(', ')}.`;
    if (stale.length) this.note += ` Unsaved ${stale.join(', ')} from before were dropped, because the file changed since.`;
    this.writeDraft();
  }

  private writeDraft(): void {
    try {
      const draft: Draft = {};
      for (const d of this.docs) if (d.dirty) draft[d.id] = { base: d.disk, map: d.map };
      if (Object.keys(draft).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Storage full or blocked: work is only lost if the page reloads before a save.
    }
  }

  // Every edit ends here: redraw the map, mark it unsaved, keep a draft.
  private changed(rebuildProps = true): void {
    if (this.doc) {
      this.canvas.setMap(this.doc.toAreaMap());
      // Undoing back to the saved version counts as saved again.
      this.doc.dirty = this.doc.disk === null || this.doc.text() !== this.doc.disk;
    }
    this.selection = this.selection.filter((i) => this.doc && i < this.doc.map.objects.length);
    clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => this.writeDraft(), 300);
    this.updateStatus();
    if (rebuildProps) this.buildProps();
    this.buildList();
  }

  private updateStatus(): void {
    const dirty = this.docs.filter((d) => d.dirty).map((d) => d.id);
    this.status.textContent = (dirty.length ? `Not saved yet: ${dirty.join(', ')}.` : 'Everything is saved.') + (this.note ? ` ${this.note}` : '');
    this.status.className = dirty.length ? 'status warn' : 'status';
    this.saveButton.disabled = this.discardButton.disabled = !dirty.length;
  }

  private showBanner(text: string): void {
    this.banner.replaceChildren(el('span', { text }), button('Reload now', () => this.reload()));
    this.banner.style.display = '';
  }

  private reload(): void {
    clearTimeout(this.draftTimer);
    this.writeDraft();
    this.reloading = true;
    location.reload();
  }

  async save(): Promise<boolean> {
    const dirty = this.docs.filter((d) => d.dirty);
    if (!dirty.length) return true;
    this.note = '';
    this.status.textContent = 'Saving…';
    try {
      for (const d of dirty) {
        const text = d.text();
        await saveFile(path(d.id), text, d.disk);
        d.disk = text;
        d.dirty = false;
      }
    } catch (e) {
      this.updateStatus();
      this.status.textContent = `Could not save: ${e instanceof Error ? e.message : e}`;
      this.status.className = 'status error';
      return false;
    }
    clearTimeout(this.draftTimer);
    this.writeDraft();
    this.updateStatus();
    this.buildList();
    return true;
  }

  private discard(): void {
    const dirty = this.docs.filter((d) => d.dirty).map((d) => d.id);
    if (!confirm(`Throw away every unsaved change (${dirty.join(', ')}) and go back to the saved files?`)) return;
    for (const d of this.docs) d.dirty = false;
    this.writeDraft();
    this.reloading = true;
    location.reload();
  }

  // Saves, then opens the game on this map (in the game tab, if one is open). With a spot, it starts there with
  // no Shades, for walking round the map; without, it is a normal run from the player start.
  private async play(at: Vec2 | null): Promise<void> {
    const d = this.doc;
    if (!d || !(await this.save())) return;
    let url = `index.html?map=${d.id}`;
    if (at) url += `&at=${Math.round(at.x)},${Math.round(at.y)}&calm`;
    window.open(url, 'swimply-game');
  }

  // ---- opening and managing maps ----

  private open(d: MapDoc): void {
    this.doc = d;
    this.selection = [];
    this.drag = null;
    try {
      localStorage.setItem(LAST_KEY, d.id);
    } catch {
      // Only a convenience.
    }
    history.replaceState(null, '', `?map=${d.id}`);
    this.canvas.setMap(d.toAreaMap());
    this.frame();
    this.refresh();
  }

  // Zooms so the whole map fits the view.
  private frame(): void {
    const d = this.doc;
    if (!d) return;
    const m = d.map;
    const span = (m.cols + m.rows) * m.tileSize * render.isoScale;
    const zoom = Math.min(this.canvas.game.scale.width / span, this.canvas.game.scale.height / (span / 2)) * 0.9;
    this.canvas.look((m.cols * m.tileSize) / 2, (m.rows * m.tileSize) / 2, Phaser.Math.Clamp(zoom, 0.15, 3));
  }

  private refresh(): void {
    this.buildList();
    this.buildToolbar();
    this.buildProps();
    this.updateStatus();
  }

  private taken = (id: string): boolean => this.docs.some((d) => d.id === id);

  private askMapId(question: string, start: string): string | null {
    const id = prompt(question, start)?.trim();
    if (!id) return null;
    if (!MAP_ID.test(id)) {
      alert('A map id is its file name: only lowercase letters, digits, "-" and "_".');
      return null;
    }
    if (this.taken(id)) {
      alert(`There is already a map called "${id}".`);
      return null;
    }
    return id;
  }

  private create(): void {
    const id = this.askMapId('Id for the new map (its file name):', uniqueId('map', this.taken));
    if (!id) return;
    const n = 16;
    const t = 64;
    const start = assets.list().find((a) => a.marker === 'playerStart');
    const map: EditMap = {
      name: id, tileSize: t, cols: n, rows: n, legend: {}, darkness: 0,
      tiles: Array.from({ length: n * n }, () => this.floor),
      objects: start ? [{ asset: start.id, x: (n * t) / 2, y: (n * t) / 2, size: 1, if: '', unless: '', to: '' }] : [],
    };
    const d = new MapDoc(id, map, null, true);
    this.docs.push(d);
    this.writeDraft();
    this.open(d);
  }

  private duplicate(): void {
    const src = this.doc;
    if (!src) return;
    const id = this.askMapId('Id for the copy (its file name):', uniqueId(`${src.id}-copy`, this.taken));
    if (!id) return;
    const map = JSON.parse(JSON.stringify(src.map)) as EditMap;
    map.name = `${src.map.name} copy`;
    const d = new MapDoc(id, map, null, true);
    this.docs.splice(this.docs.indexOf(src) + 1, 0, d);
    this.writeDraft();
    this.open(d);
  }

  // Renames the file. Only the saved version moves: unsaved changes stay unsaved under the new name.
  private async rename(): Promise<void> {
    const d = this.doc;
    if (!d) return;
    const id = this.askMapId(`New id for "${d.id}" (its file name). The game finds maps by this id.`, d.id);
    if (!id) return;
    try {
      if (d.disk !== null) {
        await saveFile(path(id), d.disk, null);
        await deleteFile(path(d.id), d.disk);
      }
    } catch (e) {
      alert(`Could not rename: ${e instanceof Error ? e.message : e}`);
      return;
    }
    d.id = id;
    this.writeDraft();
    this.open(d);
  }

  private async remove(): Promise<void> {
    const d = this.doc;
    if (!d) return;
    const saved = d.disk !== null;
    if (!confirm(saved ? `Delete the map "${d.id}"? Its file is deleted now (git still has the last committed version).` : `Throw away the unsaved new map "${d.id}"?`)) return;
    try {
      if (saved) await deleteFile(path(d.id), d.disk!);
    } catch (e) {
      alert(`Could not delete: ${e instanceof Error ? e.message : e}`);
      return;
    }
    this.docs.splice(this.docs.indexOf(d), 1);
    d.dirty = false;
    this.writeDraft();
    this.doc = null;
    if (this.docs[0]) this.open(this.docs[0]);
    else this.refresh();
  }

  // ---- the map view: mouse ----

  private tileOf(p: Vec2): [number, number] {
    const t = this.doc?.map.tileSize ?? 64;
    return [Math.floor(p.x / t), Math.floor(p.y / t)];
  }

  // Snaps to the grid (unless Shift is held) and keeps the point inside the map.
  private place(p: Vec2): Vec2 {
    const m = this.doc!.map;
    const s = this.shift || !this.snap ? 1 : this.snap;
    const x = Math.round(p.x / s) * s;
    const y = Math.round(p.y / s) * s;
    return { x: Phaser.Math.Clamp(x, 0, m.cols * m.tileSize), y: Phaser.Math.Clamp(y, 0, m.rows * m.tileSize) };
  }

  // The one selected thing, or null when none or several are.
  private get single(): number | null {
    return this.selection.length === 1 ? this.selection[0] : null;
  }

  private selectedPos(): Vec2 | null {
    const o = this.selection.length ? this.doc?.map.objects[this.selection[0]] : undefined;
    return o ? { x: o.x, y: o.y } : null;
  }

  private down(p: Vec2, alt: boolean): void {
    const d = this.doc;
    if (!d) return;
    if (alt && FLOOR_TOOLS.includes(this.tool)) return this.pickFloor(p);
    const [col, row] = this.tileOf(p);
    switch (this.tool) {
      case 'select': {
        let i = this.pick(p);
        if (i === null) {
          // Empty ground: start a selection box.
          const s = toScreen(p.x, p.y);
          if (!this.shift) this.selection = [];
          this.drag = { kind: 'box', x0: s.x, y0: s.y, x1: s.x, y1: s.y, add: this.shift };
        } else if (this.shift) {
          // Shift-click adds a thing to the selection, or takes it out.
          this.selection = this.selection.includes(i) ? this.selection.filter((j) => j !== i) : [...this.selection, i];
        } else {
          if (!this.selection.includes(i)) this.selection = [i];
          d.beginDrag();
          // Alt+drag leaves the originals where they are and moves copies of them.
          if (alt) {
            const copies = this.selection.map((j) => ({ ...d.map.objects[j] }));
            const first = d.map.objects.length;
            const anchorAt = this.selection.indexOf(i);
            d.change((m) => m.objects.push(...copies));
            this.selection = copies.map((_, k) => first + k);
            this.changed(false);
            i = this.selection[anchorAt];
          }
          const o = d.map.objects[i];
          this.drag = { kind: 'move', from: this.selection.map((j) => ({ x: d.map.objects[j].x, y: d.map.objects[j].y })), anchor: this.selection.indexOf(i), dx: o.x - p.x, dy: o.y - p.y };
        }
        this.buildProps();
        break;
      }
      case 'place': {
        const a = assets.get(this.asset);
        if (!a) return;
        const at = this.place(p);
        d.change((m) => m.objects.push({ asset: a.id, x: at.x, y: at.y, size: 1, if: '', unless: '', to: '' }));
        this.selection = [d.map.objects.length - 1];
        this.changed();
        break;
      }
      case 'paint':
        d.beginDrag();
        this.drag = { kind: 'paint', col, row };
        this.paintAt(col, row);
        break;
      case 'fill':
        if (d.fill(col, row, this.floor)) this.changed();
        break;
      case 'rect':
        this.drag = { kind: 'rect', c0: col, r0: row, c1: col, r1: row };
        break;
    }
  }

  private move(p: Vec2): void {
    const d = this.doc;
    if (!d) return;
    const drag = this.drag;
    if (this.tool === 'place') {
      const at = this.place(p);
      this.canvas.setGhost(assets.get(this.asset) ?? null, at.x, at.y);
    }
    if (!drag) return this.updateHint(p);
    const [col, row] = this.tileOf(p);
    if (drag.kind === 'move') {
      const sel = this.selection;
      const o = d.map.objects[sel[drag.anchor]];
      const at = this.place({ x: p.x + drag.dx, y: p.y + drag.dy });
      if (!o || (o.x === at.x && o.y === at.y)) return;
      const mx = at.x - drag.from[drag.anchor].x;
      const my = at.y - drag.from[drag.anchor].y;
      d.change((m) => sel.forEach((j, k) => Object.assign(m.objects[j], { x: drag.from[k].x + mx, y: drag.from[k].y + my })));
      this.changed(false);
      this.buildProps();
    } else if (drag.kind === 'box') {
      const s = toScreen(p.x, p.y);
      drag.x1 = s.x;
      drag.y1 = s.y;
    } else if (drag.kind === 'paint') {
      // Paints every tile between the last one and this one, so a fast stroke leaves no gaps.
      const steps = Math.max(Math.abs(col - drag.col), Math.abs(row - drag.row));
      for (let i = 1; i <= steps; i++) {
        this.paintAt(Math.round(drag.col + ((col - drag.col) * i) / steps), Math.round(drag.row + ((row - drag.row) * i) / steps));
      }
      drag.col = col;
      drag.row = row;
    } else {
      drag.c1 = col;
      drag.r1 = row;
    }
    this.updateHint(p);
  }

  private up(): void {
    const d = this.doc;
    const drag = this.drag;
    this.drag = null;
    if (!d || !drag) return;
    if (drag.kind === 'rect') {
      if (d.paintBox(drag.c0, drag.r0, drag.c1, drag.r1, this.floor)) this.changed();
    } else if (drag.kind === 'box') {
      const [x0, x1] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
      const [y0, y1] = [Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)];
      const inside: number[] = [];
      d.map.objects.forEach((o, i) => {
        const s = toScreen(o.x, o.y);
        if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) inside.push(i);
      });
      this.selection = drag.add ? [...new Set([...this.selection, ...inside])] : inside;
      this.buildProps();
    }
    d.endDrag();
  }

  private rightClick(p: Vec2): void {
    if (FLOOR_TOOLS.includes(this.tool)) return this.pickFloor(p);
    const i = this.pick(p);
    const o = i !== null ? this.doc?.map.objects[i] : undefined;
    if (o && this.tool === 'place') {
      this.asset = o.asset;
      this.buildProps();
    }
  }

  private paintAt(col: number, row: number): void {
    const lo = -Math.floor((this.brush - 1) / 2);
    const hi = lo + this.brush - 1;
    if (this.doc?.paintBox(col + lo, row + lo, col + hi, row + hi, this.floor)) this.changed(false);
  }

  private pickFloor(p: Vec2): void {
    const [col, row] = this.tileOf(p);
    const f = this.doc?.tile(col, row);
    if (!f) return;
    this.floor = f;
    this.buildProps();
  }

  // The topmost placed thing under a world point: its drawn art, its collision, or its marker stand-in.
  private pick(p: Vec2): number | null {
    const d = this.doc;
    if (!d) return null;
    const px = render.pixelScale;
    const sp = toScreen(p.x, p.y);
    let best: number | null = null;
    let bestY = -Infinity;
    d.map.objects.forEach((o, i) => {
      const a = assets.get(o.asset);
      if (!a) return;
      const s = toScreen(o.x, o.y);
      const inBox = (key: string, ox: number, oy: number, originX: number, originY: number, scale: number) => {
        const size = this.canvas.textureSize(key);
        if (!size) return false;
        const w = size.width * scale;
        const h = size.height * scale;
        const left = s.x + ox - originX * w;
        const top = s.y + oy - originY * h;
        return sp.x >= left && sp.x <= left + w && sp.y >= top && sp.y <= top + h;
      };
      let hit = a.parts.some((part) => inBox(part.texture, part.x * px * o.size, part.y * px * o.size, part.originX, part.originY, px * part.scale * o.size));
      if (!hit && !a.parts.length) {
        const stand = a.marker === 'playerStart' ? 'hero' : a.marker === 'shadeSpawn' ? 'shade_0' : '';
        hit = (stand && inBox(stand, 0, 0, 0.5, 1, px)) || Math.hypot(sp.x - s.x, sp.y - s.y) < 12;
      }
      if (!hit) hit = a.collision.some((c) => Math.hypot(p.x - (o.x + c.x * o.size), p.y - (o.y + c.y * o.size)) < c.radius * o.size);
      if (hit && s.y >= bestY) {
        best = i;
        bestY = s.y;
      }
    });
    return best;
  }

  private updateHint(p: Vec2): void {
    const [col, row] = this.tileOf(p);
    const f = this.doc?.tile(col, row);
    this.hint.textContent = `${TOOL_HINTS[this.tool]}   ` + (f ? `[tile ${col}, ${row}: ${f} · world ${Math.round(p.x)}, ${Math.round(p.y)}]` : '');
  }

  // ---- the map view: overlay ----

  private drawOverlay(g: Phaser.GameObjects.Graphics): void {
    const d = this.doc;
    if (!d) return;
    const m = d.map;
    const t = m.tileSize;
    const w = m.cols * t;
    const h = m.rows * t;
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const a = toScreen(x0, y0);
      const b = toScreen(x1, y1);
      g.lineBetween(a.x, a.y, b.x, b.y);
    };
    const box = (c0: number, r0: number, c1: number, r1: number, color: number, fill = 0) => {
      const pts = [toScreen(c0 * t, r0 * t), toScreen((c1 + 1) * t, r0 * t), toScreen((c1 + 1) * t, (r1 + 1) * t), toScreen(c0 * t, (r1 + 1) * t)];
      if (fill) g.fillStyle(color, fill).fillPoints(pts, true);
      g.lineStyle(1.5 / this.canvas.zoom, 0xffe14a, 1).strokePoints(pts, true);
    };
    const ring = (x: number, y: number, r: number, color: number, alpha = 1) => {
      const s = toScreen(x, y);
      const e = ellipseHalfSize(r);
      g.lineStyle(1 / this.canvas.zoom, color, alpha).strokeEllipse(s.x, s.y, e.x * 2, e.y * 2);
    };

    if (this.grid) {
      g.lineStyle(1 / this.canvas.zoom, 0xffffff, 0.08);
      for (let c = 1; c < m.cols; c++) line(c * t, 0, c * t, h);
      for (let r = 1; r < m.rows; r++) line(0, r * t, w, r * t);
    }

    m.objects.forEach((o, i) => {
      const a = assets.get(o.asset);
      if (!a) return;
      if (this.collision) for (const c of a.collision) ring(o.x + c.x * o.size, o.y + c.y * o.size, c.radius * o.size, 0x66ffaa, 0.8);
      if (a.marker) {
        ring(o.x, o.y, 12, 0xf2d7a6);
        if (a.marker === 'shadeSpawn') ring(o.x, o.y, run.spawnZoneRadius * o.size, 0x66d9ef);
        if (a.marker === 'door') ring(o.x, o.y, story.doorRadius * o.size, 0xc080ff);
      }
      if (this.selection.includes(i)) {
        ring(o.x, o.y, 18, 0xffe14a);
        ring(o.x, o.y, 20, 0xffe14a);
      }
    });

    const p = this.canvas.pointer;
    const drag = this.drag;
    const color = floors.get(this.floor)?.colors[0] ?? 0xffffff;
    if (drag?.kind === 'box') {
      const pts = [{ x: drag.x0, y: drag.y0 }, { x: drag.x1, y: drag.y0 }, { x: drag.x1, y: drag.y1 }, { x: drag.x0, y: drag.y1 }];
      g.fillStyle(0xffe14a, 0.08).fillPoints(pts, true);
      g.lineStyle(1 / this.canvas.zoom, 0xffe14a, 1).strokePoints(pts, true);
    } else if (drag?.kind === 'rect') {
      box(Math.min(drag.c0, drag.c1), Math.min(drag.r0, drag.r1), Math.max(drag.c0, drag.c1), Math.max(drag.r0, drag.r1), color, 0.6);
    } else if (p && this.tool === 'paint') {
      const [col, row] = this.tileOf(p);
      const lo = -Math.floor((this.brush - 1) / 2);
      box(col + lo, row + lo, col + lo + this.brush - 1, row + lo + this.brush - 1, 0xffe14a);
    } else if (p && (this.tool === 'fill' || this.tool === 'rect')) {
      const [col, row] = this.tileOf(p);
      box(col, row, col, row, 0xffe14a);
    } else if (p && this.tool === 'place') {
      const at = this.place(p);
      const s = toScreen(at.x, at.y);
      g.lineStyle(1 / this.canvas.zoom, 0xffe14a, 1).lineBetween(s.x - 8, s.y, s.x + 8, s.y).lineBetween(s.x, s.y - 4, s.x, s.y + 4);
    }
  }

  // ---- keys ----

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      this.shift = e.shiftKey;
      if (e.key === ' ') this.canvas.space = true;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 's') {
        e.preventDefault();
        void this.save();
        return;
      }
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (this.key(e, k, ctrl)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey;
      if (e.key === ' ') this.canvas.space = false;
    });
  }

  private key(e: KeyboardEvent, k: string, ctrl: boolean): boolean {
    const d = this.doc;
    if (!d) return false;
    if (ctrl && (k === 'z' || k === 'y')) {
      const redo = k === 'y' || e.shiftKey;
      if (this.drag) return true;
      if (redo ? d.redo() : d.undo()) this.changed();
      return true;
    }
    if (ctrl && k === 'd') {
      this.duplicateSelected();
      return true;
    }
    if (ctrl && k === 'c') {
      this.copySelected();
      return true;
    }
    if (ctrl && k === 'v') {
      this.paste();
      return true;
    }
    if (ctrl && k === 'a') {
      this.selection = d.map.objects.map((_, i) => i);
      this.setTool('select');
      return true;
    }
    if (ctrl) return false;
    if (TOOL_KEYS[k]) {
      this.setTool(TOOL_KEYS[k]);
      return true;
    }
    const sel = this.selection;
    switch (e.key) {
      case ' ':
        return true;
      case 'Escape':
        this.selection = [];
        this.setTool('select');
        return true;
      case 'Delete':
      case 'Backspace':
        this.removeSelected();
        return true;
      case '[':
      case ']': {
        const up = e.key === ']';
        if (FLOOR_TOOLS.includes(this.tool)) {
          this.brush = Phaser.Math.Clamp(this.brush + (up ? 1 : -1), 1, 9);
          this.buildToolbar();
        } else if (sel.length) {
          d.change((m) => sel.forEach((j) => (m.objects[j].size = round(Math.max(0.1, m.objects[j].size + (up ? 0.1 : -0.1))))));
          this.changed();
        }
        return true;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!sel.length) return false;
        const step = e.shiftKey || !this.snap ? 1 : this.snap;
        // Arrows move along the screen, as WASD moves the hero: up is up the screen, which is diagonal in the world.
        const [dx, dy] = { ArrowLeft: [-1, 1], ArrowRight: [1, -1], ArrowUp: [-1, -1], ArrowDown: [1, 1] }[e.key]!;
        d.change((m) => sel.forEach((j) => {
          m.objects[j].x += dx * step;
          m.objects[j].y += dy * step;
        }));
        this.changed();
        return true;
      }
      case 'p':
        void this.play(this.canvas.pointer ?? this.selectedPos() ?? this.canvas.viewCenter());
        return true;
      case 'f':
        this.frame();
        return true;
      case 'h':
        this.collision = !this.collision;
        this.buildToolbar();
        return true;
    }
    return false;
  }

  private setTool(t: Tool): void {
    this.tool = t;
    if (t !== 'place') this.canvas.setGhost(null);
    this.hint.textContent = TOOL_HINTS[t];
    this.buildToolbar();
    this.buildProps();
  }

  private removeSelected(): void {
    const d = this.doc;
    const sel = new Set(this.selection);
    if (!d || !sel.size) return;
    d.change((m) => (m.objects = m.objects.filter((_, i) => !sel.has(i))));
    this.selection = [];
    this.changed();
  }

  // Adds copies of `list` to the map, moved by (dx, dy), and selects them.
  private addCopies(list: EditObject[], dx: number, dy: number): void {
    const d = this.doc;
    if (!d || !list.length) return;
    const first = d.map.objects.length;
    d.change((m) => m.objects.push(...list.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy }))));
    this.selection = list.map((_, k) => first + k);
    this.setTool('select');
    this.changed();
  }

  private duplicateSelected(): void {
    const d = this.doc;
    if (!d) return;
    this.addCopies(this.selection.map((j) => d.map.objects[j]), this.snap || 32, 0);
  }

  private copySelected(): void {
    const d = this.doc;
    if (!d || !this.selection.length) return;
    this.clipboard = this.selection.map((j) => ({ ...d.map.objects[j] }));
    this.hint.textContent = `Copied ${this.clipboard.length} thing${this.clipboard.length > 1 ? 's' : ''}. Ctrl+V pastes at the cursor, in this map or another.`;
  }

  // Pastes with the first copied thing at the cursor (on the grid), the rest in the same places relative to it.
  private paste(): void {
    const c = this.clipboard;
    if (!c.length) return;
    const at = this.place(this.canvas.pointer ?? this.canvas.viewCenter());
    this.addCopies(c, at.x - c[0].x, at.y - c[0].y);
  }

  // ---- panels ----

  private buildToolbar(): void {
    const tools = (Object.keys(TOOL_NAMES) as Tool[]).map((t) => button(TOOL_NAMES[t], () => this.setTool(t), { class: t === this.tool ? 'on' : '' }));
    const brush = FLOOR_TOOLS.includes(this.tool) && this.tool === 'paint'
      ? [el('span', { class: 'sep' }), el('span', { text: 'brush' }), numberInput(this.brush, 1, (v) => (this.brush = Phaser.Math.Clamp(Math.round(v), 1, 9)), { min: 1, max: 9, style: 'width:44px' })]
      : [];
    this.toolbar.replaceChildren(
      ...tools,
      ...brush,
      el('span', { class: 'sep' }),
      el('span', { text: 'snap' }),
      select(SNAPS, this.snap ? String(this.snap) : 'off', (v) => { this.snap = Number(v) || 0; }),
      el('span', { class: 'sep' }),
      button('Grid', () => { this.grid = !this.grid; this.buildToolbar(); }, { class: this.grid ? 'on' : '' }),
      button('Collision (H)', () => { this.collision = !this.collision; this.buildToolbar(); }, { class: this.collision ? 'on' : '' }),
      button('Fit map (F)', () => this.frame()),
    );
    this.hint.textContent = TOOL_HINTS[this.tool];
  }

  private buildList(): void {
    const used = this.usage();
    const floorIds = floors.list().map((f) => f.id);
    const assetIds = assets.list().map((a) => a.id);
    this.list.replaceChildren(
      el('h2', { text: 'Maps' }),
      ...this.docs.map((d) => button(`${d.dirty ? '• ' : ''}${d.map.name} (${d.id})`, () => this.open(d), { class: d === this.doc ? 'item on' : 'item' })),
      el('div', { class: 'bar' },
        button('New', () => this.create()),
        button('Duplicate', () => this.duplicate(), { disabled: !this.doc }),
        button('Rename', () => void this.rename(), { disabled: !this.doc }),
        button('Delete', () => void this.remove(), { disabled: !this.doc }),
      ),
      el('p', { class: 'hint', text: '• means not saved yet.' }),

      el('h2', { text: 'In every map', style: 'margin-top:18px' }),
      el('p', { class: 'hint', text: 'Swap or rename a floor or asset everywhere it is used. Maps find them by id, which is why the asset maker locks ids that maps use.' }),
      this.acrossBox('floor', floorIds, used.floors),
      this.acrossBox('asset', assetIds, used.assets),
    );
  }

  // Which maps use each floor and asset id, from the working copies (so unsaved changes count).
  private usage(): { floors: Map<string, string[]>; assets: Map<string, string[]> } {
    const out = { floors: new Map<string, string[]>(), assets: new Map<string, string[]>() };
    const add = (m: Map<string, string[]>, id: string, map: string) => {
      const l = m.get(id) ?? [];
      if (!l.includes(map)) l.push(map);
      m.set(id, l);
    };
    for (const d of this.docs) {
      for (const t of new Set(d.map.tiles)) add(out.floors, t, d.id);
      for (const o of d.map.objects) add(out.assets, o.asset, d.id);
    }
    return out;
  }

  private acrossPick = { floor: '', asset: '' };
  private acrossWith = { floor: '', asset: '' };

  private acrossBox(kind: 'floor' | 'asset', ids: string[], used: Map<string, string[]>): HTMLElement {
    const usedIds = ids.filter((id) => used.has(id));
    if (!usedIds.includes(this.acrossPick[kind])) this.acrossPick[kind] = usedIds[0] ?? '';
    const from = this.acrossPick[kind];
    const others = ids.filter((id) => id !== from);
    if (!others.includes(this.acrossWith[kind])) this.acrossWith[kind] = others[0] ?? '';
    const maps = used.get(from) ?? [];
    let newId = '';
    return el('div', { class: 'box' },
      row(kind, select(usedIds, from, (v) => { this.acrossPick[kind] = v; this.buildList(); })),
      el('p', { class: 'hint', text: from ? `In ${maps.join(', ')}.` : `No map uses any ${kind}.` }),
      row('swap for', select(others, this.acrossWith[kind], (v) => (this.acrossWith[kind] = v))),
      el('div', { class: 'bar' },
        button('Swap in every map', () => this.replaceEverywhere(kind, from, this.acrossWith[kind]), { disabled: !from || !others.length }),
        kind === 'asset' ? button('Remove from every map', () => this.replaceEverywhere(kind, from, ''), { disabled: !from }) : '',
      ),
      row('new id', textInput('', (v) => (newId = v), { placeholder: from })),
      el('div', { class: 'bar' }, button('Rename everywhere', () => void this.renameEverywhere(kind, from, newId), { disabled: !from })),
    );
  }

  // Swaps one floor or asset for another in every map's working copy (an asset for '' removes it). Each map gets
  // its own undo step, and nothing is written until Save.
  private replaceEverywhere(kind: 'floor' | 'asset', from: string, to: string): void {
    if (!from || (kind === 'floor' && !to)) return;
    const maps = this.usage()[kind === 'floor' ? 'floors' : 'assets'].get(from) ?? [];
    const what = to ? `Swap every "${from}" for "${to}"` : `Remove every "${from}"`;
    if (!confirm(`${what} in ${maps.join(', ')}? Each map can undo it (Ctrl+Z) until you save.`)) return;
    for (const d of this.docs) {
      if (!maps.includes(d.id)) continue;
      d.change((m) => {
        if (kind === 'floor') m.tiles = m.tiles.map((t) => (t === from ? to : t));
        else if (to) m.objects.forEach((o) => { if (o.asset === from) o.asset = to; });
        else m.objects = m.objects.filter((o) => o.asset !== from);
      });
    }
    this.selection = [];
    this.changed();
  }

  // Renames a floor or asset id in its data file and in every map that uses it, saves them all, then reloads, so
  // this page and the game both read the new id.
  private async renameEverywhere(kind: 'floor' | 'asset', from: string, to: string): Promise<void> {
    to = to.trim();
    if (!from || !to || to === from) return void alert(`Type the new id for "${from}" first.`);
    if (!ID_PATTERN.test(to)) return void alert('An id can only use letters, digits, "-" and "_".');
    const file = kind === 'floor' ? 'src/data/floors.json' : 'src/data/assets.json';
    const maps = this.usage()[kind === 'floor' ? 'floors' : 'assets'].get(from) ?? [];
    const others = this.docs.filter((d) => d.dirty && !maps.includes(d.id)).map((d) => d.id);
    if (!confirm(`Rename the ${kind} "${from}" to "${to}" in ${file.replace('src/data/', '')} and in ${maps.join(', ')}?\n\n`
      + `This saves those maps${others.length ? ` and your other unsaved maps (${others.join(', ')})` : ''}, then reloads the editor. `
      + 'If the asset maker is open with unsaved changes to that file, save them there first, or its save will be refused.')) return;
    this.renaming = true;
    try {
      const text = await readFile(file);
      if (text === null) throw new Error(`could not read ${file}`);
      const renamed = renameInDataFile(text, kind === 'floor' ? 'floors' : 'assets', from, to);
      for (const d of this.docs) {
        if (!maps.includes(d.id)) continue;
        d.change((m) => {
          if (kind === 'floor') {
            m.tiles = m.tiles.map((t) => (t === from ? to : t));
            for (const ch of Object.keys(m.legend)) if (m.legend[ch] === from) m.legend[ch] = to;
          } else m.objects.forEach((o) => { if (o.asset === from) o.asset = to; });
        });
      }
      await saveFile(file, renamed, text);
      if (!(await this.save())) throw new Error(`${file} was renamed but a map could not be saved; see the message above and press Save`);
    } catch (e) {
      this.renaming = false;
      alert(`Could not rename: ${e instanceof Error ? e.message : e}`);
      this.changed();
      return;
    }
    this.reload();
  }

  private buildProps(): void {
    const d = this.doc;
    if (!d) {
      this.props.replaceChildren(el('p', { class: 'hint', text: 'No map open. Press New on the left.' }));
      return;
    }
    this.props.replaceChildren(
      // The palettes stay at the top, so they do not move when the selection panel grows or shrinks.
      ...this.floorPalette(),
      ...this.assetPalette(),
      ...this.selectionPanel(d),
      ...this.mapPanel(d),
    );
  }

  private selectionPanel(d: MapDoc): (HTMLElement | string)[] {
    if (this.selection.length > 1) {
      return [
        el('h2', { text: 'Selected', style: 'margin-top:16px' }),
        el('p', { class: 'hint', text: `${this.selection.length} things. Drag one to move them all; arrows nudge, [ and ] resize, Alt+drag moves copies.` }),
        el('div', { class: 'bar' },
          button('Copy (Ctrl+C)', () => this.copySelected()),
          button('Duplicate (Ctrl+D)', () => this.duplicateSelected()),
          button('Delete (Del)', () => this.removeSelected()),
        ),
      ];
    }
    const sel = this.single;
    const o = sel !== null ? d.map.objects[sel] : undefined;
    if (sel === null || !o) return [el('h2', { text: 'Selected', style: 'margin-top:16px' }), el('p', { class: 'hint', text: 'Nothing. Use Select (V) and click a thing on the map, or drag a box round several.' })];
    const edit = (fn: () => void) => {
      d.change(fn);
      this.changed(false);
    };
    const asset = assets.get(o.asset);
    return [
      el('h2', { text: 'Selected', style: 'margin-top:16px' }),
      row('asset', select(assets.list().map((a) => a.id), o.asset, (v) => { edit(() => (d.map.objects[sel].asset = v)); this.buildProps(); })),
      row('x, y', numberInput(o.x, 1, (v) => edit(() => (d.map.objects[sel].x = v))), numberInput(o.y, 1, (v) => edit(() => (d.map.objects[sel].y = v)))),
      row('size', numberInput(o.size, 0.1, (v) => edit(() => (d.map.objects[sel].size = Math.max(0.1, v))), { min: 0.1 })),
      asset?.marker === 'shadeSpawn' ? el('p', { class: 'hint', text: `Shades appear inside the blue ring. Size scales it (radius ${run.spawnZoneRadius} at size 1, in the dev menu's run section). A map with no zones is calm: no Shades, no run.` }) : '',
      asset?.marker === 'playerStart' ? el('p', { class: 'hint', text: 'Where a run starts. Only the first player start in a map counts.' }) : '',
      row('goes to', select(['', ...this.docs.map((m) => m.id).filter((id) => id !== d.id)], o.to ?? '', (v) => edit(() => (d.map.objects[sel].to = v)))),
      asset?.marker === 'door'
        ? el('p', { class: 'hint', text: `Walking into the purple ring goes to the map in "goes to". Size scales it (radius ${story.doorRadius} at size 1, in the dev menu's story section).` })
        : el('p', { class: 'hint', text: 'With "goes to" set, pressing F next to this goes to that map.' }),
      row('only if', textInput(o.if ?? '', (v) => edit(() => (d.map.objects[sel].if = v)))),
      row('only unless', textInput(o.unless ?? '', (v) => edit(() => (d.map.objects[sel].unless = v)))),
      el('p', { class: 'hint', text: 'Save flags, such as mindscapeCleared. "Only if" shows it while the flag is on, "only unless" while it is off. Leave empty for always.' }),
      el('div', { class: 'bar' },
        button('Copy (Ctrl+C)', () => this.copySelected()),
        button('Duplicate (Ctrl+D)', () => this.duplicateSelected()),
        button('Delete (Del)', () => this.removeSelected()),
      ),
    ];
  }

  private floorPalette(): HTMLElement[] {
    return [
      el('h2', { text: 'Palette' }),
      el('h3', { text: 'Floors (paint with Brush, Fill or Box)' }),
      ...floors.list().map((f) => {
        const b = button('', () => {
          this.floor = f.id;
          if (!FLOOR_TOOLS.includes(this.tool)) this.setTool('paint');
          else this.buildProps();
        }, { class: f.id === this.floor ? 'item on' : 'item' });
        b.append(el('span', { class: 'floor-swatch' }, el('i', { style: `background:${hex(f.colors[0])}` }), `${f.name}${f.blocks ? ' (blocks walking)' : ''}${f.hurts ? ' (kills)' : ''}`));
        return b;
      }),
    ];
  }

  // Which category tab the asset palette shows. Starts on the category of the asset being placed.
  private assetCategory = '';

  // One tab per asset category (set in the asset maker), so the list stays short however many assets there are.
  private assetPalette(): HTMLElement[] {
    const byCategory = new Map<string, Asset[]>();
    for (const a of assets.list()) byCategory.set(a.category, [...(byCategory.get(a.category) ?? []), a]);
    const cats = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));
    if (!byCategory.has(this.assetCategory)) this.assetCategory = assets.get(this.asset)?.category ?? cats[0] ?? '';
    return [
      el('h3', { text: 'Assets (click, then click the map)' }),
      el('div', { class: 'bar' }, ...cats.map((c) => button(c, () => { this.assetCategory = c; this.buildProps(); }, { class: c === this.assetCategory ? 'on' : '' }))),
      ...(byCategory.get(this.assetCategory) ?? []).map((a) => button(a.name, () => { this.asset = a.id; this.setTool('place'); }, { class: a.id === this.asset && this.tool === 'place' ? 'item on' : 'item' })),
    ];
  }

  private mapPanel(d: MapDoc): HTMLElement[] {
    const m = d.map;
    const edge = (side: Side, label: string) => row(label,
      button('+1', () => this.resize(side, 1)),
      button('−1', () => this.resize(side, -1)),
    );
    return [
      el('h3', { text: 'Map' }),
      row('id', el('span', { text: `${d.id} (Rename on the left)` })),
      row('name', textInput(m.name, (v) => { d.change((mm) => (mm.name = v || d.id)); this.changed(); })),
      row('darkness', numberInput(m.darkness ?? 0, 0.05, (v) => { d.change((mm) => (mm.darkness = Phaser.Math.Clamp(v, 0, 1))); this.changed(); }, { min: 0, max: 1 })),
      el('p', { class: 'hint', text: 'How dark the map is away from lights, 0 to 1. Assets with a light (set in the asset maker) light it up.' }),
      el('p', { class: 'hint', text: `${m.cols} × ${m.rows} tiles, each ${m.tileSize} world units across. The top corner of the diamond is row 0, column 0.` }),
      edge('top', 'top edge'),
      edge('left', 'left edge'),
      edge('right', 'right edge'),
      edge('bottom', 'bottom edge'),
      el('p', { class: 'hint', text: `On screen, the top edge runs up-right from the left corner and the left edge runs up-left from the bottom corner. New tiles get the chosen floor. Up to ${MAX_TILES} a side.` }),
    ];
  }

  private resize(side: Side, delta: number): void {
    const d = this.doc;
    if (!d) return;
    const lost = d.lostBy(side, delta);
    if (lost && !confirm(`${lost} placed thing${lost > 1 ? 's are' : ' is'} on that edge and will be removed. Go ahead? (Ctrl+Z undoes it.)`)) return;
    if (d.resize(side, delta, this.floor)) {
      this.selection = [];
      this.changed();
    }
  }
}

const editor = new LevelEditor();
void editor.load();
// Handy for poking at the editor from the browser console.
(window as unknown as { levelEditor: LevelEditor }).levelEditor = editor;
