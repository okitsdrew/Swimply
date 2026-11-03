import Phaser from 'phaser';
import { render } from '../config/render';
import { shade } from '../config/shade';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { Circle } from '../core/geometry';
import { Shade, Shades } from '../sim/Shades';
import { CollisionWorld } from '../sim/World';
import { shadeFrames, Tex } from './art';
import { Fx } from './Fx';

interface Visual {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  // The silhouette shown over walls, and how visible it is now (0 to 1).
  ghost: Phaser.GameObjects.Image;
  seen: number;
}

// Above every map sprite, below the HUD and the debug drawing.
const GHOST_DEPTH = 9e5;
const GHOST_TINT = 0x9fe8ff;
// How far round a Shade to look for something solid it is in or behind.
const COVER_RANGE = 70;
const nearby: Circle[] = [];

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

  // True if the Shade is inside something solid, or just behind it on screen (it sits further up the screen than a
  // solid circle close by), so the thing may be drawn over it.
  private covered(s: Shade, world: CollisionWorld): boolean {
    for (const c of world.near(s.x, s.y, COVER_RANGE, nearby)) {
      const inside = Math.hypot(c.x - s.x, c.y - s.y) < c.radius + s.radius * 0.5;
      // In front on screen (lower down) and overlapping it side to side.
      const inFront = c.x + c.y > s.x + s.y && Math.abs(c.x - c.y - (s.x - s.y)) < c.radius + s.radius;
      if (inside || inFront) return true;
    }
    return false;
  }

  render(dt: number, playerX: number, playerY: number, world: CollisionWorld): void {
    const px = render.pixelScale;
    const scale = px * shade.scale;
    for (const [s, v] of this.visuals) {
      if (this.shades.list.includes(s)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.ghost.destroy();
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
          ghost: this.scene.add.image(0, 0, shadeFrames[0]).setOrigin(0.5, 1).setTintFill(GHOST_TINT).setDepth(GHOST_DEPTH).setAlpha(0),
          seen: 0,
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
      const want = shade.throughWalls && this.covered(s, world) ? 1 : 0;
      v.seen += (want - v.seen) * Math.min(1, shade.ghostFade * dt);
      v.ghost.setVisible(v.seen > 0.01);
      if (v.seen > 0.01) {
        v.ghost.setTexture(v.sprite.texture.key).setPosition(v.sprite.x, v.sprite.y).setScale(scale).setFlipX(v.sprite.flipX).setAlpha(v.seen * shade.ghostAlpha);
      }
    }
  }

  clear(): void {
    for (const v of this.visuals.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
      v.ghost.destroy();
    }
    this.visuals.clear();
    this.marks.clear();
  }
}
