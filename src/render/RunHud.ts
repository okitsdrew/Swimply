import Phaser from 'phaser';
import { Run } from '../sim/Run';

const style = {
  fontFamily: 'monospace',
  fontSize: '16px',
  fontStyle: 'bold',
  color: '#f2d7a6',
  stroke: '#1a1020',
  strokeThickness: 4,
};

// Wave and kill counts in the corner, a wave banner, and the death message. Fixed to the screen, not the world.
export class RunHud {
  private counts: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private death: Phaser.GameObjects.Text;
  private bannerTime = 0;

  constructor(scene: Phaser.Scene, private run: Run) {
    const fixed = (t: Phaser.GameObjects.Text) => t.setScrollFactor(0).setDepth(2e7);
    this.counts = fixed(scene.add.text(16, 12, '', style));
    this.banner = fixed(scene.add.text(0, 0, '', { ...style, fontSize: '28px' }).setOrigin(0.5));
    this.death = fixed(scene.add.text(0, 0, '', { ...style, fontSize: '22px', align: 'center' }).setOrigin(0.5));
  }

  announce(text: string): void {
    this.banner.setText(text);
    this.bannerTime = 1.6;
  }

  // `note` shows dev states such as a pause, so a frozen game is never mistaken for a bug.
  update(dt: number, width: number, height: number, note = ''): void {
    const r = this.run;
    this.counts.setText(`WAVE ${r.wave}   KILLS ${r.kills}${note ? `   ${note}` : ''}`);
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.banner.setPosition(width / 2, height * 0.22).setAlpha(Math.min(1, this.bannerTime * 2));
    const dead = r.state === 'dead';
    this.death.setVisible(dead).setPosition(width / 2, height * 0.3);
    if (dead) {
      const hint = r.canRestart ? '\nclick or press space to try again' : '';
      this.death.setText(`YOU DIED\nwave ${r.wave}, ${r.kills} kills, ${Math.floor(r.time)}s${hint}`);
    }
  }
}
