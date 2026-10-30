import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen } from '../core/iso';
import { Dummies, Dummy } from '../sim/Dummies';
import { Tex } from './art';

interface Visual {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

const screen = { x: 0, y: 0 };

export class DummiesView {
  private visuals = new Map<Dummy, Visual>();

  constructor(private scene: Phaser.Scene, private dummies: Dummies) {}

  render(): void {
    const px = render.pixelScale;
    // Dummies cleared from the sim leave their sprites behind otherwise.
    for (const [d, v] of this.visuals) {
      if (this.dummies.list.includes(d)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      this.visuals.delete(d);
    }
    for (const d of this.dummies.list) {
      let v = this.visuals.get(d);
      if (!v) {
        v = { sprite: this.scene.add.image(0, 0, Tex.dummy).setOrigin(0.5, 1), shadow: this.scene.add.image(0, 0, Tex.shadow) };
        this.visuals.set(d, v);
      }
      toScreen(d.x, d.y, screen);
      v.sprite.setVisible(d.alive).setPosition(screen.x, screen.y).setScale(px).setDepth(screen.y);
      v.shadow.setVisible(d.alive).setPosition(screen.x, screen.y).setScale(px * 0.9, px * 0.35).setDepth(screen.y - 1000);
      if (d.flash > 0) v.sprite.setTintFill(0xffffff);
      else v.sprite.clearTint();
    }
  }
}
