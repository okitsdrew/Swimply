import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen } from '../core/iso';
import { DevMenu } from '../dev/DevMenu';

const COLORS = [0x17151d, 0x19161f, 0x1b1822, 0x15131a];
const SIZE = 24;

// Phase 0 placeholder: an iso floor drawn from the live render config, so the dev menu, the config store and the
// projection are all visibly connected. Replaced by the real scenes in the next phases.
export class BootScene extends Phaser.Scene {
  private floor!: Phaser.GameObjects.Graphics;
  private lastKey = '';
  private p = [toScreen(0, 0), toScreen(0, 0), toScreen(0, 0), toScreen(0, 0)];

  constructor() {
    super('boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0b0a10);
    this.floor = this.add.graphics().setDepth(-1);
    this.add
      .text(0, 0, 'Swimply\nfoundation\n\n` opens the dev menu.\nTry render > tile size.', { fontFamily: 'monospace', fontSize: '16px', color: '#f2d7a6', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setPosition(this.scale.width / 2, 60);
    DevMenu.get();
    const centre = toScreen((SIZE * render.tileSize) / 2, (SIZE * render.tileSize) / 2);
    this.cameras.main.centerOn(centre.x, centre.y);
  }

  update(): void {
    const key = `${render.tileSize},${render.isoScale}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const t = render.tileSize;
    const g = this.floor;
    g.clear();
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        toScreen(x * t, y * t, this.p[0]);
        toScreen((x + 1) * t, y * t, this.p[1]);
        toScreen((x + 1) * t, (y + 1) * t, this.p[2]);
        toScreen(x * t, (y + 1) * t, this.p[3]);
        g.fillStyle(COLORS[(x * 7 + y * 13) % COLORS.length], 1).fillPoints(this.p, true);
      }
    }
    // Keep the middle of the floor in view when the size changes.
    const c = toScreen((SIZE * t) / 2, (SIZE * t) / 2);
    this.cameras.main.centerOn(c.x, c.y);
  }
}
