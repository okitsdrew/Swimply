import Phaser from 'phaser';

const DEPTH = 2.1e7;
const FADE = 0.25;

// A short line in a small bubble over someone's head, that says itself and fades away. It takes no input and stops
// nothing, so it can be said in the middle of a fight. Kept on screen even if the speaker is not.
export class Bark {
  private panel: Phaser.GameObjects.Graphics;
  private words: Phaser.GameObjects.Text;
  private left = 0;
  private total = 0;

  constructor(private scene: Phaser.Scene) {
    this.panel = scene.add.graphics().setDepth(DEPTH);
    this.words = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '16px', stroke: '#1a1020', strokeThickness: 3 }).setOrigin(0.5).setDepth(DEPTH).setVisible(false);
  }

  say(text: string, color: string, seconds: number): void {
    this.words.setText(text).setColor(color);
    this.left = this.total = seconds;
  }

  // Over the point (x, y) on screen, in world space.
  update(dt: number, x: number, y: number): void {
    this.panel.clear();
    this.left -= dt;
    const shown = this.left > 0;
    this.words.setVisible(shown);
    if (!shown) return;
    const a = Math.min(1, this.left / FADE, (this.total - this.left) / FADE);
    const bw = this.words.width + 20;
    const bh = 28;
    const view = this.scene.cameras.main.worldView;
    const cx = Phaser.Math.Clamp(x, view.x + bw / 2 + 8, view.right - bw / 2 - 8);
    const cy = Phaser.Math.Clamp(y - bh / 2 - 7, view.y + bh / 2 + 8, view.bottom - bh / 2 - 8);
    this.words.setPosition(cx, cy).setAlpha(a);
    this.panel.fillStyle(0x0d0814, 0.85 * a).fillRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 8);
    this.panel.fillTriangle(cx - 6, cy + bh / 2, cx + 6, cy + bh / 2, cx, cy + bh / 2 + 7);
    this.panel.lineStyle(2, 0x6a3fa0, a).strokeRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 8);
  }

  destroy(): void {
    this.panel.destroy();
    this.words.destroy();
  }
}
