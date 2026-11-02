import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { Light } from '../data/assets';
import { AreaMap } from '../data/maps';
import { Tex } from './art';

const FLOOR_DEPTH = -1e9;
// Above everything in the world, under the debug drawing and the HUD.
const DARK_DEPTH = 5e6;
// The darkness reaches this far past the edges of the view, so it still covers them when the camera moves after
// it was drawn this frame.
const DARK_MARGIN = 96;
// The light texture is this many pixels across.
const GLOW_SIZE = 128;
// The floor is baked into pictures this many art pixels square, so the screen only draws the pictures. Their edges
// are straight lines on screen, so neighbouring pictures meet exactly, with no seam along a tile's slanted edge.
const CHUNK = 512;
// Long things (walls) are drawn as upright strips this many art pixels wide, each sorted on its own.
const STRIP = 4;
// Roofs sit over everything standing in the world (they are as high as the walls), under the lights and darkness.
const ROOF_DEPTH = DARK_DEPTH - 2;
// How fast the see-through fades in and out, per second.
const FADE_SPEED = 6;

// A map sprite's box on screen, for fading it when it stands in front of the hero.
interface Fader {
  spr: Phaser.GameObjects.Sprite;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PlacedLight {
  x: number;
  y: number;
  radius: number;
  light: Light;
  glow: Phaser.GameObjects.Image;
  seed: number;
}

// Draws a map: its floor tiles as one flat layer, and every placed asset's parts as sprites. Ground parts sit just
// above the floor; the rest are depth-sorted by their ground point, like characters, so a Shade walking behind a
// pillar is hidden by it. Markers have no parts, so nothing of them shows in play. A part with frames plays them in
// a loop. An asset with a light gets a soft additive glow, and if the map has darkness, the light shows through it.
export class MapView {
  // Draws tiles for baking only; it is never shown.
  private floor: Phaser.GameObjects.Graphics;
  private floorChunks: Phaser.GameObjects.RenderTexture[] = [];
  // Roof tiles baked like the floor, lifted to the wall tops. Touching roof tiles make one building, which fades as
  // a whole while the hero is under it. `building` holds each tile's building number, or -1 where there is no roof.
  private roofs: { chunks: Phaser.GameObjects.RenderTexture[]; alpha: number }[] = [];
  private building = new Int32Array(0);
  private faders: Fader[] = [];
  // The hero, in world units, when a game is showing this map (the tools leave it null: nothing fades there).
  private viewer: Vec2 | null = null;
  private edgeLine: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private lights: PlacedLight[] = [];
  private dark: Phaser.GameObjects.RenderTexture | null = null;
  private stamp: Phaser.GameObjects.Image;
  private time = 0;
  private p: Vec2[] = [toScreen(0, 0), toScreen(0, 0), toScreen(0, 0), toScreen(0, 0)];
  private key = '';

  // `edge` draws a line round the map, which the tools want and the game does not.
  constructor(private scene: Phaser.Scene, private map: AreaMap, private edge = true) {
    this.floor = scene.make.graphics({}, false);
    this.edgeLine = scene.add.graphics().setDepth(FLOOR_DEPTH + 0.5);
    this.stamp = scene.make.image({ key: Tex.light, add: false });
  }

  // The floor and sprites are redrawn only when a look value they depend on changes in the dev menu. Lights flicker
  // and the darkness follows the camera, so those are drawn every frame.
  render(dt = this.scene.game.loop.delta / 1000): void {
    const key = `${render.isoScale},${render.pixelScale},${render.roofHeight}`;
    if (key !== this.key) {
      this.key = key;
      this.drawFloor();
      this.placeSprites();
    }
    this.time += Math.min(dt, 0.25);
    this.seeThrough(Math.min(dt, 0.25));
    this.drawLights();
  }

  // Where the hero stands this frame. Roofs and walls in front of him turn see-through.
  reveal(x: number, y: number): void {
    this.viewer = { x, y };
  }

  // Draws again on the next render(), for when the map or the art under it changed (the asset maker's preview).
  redraw(): void {
    this.key = '';
  }

  destroy(): void {
    this.floor.destroy();
    this.floorChunks.forEach((c) => c.destroy());
    this.floorChunks.length = 0;
    this.clearRoofs();
    this.edgeLine.destroy();
    this.sprites.forEach((s) => s.destroy());
    this.sprites.length = 0;
    this.lights.forEach((l) => l.glow.destroy());
    this.lights.length = 0;
    this.dark?.destroy();
    this.stamp.destroy();
  }

  // A 64 by 64 map has 4,096 tiles, far too many to draw shape by shape every frame. So the floor is drawn once into
  // pictures at art-pixel size (one texture pixel per art pixel, scaled up like the sprites), and only the pictures
  // are drawn after that, which costs the same however big the map is.
  private drawFloor(): void {
    const m = this.map;
    this.floorChunks.forEach((c) => c.destroy());
    this.floorChunks = this.bake(
      m.tiles.map((_, i) => i),
      0,
      FLOOR_DEPTH,
      (g, f, col, row) => g.fillStyle(f.roof ? 0x000000 : f.colors[(col * 7 + row * 13) % f.colors.length], 1).fillPoints(this.p, true),
    );
    this.bakeRoofs();
    const w = m.cols * m.tileSize;
    const h = m.rows * m.tileSize;
    this.edgeLine.clear();
    if (this.edge) this.edgeLine.lineStyle(3, 0x3a3350, 1).strokePoints([toScreen(0, 0), toScreen(w, 0), toScreen(w, h), toScreen(0, h)], true);
  }

  // Draws tiles (by index) into pictures CHUNK art pixels square, lifted by `lift` art pixels, and adds them to the
  // scene at `depth`. `paint` draws one tile, whose corners are in this.p.
  private bake(
    tiles: number[],
    lift: number,
    depth: number,
    paint: (g: Phaser.GameObjects.Graphics, f: AreaMap['tiles'][number], col: number, row: number) => void,
  ): Phaser.GameObjects.RenderTexture[] {
    const m = this.map;
    const t = m.tileSize;
    const px = render.pixelScale;
    const cells = new Map<string, { cx: number; cy: number; tiles: number[]; x0: number; y0: number; x1: number; y1: number }>();
    for (const i of tiles) {
      const col = i % m.cols;
      const row = (i - col) / m.cols;
      // The tile's box on screen in art pixels, with a pixel to spare for edge lines.
      const x0 = toScreen(col * t, (row + 1) * t).x / px - 1;
      const x1 = toScreen((col + 1) * t, row * t).x / px + 1;
      const y0 = toScreen(col * t, row * t).y / px - lift - 1;
      const y1 = toScreen((col + 1) * t, (row + 1) * t).y / px - lift + 1;
      for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
        for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
          const key = `${cx},${cy}`;
          let c = cells.get(key);
          if (!c) cells.set(key, (c = { cx, cy, tiles: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
          c.tiles.push(i);
          c.x0 = Math.min(c.x0, x0);
          c.y0 = Math.min(c.y0, y0);
          c.x1 = Math.max(c.x1, x1);
          c.y1 = Math.max(c.y1, y1);
        }
      }
    }
    const g = this.floor;
    const out: Phaser.GameObjects.RenderTexture[] = [];
    for (const c of cells.values()) {
      // The picture covers only its own square (so pictures never overlap), trimmed to the tiles in it. Its sides are
      // kept to even numbers, because Phaser stretches an odd-sized picture to even, which would overlap its neighbour.
      const even = (v: number, up: boolean) => (up ? Math.ceil(v / 2) : Math.floor(v / 2)) * 2;
      const left = Math.max(c.cx * CHUNK, even(c.x0, false));
      const top = Math.max(c.cy * CHUNK, even(c.y0, false));
      const right = Math.min((c.cx + 1) * CHUNK, even(c.x1, true));
      const bottom = Math.min((c.cy + 1) * CHUNK, even(c.y1, true));
      g.clear();
      for (const i of c.tiles) {
        const col = i % m.cols;
        const row = (i - col) / m.cols;
        this.corner(0, col * t, row * t, left, top + lift);
        this.corner(1, (col + 1) * t, row * t, left, top + lift);
        this.corner(2, (col + 1) * t, (row + 1) * t, left, top + lift);
        this.corner(3, col * t, (row + 1) * t, left, top + lift);
        paint(g, m.tiles[i], col, row);
      }
      const rt = this.scene.add
        .renderTexture(left * px, top * px, right - left, bottom - top)
        .setOrigin(0, 0)
        .setScale(px)
        .setDepth(depth);
      rt.draw(g);
      out.push(rt);
    }
    return out;
  }

  private isRoof(col: number, row: number): boolean {
    const m = this.map;
    return col >= 0 && row >= 0 && col < m.cols && row < m.rows && m.tiles[row * m.cols + col].roof;
  }

  private clearRoofs(): void {
    this.roofs.forEach((r) => r.chunks.forEach((c) => c.destroy()));
    this.roofs.length = 0;
  }

  // Numbers the buildings: every roof tile gets the number of the patch of touching roof tiles it belongs to.
  private findBuildings(): number {
    const m = this.map;
    const b = (this.building = new Int32Array(m.cols * m.rows).fill(-1));
    let n = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] !== -1 || !m.tiles[i].roof) continue;
      const todo = [i];
      b[i] = n;
      while (todo.length) {
        const j = todo.pop()!;
        const col = j % m.cols;
        const row = (j - col) / m.cols;
        for (const [c, r] of [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]]) {
          if (this.isRoof(c, r) && b[r * m.cols + c] === -1) {
            b[r * m.cols + c] = n;
            todo.push(r * m.cols + c);
          }
        }
      }
      n++;
    }
    return n;
  }

  // Roof tiles, baked like the floor but lifted by roofHeight, with a dark rim on every edge that is not against more
  // roof, so each building's top reads as one slab. Each building gets its own pictures, so it can fade on its own.
  private bakeRoofs(): void {
    this.clearRoofs();
    const count = this.findBuildings();
    const tiles: number[][] = Array.from({ length: count }, () => []);
    this.building.forEach((n, i) => n !== -1 && tiles[n].push(i));
    for (const list of tiles) {
      const chunks = this.bake(list, Math.round(render.roofHeight), ROOF_DEPTH, (g, f, col, row) => {
        const c = f.colors[(col * 7 + row * 13) % f.colors.length];
        g.fillStyle(c, 1).fillPoints(this.p, true);
        g.lineStyle(1, Phaser.Display.Color.IntegerToColor(c).darken(45).color, 1);
        const edge = (a: number, b: number) => g.lineBetween(this.p[a].x, this.p[a].y, this.p[b].x, this.p[b].y);
        if (!this.isRoof(col, row - 1)) edge(0, 1);
        if (!this.isRoof(col + 1, row)) edge(1, 2);
        if (!this.isRoof(col, row + 1)) edge(2, 3);
        if (!this.isRoof(col - 1, row)) edge(3, 0);
      });
      this.roofs.push({ chunks, alpha: 1 });
    }
  }

  // Which building's roof covers this point on the screen, or -1.
  private roofAt(sx: number, sy: number): number {
    const w = toWorld(sx, sy + render.roofHeight * render.pixelScale);
    const t = this.map.tileSize;
    const col = Math.floor(w.x / t);
    const row = Math.floor(w.y / t);
    return this.isRoof(col, row) ? this.building[row * this.map.cols + col] : -1;
  }

  // Fades map sprites drawn over the hero (a wall he walks behind), and the roof of a building he is under.
  private seeThrough(dt: number): void {
    const v = this.viewer;
    const k = Math.min(1, dt * FADE_SPEED);
    if (!v) return;
    const s = toScreen(v.x, v.y);
    // The hero's box on screen, a little wider than him.
    const x0 = s.x - 16;
    const x1 = s.x + 16;
    const y0 = s.y - 40;
    const y1 = s.y;
    const fade = (alpha: number, want: number) => (Math.abs(alpha - want) < 0.01 ? want : alpha + (want - alpha) * k);
    for (const f of this.faders) {
      const over = f.spr.depth > s.y && f.x1 > x0 && f.x0 < x1 && f.y1 > y0 && f.y0 < y1;
      const want = over ? render.seeThrough : 1;
      if (f.spr.alpha !== want) f.spr.setAlpha(fade(f.spr.alpha, want));
    }
    const under = [this.roofAt(s.x, s.y - 6), this.roofAt(s.x, s.y - 34)];
    this.roofs.forEach((r, n) => {
      const want = under.includes(n) ? render.seeThrough : 1;
      if (r.alpha === want) return;
      r.alpha = fade(r.alpha, want);
      r.chunks.forEach((c) => c.setAlpha(r.alpha));
    });
  }

  // One corner of a tile, in art pixels from a chunk's top-left corner.
  private corner(i: number, x: number, y: number, left: number, top: number): void {
    const p = toScreen(x, y, this.p[i]);
    const px = render.pixelScale;
    p.x = p.x / px - left;
    p.y = p.y / px - top;
  }

  private placeSprites(): void {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.length = 0;
    this.lights.forEach((l) => l.glow.destroy());
    this.lights.length = 0;
    this.faders.length = 0;
    const px = render.pixelScale;
    for (const o of this.map.objects) {
      const s = toScreen(o.x, o.y);
      const line = this.groundLine(o.x, o.y, o.asset.collision, o.size);
      o.asset.parts.forEach((part, i) => {
        // Parts of one asset keep their order: a later part (flowers in a planter) is drawn over an earlier one.
        const order = i * 0.001;
        const make = () =>
          this.scene.add
            .sprite(s.x + part.x * px * o.size, s.y + part.y * px * o.size, part.texture)
            .setOrigin(part.originX, part.originY)
            .setScale(px * part.scale * o.size);
        const spr = make().setDepth(part.ground ? FLOOR_DEPTH + 1 + order : s.y + order);
        const fw = spr.frame.width * spr.scaleX;
        const fh = spr.frame.height * spr.scaleY;
        const fx = spr.x - part.originX * fw;
        const fy = spr.y - part.originY * fh;
        let full = !part.ground;
        const anim = this.animation(part.frames ?? [], part.fps);
        if (anim) {
          // Each copy starts on a different frame, so a row of torches does not flicker in step.
          spr.play({ key: anim, startFrame: Math.floor(Math.random() * part.frames.length) });
        } else if (line && !part.ground) {
          // One depth for a long wall is wrong at its ends: something just behind its far end is lower on screen than
          // the wall's middle, so it was drawn in front. Each strip is sorted by the wall's base where it stands.
          const w = spr.frame.width;
          const h = spr.frame.height;
          const scale = spr.scaleX;
          const left = spr.x - part.originX * w * scale;
          for (let x = 0; x < w; x += STRIP) {
            const strip = x === 0 ? spr : make();
            const mid = left + (x + Math.min(STRIP, w - x) / 2) * scale;
            strip.setCrop(x, 0, Math.min(STRIP, w - x), h).setDepth(this.lineDepth(line, mid) + order);
            if (strip !== spr) this.sprites.push(strip);
            this.faders.push({ spr: strip, x0: left + x * scale, y0: fy, x1: left + (x + Math.min(STRIP, w - x)) * scale, y1: fy + fh });
          }
          full = false;
        }
        if (full) this.faders.push({ spr, x0: fx, y0: fy, x1: fx + fw, y1: fy + fh });
        this.sprites.push(spr);
      });
      const l = o.asset.light;
      if (!l) continue;
      const x = s.x + l.x * px * o.size;
      const y = s.y + l.y * px * o.size;
      const glow = this.scene.add.image(x, y, Tex.light).setTint(parseInt(l.color.slice(1), 16)).setBlendMode(Phaser.BlendModes.ADD);
      // Over the whole world, so it lights the walls beside it and anyone who walks up to it.
      glow.setDepth(DARK_DEPTH - 1);
      this.lights.push({ x, y, radius: l.radius * px * o.size, light: l, glow, seed: this.lights.length * 7.3 + o.x * 0.01 });
    }
  }

  // For an asset with two or more collision circles, the screen line between the two furthest apart: its base. Null
  // for a single circle or none, which sort by their ground point as before.
  private groundLine(x: number, y: number, circles: { x: number; y: number }[], size: number): [Vec2, Vec2] | null {
    let best: [Vec2, Vec2] | null = null;
    let far = 0;
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d <= far) continue;
        far = d;
        best = [toScreen(x + a.x * size, y + a.y * size), toScreen(x + b.x * size, y + b.y * size)];
      }
    }
    return best;
  }

  // The line's height on screen at screen x, held level past its ends.
  private lineDepth([a, b]: [Vec2, Vec2], x: number): number {
    if (Math.abs(b.x - a.x) < 1) return Math.max(a.y, b.y);
    const t = Phaser.Math.Clamp((x - a.x) / (b.x - a.x), 0, 1);
    return a.y + (b.y - a.y) * t;
  }

  // One animation per list of frames and speed, shared by every map that uses it. Frames with no texture are left
  // out, so a sprite deleted in the asset maker does not break the map.
  private animation(frames: string[], fps: number): string {
    const keys = frames.filter((f) => this.scene.textures.exists(f));
    if (keys.length < 2) return '';
    const key = `${keys.join('+')}@${fps}`;
    const anims = this.scene.anims;
    if (!anims.exists(key)) anims.create({ key, frames: keys.map((k) => ({ key: k })), frameRate: Math.max(fps, 0.1), repeat: -1 });
    return key;
  }

  // How bright a light is right now, around 1: a few slow waves added together, so a flame wavers without a pattern.
  private flicker(l: PlacedLight): number {
    const f = l.light.flicker;
    if (!f) return 1;
    const t = this.time + l.seed;
    const wave = Math.sin(t * 7.1) * 0.5 + Math.sin(t * 13.3 + 1.7) * 0.3 + Math.sin(t * 23.9 + 4.1) * 0.2;
    return 1 + wave * f * 0.5;
  }

  private drawLights(): void {
    for (const l of this.lights) {
      const k = this.flicker(l);
      l.glow.setScale((l.radius * 2 * (0.95 + 0.05 * k)) / GLOW_SIZE).setAlpha(Phaser.Math.Clamp(l.light.intensity * k, 0, 1));
    }
    this.drawDarkness();
  }

  // A sheet of black over the view, with a soft hole cut at every light. Only as big as the view, so a huge map
  // costs no more than a small one.
  private drawDarkness(): void {
    const amount = this.map.darkness ?? 0;
    if (amount <= 0) {
      this.dark?.setVisible(false);
      return;
    }
    const v = this.scene.cameras.main.worldView;
    const w = Math.ceil(v.width + DARK_MARGIN * 2);
    const h = Math.ceil(v.height + DARK_MARGIN * 2);
    if (!this.dark) this.dark = this.scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setDepth(DARK_DEPTH);
    else if (this.dark.width !== w || this.dark.height !== h) this.dark.resize(w, h);
    const left = v.x - DARK_MARGIN;
    const top = v.y - DARK_MARGIN;
    const dark = this.dark.setVisible(true).setPosition(left, top);
    dark.clear().fill(0x000000, Phaser.Math.Clamp(amount, 0, 1));
    for (const l of this.lights) {
      const k = this.flicker(l);
      // The hole is a little wider than the glow, so the light's edge fades into the dark instead of a ring.
      this.stamp.setPosition(l.x - left, l.y - top).setScale((l.radius * 2.6 * k) / GLOW_SIZE).setAlpha(Phaser.Math.Clamp(k, 0, 1));
      dark.erase(this.stamp);
    }
  }
}
