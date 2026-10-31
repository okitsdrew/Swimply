import Phaser from 'phaser';
import { save } from '../core/save';
import { Run } from '../sim/Run';

// 75 -> "1:15"
export const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const style = {
  fontFamily: 'monospace',
  fontSize: '16px',
  fontStyle: 'bold',
  color: '#f2d7a6',
  stroke: '#1a1020',
  strokeThickness: 4,
};

// The run's clock, kills and shards in the corner, a banner, and the death message. Fixed to the screen, not the world.
export class RunHud {
  private counts: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private death: Phaser.GameObjects.Text;
  private bannerTime = 0;
  // The tree screen shows its own death summary, so this one steps aside.
  treeOpen = false;

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
    this.counts.setText(`${clock(r.time)}   KILLS ${r.kills}   SHARDS ${save.shards}${note ? `   ${note}` : ''}`);
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.banner.setPosition(width / 2, height * 0.22).setAlpha(Math.min(1, this.bannerTime * 2));
    const dead = r.state === 'dead' && !this.treeOpen;
    this.death.setVisible(dead).setPosition(width / 2, height * 0.3);
    if (dead) this.death.setText(`YOU DIED\n${clock(r.time)}, ${r.kills} kills`);
  }
}
