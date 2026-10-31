import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen, Vec2 } from '../core/iso';
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
  private floor: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private lights: PlacedLight[] = [];
  private dark: Phaser.GameObjects.RenderTexture | null = null;
  private stamp: Phaser.GameObjects.Image;
  private time = 0;
  private p: Vec2[] = [toScreen(0, 0), toScreen(0, 0), toScreen(0, 0), toScreen(0, 0)];
  private key = '';

  // `edge` draws a line round the map, which the tools want and the game does not.
  constructor(private scene: Phaser.Scene, private map: AreaMap, private edge = true) {
    this.floor = scene.add.graphics().setDepth(FLOOR_DEPTH);
    this.stamp = scene.make.image({ key: Tex.light, add: false });
  }

  // The floor and sprites are redrawn only when a look value they depend on changes in the dev menu. Lights flicker
  // and the darkness follows the camera, so those are drawn every frame.
  render(dt = this.scene.game.loop.delta / 1000): void {
    const key = `${render.isoScale},${render.pixelScale}`;
    if (key !== this.key) {
      this.key = key;
      this.drawFloor();
      this.placeSprites();
    }
    this.time += Math.min(dt, 0.25);
    this.drawLights();
  }

  // Draws again on the next render(), for when the map or the art under it changed (the asset maker's preview).
  redraw(): void {
    this.key = '';
  }

  destroy(): void {
    this.floor.destroy();
    this.sprites.forEach((s) => s.destroy());
    this.sprites.length = 0;
    this.lights.forEach((l) => l.glow.destroy());
    this.lights.length = 0;
    this.dark?.destroy();
    this.stamp.destroy();
  }

  private drawFloor(): void {
    const m = this.map;
    const t = m.tileSize;
    const g = this.floor;
    g.clear();
    for (let row = 0; row < m.rows; row++) {
      for (let col = 0; col < m.cols; col++) {
        const f = m.tiles[row * m.cols + col];
        toScreen(col * t, row * t, this.p[0]);
        toScreen((col + 1) * t, row * t, this.p[1]);
        toScreen((col + 1) * t, (row + 1) * t, this.p[2]);
        toScreen(col * t, (row + 1) * t, this.p[3]);
        g.fillStyle(f.colors[(col * 7 + row * 13) % f.colors.length], 1).fillPoints(this.p, true);
      }
    }
    const w = m.cols * t;
    const h = m.rows * t;
    if (this.edge) g.lineStyle(3, 0x3a3350, 1).strokePoints([toScreen(0, 0), toScreen(w, 0), toScreen(w, h), toScreen(0, h)], true);
  }

  private placeSprites(): void {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.length = 0;
    this.lights.forEach((l) => l.glow.destroy());
    this.lights.length = 0;
    const px = render.pixelScale;
    for (const o of this.map.objects) {
      const s = toScreen(o.x, o.y);
      for (const part of o.asset.parts) {
        const spr = this.scene.add
          .sprite(s.x + part.x * px * o.size, s.y + part.y * px * o.size, part.texture)
          .setOrigin(part.originX, part.originY)
          .setScale(px * part.scale * o.size)
          .setDepth(part.ground ? FLOOR_DEPTH + 1 : s.y);
        const anim = this.animation(part.frames ?? [], part.fps);
        // Each copy starts on a different frame, so a row of torches does not flicker in step.
        if (anim) spr.play({ key: anim, startFrame: Math.floor(Math.random() * part.frames.length) });
        this.sprites.push(spr);
      }
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
