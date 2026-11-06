import Phaser from 'phaser';
import { ui, uiText } from './ui';

// A boss's big named health bar, pinned to the screen just under the run's clock. Shared by every boss.
export class BossBar {
  private bar: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, label: string) {
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(2e7);
    this.name = scene.add.text(0, 0, label, uiText(16)).setOrigin(0.5, 1).setScrollFactor(0).setDepth(2e7).setVisible(false);
  }

  // `left` is the health left, 0 to 1; hidden when not shown.
  draw(width: number, show: boolean, left: number): void {
    const g = this.bar.clear();
    this.name.setVisible(show);
    if (!show) return;
    const bw = Math.min(480, width * 0.5);
    const x = Math.round((width - bw) / 2);
    const y = 92;
    this.name.setPosition(width / 2, y - 8);
    const k = Math.max(0, Math.min(1, left));
    g.fillStyle(ui.ink, 1).fillRect(x - 6, y - 6, bw + 12, 24);
    g.fillStyle(ui.mid, 1).fillRect(x - 3, y - 3, bw + 6, 18);
    g.fillStyle(ui.deep, 1).fillRect(x, y, bw, 12);
    g.fillStyle(0x8a2030, 1).fillRect(x, y, Math.round(bw * k), 12);
    g.fillStyle(0xc04050, 1).fillRect(x, y, Math.round(bw * k), 3);
  }

  destroy(): void {
    this.bar.destroy();
    this.name.destroy();
  }
}
