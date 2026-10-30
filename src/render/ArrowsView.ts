import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen } from '../core/iso';
import { Arrow, Arrows } from '../sim/Arrows';
import { Tex } from './art';
import { Fx } from './Fx';

interface Visual {
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  // Distance already travelled when the last trail wisp was shed.
  trail: number;
}

const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

// Draws the sim's arrows: a bolt, a purple glow, and shadowy wisps shed behind it. Reads the sim, never changes it.
export class ArrowsView {
  private visuals = new Map<Arrow, Visual>();

  constructor(private scene: Phaser.Scene, private arrows: Arrows, private fx: Fx) {
    arrows.onSpawn = (a) => {
      const v = this.visual(a);
      v.trail = 0;
      v.sprite.setVisible(true).setAlpha(1);
      v.glow.setVisible(true);
    };
    arrows.onRelease = (a) => {
      const v = this.visuals.get(a);
      v?.sprite.setVisible(false);
      v?.glow.setVisible(false);
    };
  }

  private visual(a: Arrow): Visual {
    let v = this.visuals.get(a);
    if (!v) {
      v = {
        sprite: this.scene.add.image(0, 0, Tex.arrow).setVisible(false),
        glow: this.scene.add.image(0, 0, Tex.glow).setTint(0x8a3fe0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        trail: 0,
      };
      this.visuals.set(a, v);
    }
    return v;
  }

  render(): void {
    const height = render.arrowHeight;
    for (const a of this.arrows.pool.items) {
      if (!a.active) continue;
      const v = this.visual(a);
      toScreen(a.x, a.y, screen);
      toScreen(a.x + a.dirX, a.y + a.dirY, ahead);
      const remaining = 1 - a.traveled / a.range;
      v.sprite
        .setPosition(screen.x, screen.y - height)
        .setRotation(Math.atan2(ahead.y - screen.y, ahead.x - screen.x))
        .setScale(render.arrowScale * a.size)
        .setAlpha(Math.min(1, remaining * 6))
        .setDepth(screen.y);
      v.glow
        .setPosition(screen.x, screen.y - height)
        .setScale(render.arrowScale * 0.3 * a.size)
        .setAlpha(Math.min(1, remaining * 6) * 0.7)
        .setDepth(screen.y - 0.1);

      // Shadowy wisps shed behind the bolt.
      while (a.traveled - v.trail >= 14) {
        v.trail += 14;
        this.fx.particle({
          x: screen.x - (ahead.x - screen.x) * 12 + (Math.random() - 0.5) * 6,
          y: screen.y - height - (ahead.y - screen.y) * 12 + (Math.random() - 0.5) * 6,
          life: 0.25 + Math.random() * 0.2,
          from: 0.3,
          to: 0.05,
          alpha: 0.8,
          tint: 0x7a2fd0,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          depth: screen.y - 0.2,
        });
      }
    }
  }
}
