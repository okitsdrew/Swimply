import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen } from '../core/iso';

// A small "F" over the hero's head while something next to him can be interacted with.
export class InteractHint {
  private text: Phaser.GameObjects.Text;
  private shown = 0;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add.text(0, 0, 'F', {
      fontFamily: 'monospace',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#f2d7a6',
      stroke: '#1a1020',
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(1.5e7).setAlpha(0);
  }

  // Call every frame with the hero's world position and whether the hint should show.
  update(dt: number, x: number, y: number, on: boolean): void {
    this.shown = Phaser.Math.Clamp(this.shown + (on ? dt : -dt) * 8, 0, 1);
    const s = toScreen(x, y);
    const bob = Math.sin(performance.now() / 250) * 2;
    this.text.setPosition(s.x, s.y - 34 * render.pixelScale + bob).setAlpha(this.shown);
  }
}
