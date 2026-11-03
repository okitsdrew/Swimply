import Phaser from 'phaser';
import { render } from '../config/render';
import { ellipseHalfSize, toScreen, toWorld } from '../core/iso';
import { Asset, boxCorners } from '../data/assets';
import { Floor } from '../data/floors';
import { AreaMap } from '../data/maps';
import { applySprite, makeCodeArt, Tex } from '../render/art';
import { MapView } from '../render/MapView';
import { Sprite, sprites } from '../data/sprites';

const TILES = 5;
const TILE = 64;

// The asset maker's view of an asset as the game will draw it: a small patch of floor drawn by the game's own
// MapView, the asset in the middle, its collision circles and ground point on top, and the hero beside it for scale.
class PreviewScene extends Phaser.Scene {
  private view: MapView | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private hero: Phaser.GameObjects.Image[] = [];
  private pending: { asset: Asset | null; floor: Floor; hero: boolean } | null = null;
  ready = false;
  onReady: () => void = () => {};
  // Called while a part or circle is dragged, and once more with done when it is let go. Null where dragging is off
  // (only the Assets tab edits by dragging).
  onDrag: ((done: boolean) => void) | null = null;
  // What is being dragged, and where it and the pointer started.
  private dragging: { x: number; y: number; px: number; py: number; set: (x: number, y: number) => void; scale: number } | null = null;
  // A copy of each code-drawn texture, kept before any drawn sprite replaces it, so it can be put back.
  readonly codeArt = new Map<string, HTMLCanvasElement>();

  constructor() {
    super('preview');
  }

  create(): void {
    makeCodeArt(this);
    for (const k of this.textures.getTextureKeys()) {
      if (k.startsWith('__')) continue;
      const f = this.textures.getFrame(k);
      const copy = document.createElement('canvas');
      copy.width = f.cutWidth;
      copy.height = f.cutHeight;
      copy.getContext('2d')!.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      this.codeArt.set(k, copy);
    }
    for (const s of sprites.list()) applySprite(this, s);
    this.cameras.main.setBackgroundColor(0x0b0a10);
    this.overlay = this.add.graphics().setDepth(1e7);
    const c = toScreen((TILES * TILE) / 2, (TILES * TILE) / 2);
    this.cameras.main.setZoom(2).centerOn(c.x, c.y - 20);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.8 : 1.25), 0.5, 6));
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.grab(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.dragging;
      if (!d || !p.isDown) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      if (d.scale) d.set(Math.round(d.x + (w.x - d.px) / d.scale), Math.round(d.y + (w.y - d.py) / d.scale));
      else {
        const a = toWorld(d.px, d.py);
        const b = toWorld(w.x, w.y);
        d.set(Math.round(d.x + b.x - a.x), Math.round(d.y + b.y - a.y));
      }
      this.onDrag?.(false);
    });
    this.input.on('pointerup', () => {
      if (!this.dragging) return;
      this.dragging = null;
      this.onDrag?.(true);
    });
    this.ready = true;
    this.onReady();
    if (this.pending) this.show(this.pending.asset, this.pending.floor, this.pending.hero);
  }

  update(): void {
    this.view?.render();
  }

  show(asset: Asset | null, floor: Floor, hero: boolean): void {
    this.pending = { asset, floor, hero };
    if (!this.ready) return;
    const mid = (TILES * TILE) / 2;
    const map: AreaMap = {
      id: 'preview',
      name: 'preview',
      tileSize: TILE,
      cols: TILES,
      rows: TILES,
      legend: {},
      tiles: Array.from({ length: TILES * TILES }, () => floor),
      objects: asset ? [{ asset, x: mid, y: mid, size: 1, if: '', unless: '', to: '', onBreak: '', aggro: 0, zone: '', every: 0, max: 0 }] : [],
      darkness: 0,
      zones: [],
    };
    this.view?.destroy();
    this.view = new MapView(this, map);
    this.view.render();

    this.hero.forEach((h) => h.destroy());
    this.hero = [];
    if (hero) {
      const px = render.pixelScale;
      const s = toScreen(mid - TILE * 0.9, mid + TILE * 0.9);
      this.hero.push(
        this.add.image(s.x, s.y, Tex.shadow).setScale(px * 0.9, px * 0.35).setDepth(s.y - 1000),
        this.add.image(s.x, s.y, Tex.hero).setOrigin(0.5, 1).setScale(px).setDepth(s.y),
      );
    }

    const g = this.overlay.clear();
    if (!asset) return;
    for (const c of asset.collision) {
      const s = toScreen(mid + c.x, mid + c.y);
      const e = ellipseHalfSize(c.radius);
      g.lineStyle(1, 0x66ffaa, 1).strokeEllipse(s.x, s.y, e.x * 2, e.y * 2);
    }
    for (const h of asset.hit ?? []) {
      g.lineStyle(1, 0xff9933, 1);
      if (h.box) g.strokePoints(boxCorners(h).map((c) => toScreen(mid + c.x, mid + c.y)), true);
      else {
        const e = ellipseHalfSize(h.radius);
        const c = toScreen(mid + h.x, mid + h.y);
        g.strokeEllipse(c.x, c.y, e.x * 2, e.y * 2);
      }
    }
    const s = toScreen(mid, mid);
    g.lineStyle(1, 0xf2d7a6, 1).lineBetween(s.x - 6, s.y, s.x + 6, s.y).lineBetween(s.x, s.y - 3, s.x, s.y + 3);
  }

  // Picks up the collision circle under the pointer, else the topmost part under it. Circles move in world units,
  // parts in art pixels, as their numbers in the panel are.
  private grab(p: Phaser.Input.Pointer): void {
    const asset = this.pending?.asset;
    if (!asset || !this.onDrag) return;
    const mid = (TILES * TILE) / 2;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const at = toWorld(w.x, w.y);
    let best = Infinity;
    for (const c of asset.collision) {
      const d = Math.hypot(mid + c.x - at.x, mid + c.y - at.y);
      if (d > Math.max(c.radius, 6) || d >= best) continue;
      best = d;
      this.dragging = { x: c.x, y: c.y, px: w.x, py: w.y, scale: 0, set: (x, y) => { c.x = x; c.y = y; } };
    }
    if (best < Infinity) return;
    const px = render.pixelScale;
    const s = toScreen(mid, mid);
    for (const part of [...asset.parts].reverse()) {
      if (!this.textures.exists(part.texture)) continue;
      const f = this.textures.getFrame(part.texture);
      const k = px * part.scale;
      const left = s.x + part.x * px - part.originX * f.width * k;
      const top = s.y + part.y * px - part.originY * f.height * k;
      if (w.x < left || w.y < top || w.x > left + f.width * k || w.y > top + f.height * k) continue;
      this.dragging = { x: part.x, y: part.y, px: w.x, py: w.y, scale: px, set: (x, y) => { part.x = x; part.y = y; } };
      return;
    }
  }

  setSprite(sprite: Sprite): void {
    if (!this.ready) return;
    applySprite(this, sprite);
    if (this.pending) this.show(this.pending.asset, this.pending.floor, this.pending.hero);
  }

  restoreCodeArt(key: string): void {
    const code = this.codeArt.get(key);
    if (!this.ready || !code) return;
    const c = document.createElement('canvas');
    c.width = code.width;
    c.height = code.height;
    c.getContext('2d')!.drawImage(code, 0, 0);
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, c);
    if (this.pending) this.show(this.pending.asset, this.pending.floor, this.pending.hero);
  }
}

export class Preview {
  readonly host = document.createElement('div');
  private scene = new PreviewScene();
  private game: Phaser.Game;

  // Resolves once the textures exist, so lists of textures can be built.
  readonly ready = new Promise<void>((done) => (this.scene.onReady = done));

  constructor() {
    this.host.className = 'preview';
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.host,
      width: 560,
      height: 440,
      backgroundColor: '#0b0a10',
      pixelArt: true,
      roundPixels: true,
      scene: [this.scene],
    });
  }

  show(asset: Asset | null, floor: Floor, hero = true): void {
    this.scene.show(asset, floor, hero);
  }

  // Lets the asset maker hear about parts and circles dragged in the preview.
  set onDrag(fn: ((done: boolean) => void) | null) {
    this.scene.onDrag = fn;
  }

  // Updates the texture for a sprite just drawn, and re-makes the preview so it shows.
  setSprite(sprite: Sprite): void {
    this.scene.setSprite(sprite);
  }

  // The size of the code-drawn texture of this name, if there is one, even when a sprite now replaces it.
  codeArt(key: string): { width: number; height: number } | undefined {
    const c = this.scene.codeArt.get(key);
    return c && { width: c.width, height: c.height };
  }

  // Puts the code-drawn texture back after the sprite that replaced it is reverted or deleted.
  restoreCodeArt(key: string): void {
    this.scene.restoreCodeArt(key);
  }

  // Every texture the game can draw: code art and drawn sprites. Asset parts pick from these.
  textureKeys(): string[] {
    return this.game.textures.getTextureKeys().filter((k) => !k.startsWith('__')).sort();
  }

  // The pixels of a texture, for turning code art into an editable sprite. Null before the preview has started.
  pixels(key: string): ImageData | null {
    if (!this.scene.ready || !this.game.textures.exists(key)) return null;
    const frame = this.game.textures.getFrame(key);
    const c = document.createElement('canvas');
    c.width = frame.cutWidth;
    c.height = frame.cutHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
    return ctx.getImageData(0, 0, c.width, c.height);
  }
}
