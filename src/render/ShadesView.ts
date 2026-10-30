import Phaser from 'phaser';
import { render } from '../config/render';
import { shade } from '../config/shade';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { Shade, Shades } from '../sim/Shades';
import { shadeFrames, Tex } from './art';
import { Fx } from './Fx';

interface Visual {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

const screen = { x: 0, y: 0 };

// Draws Shades and their spawn marks. A mark is a dark ring that closes in on the spot, so the player always
// sees where the next one will rise before it can hurt him.
export class ShadesView {
  private visuals = new Map<Shade, Visual>();
  private marks: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, private shades: Shades, private fx: Fx) {
    this.marks = scene.add.graphics().setDepth(-5e7);
  }

  // A puff as one rises from its mark.
  onRisen(s: Shade): void {
    toScreen(s.x, s.y, screen);
    this.fx.smoke(screen.x, screen.y - 6 * render.pixelScale, 6, 10);
  }

  // Smoke and a flash where one died.
  onKilled(x: number, y: number): void {
    const px = render.pixelScale;
    toScreen(x, y, screen);
    const cy = screen.y - 9 * px * shade.scale;
    this.fx.smoke(screen.x, cy, Math.round(shade.deathSmoke * shade.scale), 6 * px * shade.scale);
    if (shade.deathFlash > 0) {
      this.fx.particle({ x: screen.x, y: cy, life: 0.15, from: shade.deathFlash * shade.scale, to: 0, tint: 0xb9a4ff, depth: screen.y + 2 });
    }
  }

  render(playerX: number, playerY: number): void {
    const px = render.pixelScale;
    const scale = px * shade.scale;
    for (const [s, v] of this.visuals) {
      if (this.shades.list.includes(s)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      this.visuals.delete(s);
    }
    const g = this.marks;
    g.clear();
    for (const s of this.shades.list) {
      toScreen(s.x, s.y, screen);
      if (s.rising > 0) {
        const k = 1 - s.rising / Math.max(shade.spawnTell, 1e-4);
        const half = ellipseHalfSize(s.radius * (2.2 - 1.2 * k));
        const core = ellipseHalfSize(s.radius * k);
        g.lineStyle(2, 0x1f6e86, 0.4 + 0.6 * k).strokeEllipse(screen.x, screen.y, half.x * 2, half.y * 2);
        g.fillStyle(0x07000d, 0.35 + 0.5 * k).fillEllipse(screen.x, screen.y, core.x * 2, core.y * 2);
        continue;
      }
      let v = this.visuals.get(s);
      if (!v) {
        v = {
          sprite: this.scene.add.image(0, 0, shadeFrames[0]).setOrigin(0.5, 1),
          shadow: this.scene.add.image(0, 0, Tex.shadow),
        };
        this.visuals.set(s, v);
      }
      const bob = (Math.sin(s.phase) * 0.5 + 0.5) * shade.bobHeight * px;
      const frame = Math.floor((s.phase / Math.max(shade.bobSpeed, 1e-3)) * shade.hemFlicker) % 2;
      v.sprite
        .setTexture(shadeFrames[frame])
        .setPosition(screen.x, screen.y - bob)
        .setScale(scale)
        .setFlipX(toScreen(playerX - s.x, playerY - s.y).x < 0)
        .setDepth(screen.y);
      v.shadow.setPosition(screen.x, screen.y).setScale(scale * 0.9, scale * 0.35).setDepth(screen.y - 1000);
      if (s.flash > 0) v.sprite.setTintFill(0xffffff);
      else v.sprite.clearTint();
    }
  }

  clear(): void {
    for (const v of this.visuals.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
    }
    this.visuals.clear();
    this.marks.clear();
  }
}
