import Phaser from 'phaser';
import { save } from '../core/save';
import { pickupKinds, pickupTexture } from '../data/pickups';
import { Run } from '../sim/Run';
import { Tex } from './art';
import { ui, uiText } from './ui';

// 75 -> "1:15"
export const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// The Mindscape's HUD: memory shards top left, the run's clock top middle, a banner, the death message, and dev
// notes in the bottom right corner. Fixed to the screen, not the world.
export class RunHud {
  private shardIcon: Phaser.GameObjects.Image;
  private shardGlow: Phaser.GameObjects.Image;
  private shards: Phaser.GameObjects.Text;
  private clock: Phaser.GameObjects.Text;
  private notes: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private death: Phaser.GameObjects.Text;
  private bannerTime = 0;
  private shown = -1;
  private pop = 0;
  private time = 0;
  // The tree screen shows its own death summary, so this one steps aside.
  treeOpen = false;
  // Off in a calm map, which has no run: no clock or shards.
  showRun = true;

  constructor(scene: Phaser.Scene, private run: Run) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(2e7);
    const kind = pickupKinds.get('memory_shard');
    this.shardGlow = fixed(scene.add.image(34, 32, Tex.glow).setTint(kind?.glow ?? 0x4aa8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setAlpha(0.8));
    this.shardIcon = fixed(scene.add.image(34, 32, kind ? pickupTexture(kind) : Tex.glow).setScale(5));
    this.shards = fixed(scene.add.text(58, 32, '', uiText(24)).setOrigin(0, 0.5));
    this.clock = fixed(scene.add.text(0, 14, '', uiText(32)).setOrigin(0.5, 0));
    this.notes = fixed(scene.add.text(0, 0, '', uiText(8, { color: ui.dim })).setOrigin(1, 1));
    this.banner = fixed(scene.add.text(0, 0, '', uiText(24, { align: 'center' })).setOrigin(0.5));
    this.death = fixed(scene.add.text(0, 0, '', uiText(24, { align: 'center', lineSpacing: 12 })).setOrigin(0.5));
  }

  announce(text: string, seconds = 1.6): void {
    this.banner.setText(text);
    this.bannerTime = seconds;
  }

  // `note` shows dev states such as a pause, so a frozen game is never mistaken for a bug.
  update(dt: number, width: number, height: number, note = ''): void {
    const r = this.run;
    this.time += dt;
    for (const o of [this.shardIcon, this.shardGlow, this.shards, this.clock]) o.setVisible(this.showRun);
    if (this.showRun) {
      // The count pops when shards come in.
      if (save.shards > this.shown && this.shown >= 0) this.pop = 1;
      this.shown = save.shards;
      this.pop = Math.max(0, this.pop - dt * 5);
      this.shards.setText(`${save.shards}`).setScale(1 + this.pop * 0.25);
      this.shardGlow.setAlpha(0.6 + 0.2 * Math.sin(this.time * 4) + this.pop * 0.3);
      this.clock.setText(clock(r.time)).setX(width / 2);
    }
    this.notes.setText(note).setPosition(width - 16, height - 12);
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.banner.setPosition(width / 2, height * 0.22).setAlpha(Math.min(1, this.bannerTime * 2));
    const dead = r.state === 'dead' && !this.treeOpen;
    this.death.setVisible(dead).setPosition(width / 2, height * 0.3);
    if (dead) this.death.setText(this.showRun ? `YOU DIED\n${clock(r.time)}, ${r.kills} kills` : 'YOU DIED');
  }
}
