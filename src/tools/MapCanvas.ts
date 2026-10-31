import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { Asset } from '../data/assets';
import { AreaMap } from '../data/maps';
import { makeArt } from '../render/art';
import { MapView } from '../render/MapView';

// What the level editor hears from the map view. Positions are world units; button 0 is left. Right and middle
// drags pan the view, so they only arrive as a click (pressed and let go without moving).
export interface CanvasEvents {
  down(p: Vec2, e: { shift: boolean; alt: boolean; ctrl: boolean }): void;
  move(p: Vec2): void;
  up(p: Vec2): void;
  rightClick(p: Vec2): void;
  // Every frame, to draw grid, hover and selection on top of the map.
  overlay(g: Phaser.GameObjects.Graphics): void;
}

const PAN_SLOP = 4;

// The level editor's map: the game's own MapView, so the map looks exactly as it will in play, with the editor's
// overlay on top. Right or middle drag (or Space with left drag) pans, the wheel zooms round the cursor.
class EditorScene extends Phaser.Scene {
  private view: MapView | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Image[] = [];
  private marks: Phaser.GameObjects.Image[] = [];
  private pan: { x: number; y: number; scrollX: number; scrollY: number; moved: boolean } | null = null;
  private leftDown = false;
  // Held Space turns a left drag into a pan; the page tells the scene, since the scene ignores the keyboard.
  space = false;
  ready = false;
  onReady: () => void = () => {};
  events2: CanvasEvents | null = null;
  pointerWorld: Vec2 | null = null;

  constructor() {
    super('level-editor');
  }

  create(): void {
    makeArt(this);
    this.cameras.main.setBackgroundColor(0x0b0a10);
    this.overlay = this.add.graphics().setDepth(1e9);
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.85 : 1 / 0.85), 0.15, 6));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const e = p.event as MouseEvent;
      if (p.button !== 0 || this.space) {
        const cam = this.cameras.main;
        this.pan = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY, moved: false };
        return;
      }
      this.leftDown = true;
      this.events2?.down(this.world(p), { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey });
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerWorld = this.world(p);
      if (this.pan) {
        const cam = this.cameras.main;
        if (Math.hypot(p.x - this.pan.x, p.y - this.pan.y) > PAN_SLOP) this.pan.moved = true;
        cam.scrollX = this.pan.scrollX - (p.x - this.pan.x) / cam.zoom;
        cam.scrollY = this.pan.scrollY - (p.y - this.pan.y) / cam.zoom;
        return;
      }
      this.events2?.move(this.pointerWorld);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.pan) {
        if (!this.pan.moved && p.button !== 0) this.events2?.rightClick(this.world(p));
        this.pan = null;
        return;
      }
      if (!this.leftDown) return;
      this.leftDown = false;
      this.events2?.up(this.world(p));
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('gameout', () => (this.pointerWorld = null));
    this.ready = true;
    this.onReady();
  }

  private world(p: Phaser.Input.Pointer): Vec2 {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return toWorld(w.x, w.y);
  }

  setMap(map: AreaMap): void {
    this.view?.destroy();
    this.view = new MapView(this, map);
    this.view.render();
    // Markers have no art in play; here they show as a see-through stand-in so they can be found and grabbed.
    this.marks.forEach((m) => m.destroy());
    this.marks = [];
    for (const o of map.objects) {
      const key = o.asset.marker === 'playerStart' ? 'hero' : o.asset.marker === 'shadeSpawn' ? 'shade_0' : '';
      if (!key || o.asset.parts.length) continue;
      const s = toScreen(o.x, o.y);
      this.marks.push(this.add.image(s.x, s.y, key).setOrigin(0.5, 1).setScale(render.pixelScale).setAlpha(0.55).setDepth(s.y));
    }
  }

  // A see-through copy of the asset about to be placed, under the cursor.
  setGhost(asset: Asset | null, x: number, y: number, size: number): void {
    this.ghost.forEach((g) => g.destroy());
    this.ghost = [];
    if (!asset) return;
    const px = render.pixelScale;
    const s = toScreen(x, y);
    for (const part of asset.parts) {
      this.ghost.push(this.add.image(s.x + part.x * px * size, s.y + part.y * px * size, part.texture)
        .setOrigin(part.originX, part.originY).setScale(px * part.scale * size).setAlpha(0.5).setDepth(1e8));
    }
  }

  // Centres the view on a world point.
  look(x: number, y: number, zoom?: number): void {
    const cam = this.cameras.main;
    if (zoom) cam.setZoom(zoom);
    const s = toScreen(x, y);
    cam.centerOn(s.x, s.y);
  }

  viewCenter(): Vec2 {
    const cam = this.cameras.main;
    const c = cam.getWorldPoint(cam.width / 2, cam.height / 2);
    return toWorld(c.x, c.y);
  }

  update(): void {
    // Lights flicker and the map's darkness follows the view.
    this.view?.render();
    this.overlay.clear();
    this.events2?.overlay(this.overlay);
  }
}

export class MapCanvas {
  private scene = new EditorScene();
  game!: Phaser.Game;
  readonly ready = new Promise<void>((done) => (this.scene.onReady = done));

  constructor(readonly host: HTMLElement, events: CanvasEvents) {
    this.scene.events2 = events;
    // WebGL cannot start on a canvas of size 0, which is what the host has while the page is hidden or still laying
    // out, so the game starts once the host has a real size.
    const start = () => {
      if (this.game || !host.clientWidth || !host.clientHeight) return;
      observer.disconnect();
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        backgroundColor: '#0b0a10',
        pixelArt: true,
        roundPixels: true,
        // Starts at the host's size and follows it when the window resizes.
        scale: { mode: Phaser.Scale.RESIZE, width: host.clientWidth, height: host.clientHeight },
        // The page handles keys, so typing in the side panels never reaches the map.
        input: { keyboard: false },
        scene: [this.scene],
      });
    };
    const observer = new ResizeObserver(start);
    observer.observe(host);
    start();
  }

  setMap(map: AreaMap): void {
    if (this.scene.ready) this.scene.setMap(map);
  }

  setGhost(asset: Asset | null, x = 0, y = 0, size = 1): void {
    if (this.scene.ready) this.scene.setGhost(asset, x, y, size);
  }

  look(x: number, y: number, zoom?: number): void {
    if (this.scene.ready) this.scene.look(x, y, zoom);
  }

  viewCenter(): Vec2 {
    return this.scene.viewCenter();
  }

  set space(held: boolean) {
    this.scene.space = held;
  }

  get pointer(): Vec2 | null {
    return this.scene.pointerWorld;
  }

  get zoom(): number {
    return this.scene.cameras.main.zoom;
  }

  // A texture's size in art pixels, for working out what the cursor is over.
  textureSize(key: string): { width: number; height: number } | null {
    if (!this.game.textures.exists(key)) return null;
    const f = this.game.textures.getFrame(key);
    return { width: f.cutWidth, height: f.cutHeight };
  }
}
