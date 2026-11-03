import { player } from '../config/character';
import Phaser from 'phaser';
import { Asset, AssetPart, ENEMY_KINDS, Light } from '../data/assets';
import { sounds } from '../data/sounds';
import { Preview } from './Preview';
import { button, byName, checkbox, colorInput, el, ID_PATTERN, numberInput, row, select, suggestInput, textInput, uniqueId } from './ui';
import { Workspace } from './Workspace';

// Markers the game knows about.
const MARKERS = ['', 'playerStart', 'shadeSpawn', 'door', 'enemy'];

// Edits assets.json: what each placeable thing looks like (its parts) and what is solid (its collision circles).
// The preview shows it on the floor chosen in the Floors tab, as the game draws it.
export class AssetTab {
  private current: Asset | null;
  private hero = true;
  private list = el('div', {});
  private props = el('div', {});

  constructor(private ws: Workspace, private preview: Preview, private floorId: () => string) {
    this.current = ws.assets[0] ?? null;
  }

  mount(list: HTMLElement, center: HTMLElement, props: HTMLElement): void {
    // Dragging in the preview moves a part or circle; the panel's numbers catch up when it is let go.
    this.preview.onDrag = (done) => this.edit(done);
    list.replaceChildren(this.list);
    center.replaceChildren(
      this.preview.host,
      el('p', { class: 'hint', text: 'Green rings are what is solid. The cross is the ground point: where the asset stands when placed in a map. Drag a ring or a part to move it. Wheel zooms.' }),
    );
    props.replaceChildren(this.props);
    this.refresh();
  }

  private refresh(): void {
    this.buildList();
    this.buildProps();
    this.show();
  }

  private show(): void {
    const floor = this.ws.floors.find((f) => f.id === this.floorId()) ?? this.ws.floors[0];
    if (floor) this.preview.show(this.current, floor, this.hero);
  }

  // Each edit updates the preview at once and marks assets.json unsaved.
  private edit(rebuild = false): void {
    this.ws.touch('assets');
    this.show();
    if (rebuild) this.buildProps();
  }

  // One tab per category, like the level editor's palette. It follows the open asset, so changing an asset's
  // category moves the list to its new tab.
  private buildList(): void {
    const byCategory = new Map<string, Asset[]>();
    for (const a of [...this.ws.assets].sort((a, b) => byName(a.name, b.name))) byCategory.set(a.category, [...(byCategory.get(a.category) ?? []), a]);
    const cats = [...byCategory.keys()].sort(byName);
    const shown = this.current?.category ?? cats[0];
    this.list.replaceChildren(
      el('h2', { text: 'Assets' }),
      el('div', { class: 'bar' }, ...cats.map((c) => button(c, () => this.open(byCategory.get(c)![0]), { class: c === shown ? 'on' : '' }))),
      ...(byCategory.get(shown) ?? []).map((a) => button(a.name, () => this.open(a), { class: a === this.current ? 'item on' : 'item' })),
      el('div', { class: 'bar' },
        button('New', () => this.create()),
        button('Duplicate', () => this.duplicate(), { disabled: !this.current }),
        button('Delete', () => this.remove(), { disabled: !this.current }),
      ),
    );
  }

  private buildProps(): void {
    const a = this.current;
    if (!a) {
      this.props.replaceChildren(el('p', { class: 'hint', text: 'No asset yet. Press New.' }));
      return;
    }
    const textures = this.preview.textureKeys();
    const categories = [...new Set(this.ws.assets.map((x) => x.category))];
    const used = this.ws.mapsUsingAsset(a.id);
    this.props.replaceChildren(
      el('h2', { text: 'Asset' }),
      row('id', textInput(a.id, (v) => this.rename(v))),
      used.length ? el('p', { class: 'hint', text: `Used in map${used.length > 1 ? 's' : ''}: ${used.join(', ')}. Its id is locked so those maps keep finding it.` }) : '',
      row('name', textInput(a.name, (v) => { a.name = v || a.id; this.edit(); this.buildList(); })),
      row('category', suggestInput(a.category, categories, (v) => { a.category = v || 'misc'; this.edit(); this.buildList(); })),
      row('marker', suggestInput(a.marker, MARKERS, (v) => { a.marker = v; this.edit(); })),
      a.marker ? el('p', { class: 'hint', text: 'A marker is invisible in play; it only tells the game where something goes.' }) : '',
      row('hero for scale', checkbox(this.hero, (v) => { this.hero = v; this.show(); })),

      el('h3', { text: 'Parts (drawn back to front)' }),
      ...a.parts.map((p, i) => this.partBox(a, p, i, textures)),
      el('div', { class: 'bar' }, button('Add part', () => {
        a.parts.push({ texture: textures[0] ?? '', x: 0, y: 0, scale: 1, originX: 0.5, originY: 1, ground: false, frames: [], fps: 8 });
        this.edit(true);
      })),

      el('h3', { text: 'Collision circles (world units)' }),
      ...a.collision.map((c, i) => el('div', { class: 'box' },
        row('x, y', numberInput(c.x, 1, (v) => { c.x = v; this.edit(); }), numberInput(c.y, 1, (v) => { c.y = v; this.edit(); })),
        row('radius', numberInput(c.radius, 1, (v) => { c.radius = Math.max(1, v); this.edit(); }, { min: 1 }),
          button('remove', () => { a.collision.splice(i, 1); this.edit(true); })),
      )),
      el('div', { class: 'bar' }, button('Add circle', () => { a.collision.push({ x: 0, y: 0, radius: 16 }); this.edit(true); })),
      el('p', { class: 'hint', text: `For scale: a floor tile is 64 across and the hero's body is a circle of radius ${player.bodyRadius}.` }),

      el('h3', { text: 'Hit shapes (what arrows hit, in orange)' }),
      ...(a.hit ?? []).map((h, i) => el('div', { class: 'box' },
        row('shape', select(['circle', 'box'], h.box ? 'box' : 'circle', (v) => { h.box = v === 'box'; this.edit(true); }),
          button('remove', () => { a.hit.splice(i, 1); this.edit(true); })),
        row('x, y', numberInput(h.x, 1, (v) => { h.x = v; this.edit(); }), numberInput(h.y, 1, (v) => { h.y = v; this.edit(); })),
        ...(h.box
          ? [
              row('w, h', numberInput(h.w, 1, (v) => { h.w = Math.max(1, v); this.edit(); }, { min: 1 }), numberInput(h.h, 1, (v) => { h.h = Math.max(1, v); this.edit(); }, { min: 1 })),
              row('turned', checkbox(h.turned, (v) => { h.turned = v; this.edit(); })),
            ]
          : [row('radius', numberInput(h.radius, 1, (v) => { h.radius = Math.max(1, v); this.edit(); }, { min: 1 }))]),
      )),
      el('div', { class: 'bar' },
        button('Add hit circle', () => { (a.hit ??= []).push({ box: false, x: 0, y: 0, radius: 16, w: 32, h: 32, turned: false }); this.edit(true); }),
        button('Add hit box', () => { (a.hit ??= []).push({ box: true, x: 0, y: 0, radius: 16, w: 64, h: 16, turned: false }); this.edit(true); }),
      ),
      el('p', { class: 'hint', text: 'With none, arrows hit the collision circles. With any, arrows hit only these, so a thing can be walked through and still shot, or walked round and shot higher up. A box\'s w runs down-right on screen (like an SE wall) and h down-left; turned, w runs straight across the screen and h up and down it.' }),

      el('h3', { text: a.marker === 'enemy' ? 'Enemy' : 'Spawner' }),
      row(a.marker === 'enemy' ? 'enemy' : 'spawns', select(['', ...ENEMY_KINDS], a.enemy ?? '', (v) => { a.enemy = v; this.edit(true); })),
      ...(a.enemy && a.marker !== 'enemy'
        ? [
            row('every (s)', numberInput(a.spawnEvery ?? 3, 0.1, (v) => { a.spawnEvery = Math.max(0.1, v); this.edit(); }, { min: 0.1 })),
            row('max alive', numberInput(a.spawnMax ?? 3, 1, (v) => { a.spawnMax = Math.max(1, Math.round(v)); this.edit(); }, { min: 1 })),
          ]
        : []),
      el('p', { class: 'hint', text: a.marker === 'enemy'
        ? 'Placed in a map, this enemy waits there until the hero comes within its aggro distance (set per placed one in the level editor) or shoots it.'
        : 'With "spawns" set, this is a spawner: while the hero stands in its zone (set per placed one in the level editor), it sends out one every so many seconds, up to "max alive" at once. Give it health so it can be broken; broken, it stops.' }),

      el('h3', { text: 'Breaking' }),
      row('health', numberInput(a.health ?? 0, 1, (v) => { a.health = Math.max(0, Math.round(v)); this.edit(); }, { min: 0 })),
      el('p', { class: 'hint', text: `Arrow damage it takes to break. 0 can't be broken. ${a.hit?.length || a.collision.length ? '' : 'Give it a hit shape or a collision circle so arrows can hit it. '}After the Mindscape (full tree) an arrow does 40.` }),

      el('h3', { text: 'Light' }),
      row('gives light', checkbox(!!a.light, (v) => {
        a.light = v ? { color: '#ffb840', x: 0, y: -8, radius: 60, intensity: 0.5, flicker: 0 } : null;
        this.edit(true);
      })),
      ...(a.light ? this.lightRows(a.light) : []),

      el('h3', { text: 'Sound' }),
      row('loops', select(['', ...sounds.list().map((s) => s.id)], a.sound ?? '', (v) => { a.sound = v; this.edit(); })),
      el('p', { class: 'hint', text: 'A looping sound, louder the nearer the player is to one of these (a fire\'s crackle). Range and volume are in the dev menu\'s sound section.' }),
    );
  }

  private lightRows(l: Light): HTMLElement[] {
    return [
      row('colour', colorInput(l.color, (v) => { l.color = v; this.edit(); })),
      row('offset x, y', numberInput(l.x, 1, (v) => { l.x = v; this.edit(); }), numberInput(l.y, 1, (v) => { l.y = v; this.edit(); })),
      row('radius', numberInput(l.radius, 1, (v) => { l.radius = Math.max(1, v); this.edit(); }, { min: 1 })),
      row('brightness', numberInput(l.intensity, 0.05, (v) => { l.intensity = Phaser.Math.Clamp(v, 0, 1); this.edit(); }, { min: 0, max: 1 })),
      row('flicker', numberInput(l.flicker, 0.05, (v) => { l.flicker = Phaser.Math.Clamp(v, 0, 1); this.edit(); }, { min: 0, max: 1 })),
      el('p', { class: 'hint', text: 'Offset and radius are in art pixels from the ground point, like parts. Brightness and flicker go from 0 to 1. A map\'s darkness is set in the level editor.' }),
    ];
  }

  private partBox(a: Asset, p: AssetPart, i: number, textures: string[]): HTMLElement {
    const move = (d: number) => {
      const j = i + d;
      if (j < 0 || j >= a.parts.length) return;
      [a.parts[i], a.parts[j]] = [a.parts[j], a.parts[i]];
      this.edit(true);
    };
    return el('div', { class: 'box' },
      row('texture', select(textures, p.texture, (v) => { p.texture = v; this.edit(); })),
      row('offset x, y', numberInput(p.x, 1, (v) => { p.x = v; this.edit(); }), numberInput(p.y, 1, (v) => { p.y = v; this.edit(); })),
      row('origin x, y', numberInput(p.originX, 0.01, (v) => { p.originX = v; this.edit(); }), numberInput(p.originY, 0.01, (v) => { p.originY = v; this.edit(); })),
      row('scale', numberInput(p.scale, 0.05, (v) => { p.scale = v; this.edit(); })),
      row('flat on floor', checkbox(p.ground, (v) => { p.ground = v; this.edit(); })),
      row('frames', textInput((p.frames ?? []).join(', '), (v) => {
        p.frames = v.split(',').map((f) => f.trim()).filter(Boolean);
        this.edit();
      })),
      el('p', { class: 'hint', text: 'To animate: sprite ids to play in a loop, split by commas (fire, fire_1, fire_2). Empty for a still part.' }),
      row('frames a second', numberInput(p.fps, 1, (v) => { p.fps = Math.max(0.1, v); this.edit(); }, { min: 0.1 })),
      el('div', { class: 'bar' },
        button('↑', () => move(-1)), button('↓', () => move(1)),
        button('remove', () => { a.parts.splice(i, 1); this.edit(true); }),
      ),
    );
  }

  private open(a: Asset): void {
    this.current = a;
    this.refresh();
  }

  private taken = (id: string): boolean => this.ws.assets.some((a) => a.id === id);

  private create(): void {
    const id = uniqueId('asset', this.taken);
    const a: Asset = { id, name: id, category: this.current?.category ?? 'props', parts: [], collision: [], hit: [], marker: '', light: null, sound: '', health: 0, enemy: '', spawnEvery: 3, spawnMax: 3 };
    this.ws.assets.push(a);
    this.ws.touch('assets');
    this.open(a);
  }

  private duplicate(): void {
    const a = this.current;
    if (!a) return;
    const id = uniqueId(`${a.id}-copy`, this.taken);
    const copy: Asset = { ...a, id, name: `${a.name} copy`, parts: a.parts.map((p) => ({ ...p, frames: [...(p.frames ?? [])] })), collision: a.collision.map((c) => ({ ...c })), hit: (a.hit ?? []).map((h) => ({ ...h })), light: a.light ? { ...a.light } : null };
    this.ws.assets.splice(this.ws.assets.indexOf(a) + 1, 0, copy);
    this.ws.touch('assets');
    this.open(copy);
  }

  private remove(): void {
    const a = this.current;
    if (!a) return;
    const used = this.ws.mapsUsingAsset(a.id);
    if (used.length) return alert(`"${a.name}" is placed in ${used.join(', ')}. Take it out of those maps first, or the maps lose it.`);
    if (!confirm(`Delete the asset "${a.name}"? It is gone from the file once you save.`)) return;
    this.ws.assets.splice(this.ws.assets.indexOf(a), 1);
    this.ws.touch('assets');
    this.current = this.ws.assets[0] ?? null;
    this.refresh();
  }

  private rename(id: string): void {
    const a = this.current;
    if (!a || id === a.id) return;
    const used = this.ws.mapsUsingAsset(a.id);
    let problem = '';
    if (used.length) problem = `Maps use this id (${used.join(', ')}), so it cannot change here.`;
    else if (!ID_PATTERN.test(id)) problem = 'An id can only use letters, digits, "-" and "_".';
    else if (this.taken(id)) problem = `There is already an asset called "${id}".`;
    if (problem) {
      alert(problem);
      return this.buildProps();
    }
    if (a.name === a.id) a.name = id;
    a.id = id;
    this.ws.touch('assets');
    this.refresh();
  }
}
