import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen, Vec2 } from '../core/iso';
import { AreaMap } from '../data/maps';

const FLOOR_DEPTH = -1e9;

// Draws a map: its floor tiles as one flat layer, and every placed asset's parts as sprites. Ground parts sit just
// above the floor; the rest are depth-sorted by their ground point, like characters, so a Shade walking behind a
// pillar is hidden by it. Markers have no parts, so nothing of them shows in play.
export class MapView {
  private floor: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Image[] = [];
  private p: Vec2[] = [toScreen(0, 0), toScreen(0, 0), toScreen(0, 0), toScreen(0, 0)];
  private key = '';

  constructor(private scene: Phaser.Scene, private map: AreaMap) {
    this.floor = scene.add.graphics().setDepth(FLOOR_DEPTH);
  }

  // Redraws only when a look value it depends on changes in the dev menu.
  render(): void {
    const key = `${render.isoScale},${render.pixelScale}`;
    if (key === this.key) return;
    this.key = key;
    this.drawFloor();
    this.placeSprites();
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
    g.lineStyle(3, 0x3a3350, 1).strokePoints([toScreen(0, 0), toScreen(w, 0), toScreen(w, h), toScreen(0, h)], true);
  }

  private placeSprites(): void {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.length = 0;
    const px = render.pixelScale;
    for (const o of this.map.objects) {
      const s = toScreen(o.x, o.y);
      for (const part of o.asset.parts) {
        const img = this.scene.add
          .image(s.x + part.x * px * o.size, s.y + part.y * px * o.size, part.texture)
          .setOrigin(part.originX, part.originY)
          .setScale(px * part.scale * o.size)
          .setDepth(part.ground ? FLOOR_DEPTH + 1 : s.y);
        this.sprites.push(img);
      }
    }
  }
}
