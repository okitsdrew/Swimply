import { rgba, Sprite } from '../data/sprites';
import { Preview } from './Preview';
import { button, el, ID_PATTERN, numberInput, row, select, textInput, uniqueId } from './ui';
import { Workspace } from './Workspace';

// Characters handed out to new palette colours, in order. "." is see-through, so it is never one of them.
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_SIZE = 128;
const MAX_UNDO = 100;

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
const TOOL_KEYS: Record<string, Tool> = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' };

interface Snapshot {
  width: number;
  height: number;
  palette: { ch: string; hex: string }[];
  pixels: number[];
}

const snap = (s: Sprite): Snapshot => ({ width: s.width, height: s.height, palette: s.palette.map((c) => ({ ...c })), pixels: [...s.pixels] });

// The pixel editor. Left mouse draws with the chosen tool, right mouse erases, Alt+click picks a colour, the mouse
// wheel zooms. Every stroke is one undo step (Ctrl+Z, Ctrl+Y). Edits change the working copy at once and the asset
// preview after each stroke; Save writes them to src/data/sprites.json.
export class SpriteTab {
  private current: Sprite | null = null;
  private tool: Tool = 'pencil';
  private color = 0;
  private mirror = false;
  private zoom = 16;
  private history = new Map<string, { undo: Snapshot[]; redo: Snapshot[] }>();
  private canvas = el('canvas', { class: 'pixels' });
  private ctx = this.canvas.getContext('2d')!;
  private small = [1, 2, 4].map(() => el('canvas', { class: 'small' }));
  private stroke: { button: number; last: [number, number] | null } | null = null;
  private hover: [number, number] | null = null;
  private status = el('div', { class: 'hint' });
  private list = el('div', {});
  private props = el('div', {});
  private center = el('div', { class: 'canvas-wrap' }, this.canvas);

  constructor(private ws: Workspace, private preview: Preview) {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    window.addEventListener('pointerup', () => this.up());
    this.center.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.zoom + (e.deltaY < 0 ? 2 : -2));
    }, { passive: false });
    this.current = ws.sprites[0] ?? null;
  }

  mount(list: HTMLElement, center: HTMLElement, props: HTMLElement): void {
    list.replaceChildren(this.list);
    center.replaceChildren(this.center, this.status);
    props.replaceChildren(this.props);
    this.refresh();
    if (this.current) this.fitZoom();
  }

  // Keyboard shortcuts while this tab is open. Returns true when the key was used.
  key(e: KeyboardEvent): boolean {
    if (!this.current) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'z' && !e.shiftKey) return this.undo(), true;
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) return this.redo(), true;
    if (ctrl) return false;
    if (TOOL_KEYS[k]) return this.setTool(TOOL_KEYS[k]), true;
    if (k === 'm') return (this.mirror = !this.mirror), this.refresh(), true;
    if (k === '+' || k === '=') return this.setZoom(this.zoom + 2), true;
    if (k === '-') return this.setZoom(this.zoom - 2), true;
    if (/^[1-9]$/.test(k) && this.current.palette[+k - 1]) return this.pickColor(+k - 1), true;
    return false;
  }

  private refresh(): void {
    this.buildList();
    this.buildProps();
    this.draw();
  }

  private buildList(): void {
    const items = this.ws.sprites.map((s) =>
      button(`${s.name}  (${s.width}×${s.height})`, () => this.open(s), { class: s === this.current ? 'item on' : 'item' }),
    );
    const codeArt = this.preview.textureKeys().filter((k) => !this.ws.sprite(k));
    let pick = codeArt[0] ?? '';
    this.list.replaceChildren(
      el('h2', { text: 'Sprites' }),
      ...items,
      el('div', { class: 'bar' },
        button('New', () => this.create()),
        button('Duplicate', () => this.duplicate(), { disabled: !this.current }),
        button('Delete', () => this.remove(), { disabled: !this.current }),
      ),
      el('h3', { text: 'Code art' }),
      el('p', { class: 'hint', text: 'Turn a code-drawn texture into a sprite you can edit. Once saved, your drawing replaces it in the game.' }),
      el('div', { class: 'bar' }, select(codeArt, pick, (v) => (pick = v)), button('Convert', () => this.convert(pick), { disabled: !codeArt.length })),
    );
  }

  private buildProps(): void {
    const s = this.current;
    if (!s) {
      this.props.replaceChildren(el('p', { class: 'hint', text: 'No sprite yet. Press New, or convert some code art.' }));
      return;
    }
    const tools = (['pencil', 'eraser', 'fill', 'picker'] as Tool[]).map((t) =>
      button(`${t} (${Object.keys(TOOL_KEYS).find((k) => TOOL_KEYS[k] === t)})`, () => this.setTool(t), { class: t === this.tool ? 'on' : '' }),
    );
    const swatches = s.palette.map((c, j) => {
      const b = button(j < 9 ? String(j + 1) : '', () => this.pickColor(j), { class: j === this.color ? 'swatch on' : 'swatch', title: `${c.hex} ("${c.ch}")` });
      b.style.background = c.hex;
      return b;
    });
    const c = s.palette[this.color];
    const colorEdit = c
      ? [
          row('colour', this.colorInput(c), numberInput(rgba(c.hex)[3], 1, (a) => this.setAlpha(a), { min: 0, max: 255, title: 'how solid, 0 to 255' })),
          el('p', { class: 'hint', text: 'Changing a colour recolours every pixel that uses it.' }),
        ]
      : [];
    let w = s.width;
    let h = s.height;
    let anchor = 'bottom';
    const code = this.preview.codeArt(s.id);
    this.props.replaceChildren(
      el('h2', { text: 'Draw' }),
      el('div', { class: 'bar' }, ...tools),
      el('div', { class: 'bar' },
        button(this.mirror ? 'mirror: on (M)' : 'mirror: off (M)', () => { this.mirror = !this.mirror; this.refresh(); }, { class: this.mirror ? 'on' : '' }),
        button('undo', () => this.undo()),
        button('redo', () => this.redo()),
      ),
      el('p', { class: 'hint', text: 'Right mouse erases. Alt+click picks a colour. Wheel zooms.' }),
      el('h3', { text: 'Palette' }),
      el('div', { class: 'swatches' }, ...swatches),
      ...colorEdit,
      el('div', { class: 'bar' },
        button('Add colour', () => this.addColor(), { disabled: s.palette.length >= CHARS.length }),
        button('Remove unused', () => this.removeUnused()),
      ),
      el('h3', { text: 'Sprite' }),
      row('id', textInput(s.id, (v) => this.rename(v))),
      row('name', textInput(s.name, (v) => { s.name = v || s.id; this.ws.touch('sprites'); this.buildList(); })),
      code ? el('p', { class: 'hint warn', text: `This replaces the code-drawn "${s.id}" in the game. Keep it ${code.width}×${code.height} unless you know the game code does not depend on its size.` }) : '',
      row('size', numberInput(w, 1, (v) => (w = v), { min: 1, max: MAX_SIZE }), numberInput(h, 1, (v) => (h = v), { min: 1, max: MAX_SIZE })),
      row('keep', select(['bottom', 'top', 'centre', 'top-left'], anchor, (v) => (anchor = v)), button('Resize', () => this.resize(w, h, anchor))),
      el('div', { class: 'bar' },
        button('←', () => this.shift(-1, 0)), button('→', () => this.shift(1, 0)),
        button('↑', () => this.shift(0, -1)), button('↓', () => this.shift(0, 1)),
        button('flip', () => this.flip()),
      ),
      el('h3', { text: 'Actual size, 2x (as in game), 4x' }),
      el('div', { class: 'smalls' }, ...this.small),
    );
  }

  private colorInput(c: { hex: string }): HTMLInputElement {
    const i = el('input', { type: 'color', value: c.hex.slice(0, 7) });
    i.addEventListener('input', () => {
      this.remember();
      c.hex = i.value + c.hex.slice(7);
      this.changed();
    });
    i.addEventListener('change', () => this.refresh());
    return i;
  }

  private setAlpha(a: number): void {
    const c = this.current?.palette[this.color];
    if (!c) return;
    this.remember();
    const v = Math.max(0, Math.min(255, Math.round(a)));
    c.hex = c.hex.slice(0, 7) + (v === 255 ? '' : v.toString(16).padStart(2, '0'));
    this.changed();
  }

  private open(s: Sprite): void {
    this.current = s;
    this.color = Math.min(this.color, Math.max(0, s.palette.length - 1));
    this.fitZoom();
    this.refresh();
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.buildProps();
  }

  private pickColor(j: number): void {
    this.color = j;
    if (this.tool === 'eraser' || this.tool === 'picker') this.tool = 'pencil';
    this.buildProps();
  }

  private setZoom(z: number): void {
    this.zoom = Math.max(2, Math.min(48, z));
    this.draw();
  }

  private fitZoom(): void {
    const s = this.current;
    if (!s) return;
    const box = this.center.getBoundingClientRect();
    const fit = Math.floor(Math.min((box.width || 600) / s.width, (box.height || 500) / s.height) * 0.9);
    this.zoom = Math.max(2, Math.min(48, fit));
  }

  // --- drawing ---

  private cell(e: PointerEvent): [number, number] | null {
    const s = this.current;
    if (!s) return null;
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * s.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * s.height);
    return x >= 0 && y >= 0 && x < s.width && y < s.height ? [x, y] : null;
  }

  private down(e: PointerEvent): void {
    const s = this.current;
    const at = this.cell(e);
    if (!s || !at) return;
    e.preventDefault();
    if (e.button === 0 && (e.altKey || this.tool === 'picker')) {
      const j = s.pixels[at[1] * s.width + at[0]];
      if (j >= 0) this.pickColor(j);
      else this.setTool('eraser');
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    this.remember();
    if (e.button === 0 && this.tool === 'fill') {
      this.fill(at[0], at[1], this.color);
      this.changed();
      this.endStroke();
      return;
    }
    this.stroke = { button: e.button, last: null };
    this.paintTo(at);
  }

  private move(e: PointerEvent): void {
    const at = this.cell(e);
    this.hover = at;
    if (this.stroke && at) this.paintTo(at);
    else this.draw();
    const s = this.current;
    if (s) this.status.textContent = at ? `x ${at[0]}, y ${at[1]}   (${s.width}×${s.height}, zoom ${this.zoom})` : `${s.width}×${s.height}, zoom ${this.zoom}`;
  }

  private up(): void {
    if (!this.stroke) return;
    this.stroke = null;
    this.endStroke();
  }

  // A line from the last point, so a fast mouse still leaves an unbroken stroke.
  private paintTo(at: [number, number]): void {
    const s = this.current!;
    const value = this.stroke!.button === 2 || this.tool === 'eraser' ? -1 : this.color;
    let [x0, y0] = this.stroke!.last ?? at;
    const [x1, y1] = at;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      s.pixels[y0 * s.width + x0] = value;
      if (this.mirror) s.pixels[y0 * s.width + (s.width - 1 - x0)] = value;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    this.stroke!.last = at;
    this.changed();
  }

  private fill(x: number, y: number, value: number): void {
    const s = this.current!;
    const from = s.pixels[y * s.width + x];
    if (from === value) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= s.width || cy >= s.height || s.pixels[cy * s.width + cx] !== from) continue;
      s.pixels[cy * s.width + cx] = value;
      if (this.mirror) s.pixels[cy * s.width + (s.width - 1 - cx)] = value;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  // After every edit: redraw here and mark the file unsaved. The game preview updates once the stroke ends.
  private changed(): void {
    this.ws.touch('sprites');
    this.draw();
  }

  private endStroke(): void {
    if (this.current) this.preview.setSprite(this.current);
  }

  private draw(): void {
    const s = this.current;
    const z = this.zoom;
    if (!s) {
      this.canvas.width = this.canvas.height = 0;
      return;
    }
    this.canvas.width = s.width * z;
    this.canvas.height = s.height * z;
    const g = this.ctx;
    const checker = Math.max(4, Math.floor(z / 2));
    for (let y = 0; y < this.canvas.height; y += checker) {
      for (let x = 0; x < this.canvas.width; x += checker) {
        g.fillStyle = ((x + y) / checker) % 2 ? '#2a2538' : '#221e2e';
        g.fillRect(x, y, checker, checker);
      }
    }
    s.pixels.forEach((j, i) => {
      if (j < 0) return;
      g.fillStyle = s.palette[j].hex;
      g.fillRect((i % s.width) * z, Math.floor(i / s.width) * z, z, z);
    });
    if (z >= 8) {
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < s.width; x++) g.moveTo(x * z + 0.5, 0), g.lineTo(x * z + 0.5, s.height * z);
      for (let y = 1; y < s.height; y++) g.moveTo(0, y * z + 0.5), g.lineTo(s.width * z, y * z + 0.5);
      g.stroke();
    }
    if (this.mirror) {
      g.strokeStyle = 'rgba(201,182,255,0.5)';
      g.beginPath();
      g.moveTo((s.width * z) / 2, 0);
      g.lineTo((s.width * z) / 2, s.height * z);
      g.stroke();
    }
    if (this.hover) {
      g.strokeStyle = '#f2d7a6';
      g.strokeRect(this.hover[0] * z + 0.5, this.hover[1] * z + 0.5, z - 1, z - 1);
    }
    this.drawSmall(s);
  }

  private drawSmall(s: Sprite): void {
    [1, 2, 4].forEach((scale, k) => {
      const c = this.small[k];
      c.width = s.width * scale;
      c.height = s.height * scale;
      const g = c.getContext('2d')!;
      s.pixels.forEach((j, i) => {
        if (j < 0) return;
        g.fillStyle = s.palette[j].hex;
        g.fillRect((i % s.width) * scale, Math.floor(i / s.width) * scale, scale, scale);
      });
    });
  }

  // --- undo ---

  private stacks() {
    const id = this.current!.id;
    let h = this.history.get(id);
    if (!h) this.history.set(id, (h = { undo: [], redo: [] }));
    return h;
  }

  // Called before each change, so undo goes back to how it was before it.
  private remember(): void {
    if (!this.current) return;
    const h = this.stacks();
    h.undo.push(snap(this.current));
    if (h.undo.length > MAX_UNDO) h.undo.shift();
    h.redo.length = 0;
  }

  private restore(from: Snapshot[], to: Snapshot[]): void {
    const s = this.current;
    const back = s && from.pop();
    if (!s || !back) return;
    to.push(snap(s));
    Object.assign(s, back);
    this.color = Math.min(this.color, Math.max(0, s.palette.length - 1));
    this.ws.touch('sprites');
    this.preview.setSprite(s);
    this.refresh();
  }

  private undo(): void {
    if (this.current) this.restore(this.stacks().undo, this.stacks().redo);
  }

  private redo(): void {
    if (this.current) this.restore(this.stacks().redo, this.stacks().undo);
  }

  // --- palette ---

  private addColor(): void {
    const s = this.current;
    if (!s) return;
    const used = new Set(s.palette.map((c) => c.ch));
    const ch = [...CHARS].find((c) => !used.has(c));
    if (!ch) return;
    this.remember();
    s.palette.push({ ch, hex: s.palette[this.color]?.hex ?? '#9a50ff' });
    this.color = s.palette.length - 1;
    this.ws.touch('sprites');
    this.buildProps();
  }

  private removeUnused(): void {
    const s = this.current;
    if (!s) return;
    const used = new Set(s.pixels);
    if (used.size - (used.has(-1) ? 1 : 0) === s.palette.length) return;
    this.remember();
    const keep = s.palette.map((_, j) => j).filter((j) => used.has(j));
    const remap = new Map(keep.map((j, k) => [j, k]));
    s.palette = keep.map((j) => s.palette[j]);
    s.pixels = s.pixels.map((j) => (j < 0 ? -1 : remap.get(j)!));
    this.color = 0;
    this.changed();
    this.buildProps();
  }

  // --- whole sprite ---

  private create(): void {
    const id = uniqueId('sprite', (id) => this.taken(id));
    const s: Sprite = {
      id,
      name: id,
      width: 16,
      height: 16,
      palette: [
        { ch: 'k', hex: '#0b0910' },
        { ch: 'K', hex: '#1c1826' },
        { ch: 'p', hex: '#9a50ff' },
        { ch: 'w', hex: '#e9e9f0' },
      ],
      pixels: new Array(256).fill(-1),
    };
    this.ws.sprites.push(s);
    this.ws.touch('sprites');
    this.preview.setSprite(s);
    this.open(s);
  }

  // A copy to draw the next animation frame on: "shade_0" becomes "shade_1".
  private duplicate(): void {
    const s = this.current;
    if (!s) return;
    const m = /^(.*?)(\d+)$/.exec(s.id);
    const id = m ? uniqueId(`${m[1]}${+m[2] + 1}`, (id) => this.taken(id)) : uniqueId(`${s.id}-copy`, (id) => this.taken(id));
    const copy: Sprite = { ...snap(s), id, name: id };
    this.ws.sprites.splice(this.ws.sprites.indexOf(s) + 1, 0, copy);
    this.ws.touch('sprites');
    this.preview.setSprite(copy);
    this.open(copy);
  }

  private remove(): void {
    const s = this.current;
    if (!s) return;
    const users = this.ws.assets.filter((a) => a.parts.some((p) => p.texture === s.id)).map((a) => a.name);
    const warn = users.length ? `\n\nThese assets draw it: ${users.join(', ')}. If there is no code art called "${s.id}", they will show a missing texture.` : '';
    if (!confirm(`Delete the sprite "${s.name}"?${warn}\n\nIt is gone from the file once you save (git still has the old version).`)) return;
    this.ws.sprites.splice(this.ws.sprites.indexOf(s), 1);
    this.ws.touch('sprites');
    this.current = this.ws.sprites[0] ?? null;
    if (this.current) this.fitZoom();
    this.refresh();
  }

  private taken(id: string): boolean {
    return !!this.ws.sprite(id);
  }

  // Renaming a sprite also points every asset part that drew it at the new name, so nothing goes missing.
  private rename(id: string): void {
    const s = this.current;
    if (!s || id === s.id) return;
    if (!ID_PATTERN.test(id)) return alert('An id can only use letters, digits, "-" and "_".'), this.buildProps();
    if (this.taken(id)) return alert(`There is already a sprite called "${id}".`), this.buildProps();
    let moved = 0;
    for (const a of this.ws.assets) for (const p of a.parts) if (p.texture === s.id) (p.texture = id), moved++;
    if (moved) this.ws.touch('assets');
    this.history.set(id, this.stacks());
    this.history.delete(s.id);
    if (s.name === s.id) s.name = id;
    s.id = id;
    this.ws.touch('sprites');
    this.preview.setSprite(s);
    this.refresh();
  }

  private resize(w: number, h: number, anchor: string): void {
    const s = this.current;
    w = Math.round(w);
    h = Math.round(h);
    if (!s || w < 1 || h < 1 || w > MAX_SIZE || h > MAX_SIZE || (w === s.width && h === s.height)) return;
    this.remember();
    const ox = anchor === 'top-left' ? 0 : Math.floor((w - s.width) / 2);
    const oy = anchor === 'bottom' ? h - s.height : anchor === 'centre' ? Math.floor((h - s.height) / 2) : 0;
    const pixels = new Array(w * h).fill(-1);
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) pixels[ny * w + nx] = s.pixels[y * s.width + x];
      }
    }
    Object.assign(s, { width: w, height: h, pixels });
    this.changed();
    this.endStroke();
    this.fitZoom();
    this.refresh();
  }

  // Moves the whole drawing one pixel; what falls off one edge comes back on the other, so nothing is lost.
  private shift(dx: number, dy: number): void {
    const s = this.current;
    if (!s) return;
    this.remember();
    const out = new Array(s.pixels.length);
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        out[((y + dy + s.height) % s.height) * s.width + ((x + dx + s.width) % s.width)] = s.pixels[y * s.width + x];
      }
    }
    s.pixels = out;
    this.changed();
    this.endStroke();
  }

  private flip(): void {
    const s = this.current;
    if (!s) return;
    this.remember();
    s.pixels = s.pixels.map((_, i) => s.pixels[Math.floor(i / s.width) * s.width + (s.width - 1 - (i % s.width))]);
    this.changed();
    this.endStroke();
  }

  // Reads a code-drawn texture's pixels into a new sprite with the same id, one palette colour per distinct colour.
  private convert(key: string): void {
    const img = key ? this.preview.pixels(key) : null;
    if (!img) return;
    const palette: { ch: string; hex: string }[] = [];
    const index = new Map<string, number>();
    const pixels: number[] = [];
    for (let i = 0; i < img.width * img.height; i++) {
      const [r, g, b, a] = img.data.subarray(i * 4, i * 4 + 4);
      if (a === 0) {
        pixels.push(-1);
        continue;
      }
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') + (a === 255 ? '' : a.toString(16).padStart(2, '0'));
      let j = index.get(hex);
      if (j === undefined) {
        if (palette.length >= CHARS.length) {
          alert(`"${key}" has more than ${CHARS.length} colours (it is a soft glow, not pixel art), so it cannot become a sprite.`);
          return;
        }
        j = palette.length;
        palette.push({ ch: CHARS[j], hex });
        index.set(hex, j);
      }
      pixels.push(j);
    }
    const s: Sprite = { id: key, name: key, width: img.width, height: img.height, palette, pixels };
    this.ws.sprites.push(s);
    this.ws.touch('sprites');
    this.open(s);
  }
}
