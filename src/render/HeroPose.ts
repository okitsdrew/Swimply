import Phaser from 'phaser';
import { render } from '../config/render';
import { toScreen } from '../core/iso';

// The hero in a story pose instead of his normal look: lying asleep (`hero_asleep`), or getting up. Getting up
// plays `hero_getup_0`, `hero_getup_1`... if they are drawn; until then he fades from lying to a wobbly rise.
export class HeroPose {
  private img: Phaser.GameObjects.Image;
  private rise: Phaser.GameObjects.Image;
  private pose: 'none' | 'asleep' | 'standing' = 'none';
  private t = 0;
  private time = 1;

  constructor(private scene: Phaser.Scene) {
    this.img = scene.add.image(0, 0, 'hero_asleep').setOrigin(0.5, 0.8).setVisible(false);
    this.rise = scene.add.image(0, 0, 'hero').setOrigin(0.5, 1).setVisible(false);
  }

  // True while a pose stands in for the hero, so his normal look hides.
  get active(): boolean {
    return this.pose !== 'none';
  }

  asleep(): void {
    this.pose = 'asleep';
  }

  standUp(seconds: number): void {
    if (this.pose === 'none') return;
    this.pose = 'standing';
    this.t = 0;
    this.time = Math.max(seconds, 0.01);
  }

  private frames(): string[] {
    const out: string[] = [];
    while (this.scene.textures.exists(`hero_getup_${out.length}`)) out.push(`hero_getup_${out.length}`);
    return out;
  }

  update(dt: number, x: number, y: number): void {
    const px = render.pixelScale;
    const s = toScreen(x, y);
    this.img.setVisible(this.pose !== 'none').setPosition(s.x, s.y).setDepth(s.y).setScale(px).setAlpha(1);
    this.rise.setVisible(false);
    if (this.pose === 'asleep') {
      this.img.setTexture('hero_asleep').setOrigin(0.5, 0.8);
      return;
    }
    if (this.pose !== 'standing') return;
    this.t = Math.min(1, this.t + dt / this.time);
    const frames = this.frames();
    if (frames.length) {
      this.img.setTexture(frames[Math.min(frames.length - 1, Math.floor(this.t * frames.length))]).setOrigin(0.5, 1);
    } else {
      // Stand-in: lying fades out as he rises, slowly and unsteadily.
      const up = Phaser.Math.Easing.Quadratic.InOut(Phaser.Math.Clamp(this.t * 1.25 - 0.25, 0, 1));
      const wobble = Math.sin(this.t * 22) * (1 - up) * 0.12;
      this.img.setAlpha(1 - Math.min(1, this.t * 2.5));
      this.rise.setVisible(true).setPosition(s.x, s.y).setDepth(s.y + 0.1).setScale(px, px * (0.35 + 0.65 * up)).setRotation(wobble).setAlpha(Math.min(1, this.t * 3));
    }
    if (this.t >= 1) {
      this.pose = 'none';
      this.img.setVisible(false);
      this.rise.setVisible(false);
    }
  }
}
