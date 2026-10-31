import Phaser from 'phaser';
import { render } from '../config/render';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { Werewolf } from '../sim/Werewolf';
import { Tex, wolfAttackFrames, wolfWalkFrames } from './art';
import { Fx } from './Fx';

const screen = { x: 0, y: 0 };
const corner = { x: 0, y: 0 };
// How long the slam's ground flash and ring last.
const SLAM_FADE = 0.35;

// Draws the werewolf, his attack rectangle on the ground, the slam, and his health bar.
//   walk: werewolf_0-3   windup: werewolf_10 then 11 (held)   dash: 11   slam: 12 then 13 (held)   recover: 13
export class WerewolfView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private ground: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;
  private walkTime = 0;
  // Seconds since the last slam, for its fading flash.
  private sinceSlam = SLAM_FADE;
  private slamAt = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, private wolf: Werewolf, private fx: Fx) {
    this.sprite = scene.add.image(0, 0, wolfWalkFrames[0]).setOrigin(0.5, 1).setVisible(false);
    this.shadow = scene.add.image(0, 0, Tex.shadow).setVisible(false);
    this.ground = scene.add.graphics().setDepth(-5e7 + 1);
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(2e7);
    this.name = scene.add.text(0, 0, 'THE WEREWOLF', {
      fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#f2d7a6', stroke: '#1a1020', strokeThickness: 4,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(2e7).setVisible(false);
  }

  onRisen(): void {
    toScreen(this.wolf.x, this.wolf.y, screen);
    this.fx.smoke(screen.x, screen.y - 10 * render.pixelScale, 16, 20);
  }

  onSlam(): void {
    const w = this.wolf;
    const px = render.pixelScale;
    this.sinceSlam = 0;
    this.slamAt = { x: w.x, y: w.y };
    this.fx.addShake(this.wolf.cfg.slamShake);
    toScreen(w.x, w.y, screen);
    this.fx.smoke(screen.x, screen.y, this.wolf.cfg.slamSmoke, 14 * px);
    this.fx.particle({ x: screen.x, y: screen.y - 4 * px, life: 0.18, from: 2.5, to: 0, tint: 0xffd0a0, depth: screen.y + 2 });
    // Dust kicked up along the path he dashed.
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      toScreen(w.ax + w.dirX * w.reach * k, w.ay + w.dirY * w.reach * k, screen);
      this.fx.smoke(screen.x, screen.y, Math.round(this.wolf.cfg.slamSmoke / 4), 6 * px);
    }
  }

  onKilled(x: number, y: number): void {
    const px = render.pixelScale;
    toScreen(x, y, screen);
    this.fx.smoke(screen.x, screen.y - 12 * px, this.wolf.cfg.deathSmoke, 14 * px);
    this.fx.particle({ x: screen.x, y: screen.y - 12 * px, life: 0.3, from: 4, to: 0, tint: 0xffe0b0, depth: screen.y + 2 });
    this.fx.addShake(14);
  }

  render(dt: number, width: number): void {
    const w = this.wolf;
    const g = this.ground.clear();
    this.sinceSlam += dt;
    this.drawSlamFlash(g);
    const shown = w.present && w.state !== 'rising';
    this.sprite.setVisible(shown);
    this.shadow.setVisible(shown);
    this.drawBar(width);
    if (!w.present) return;
    toScreen(w.x, w.y, screen);

    if (w.state === 'rising') {
      const k = Math.min(1, w.time / Math.max(this.wolf.cfg.spawnTell, 1e-4));
      const half = ellipseHalfSize(w.radius * (3 - 2 * k));
      const core = ellipseHalfSize(w.radius * k * 1.2);
      g.lineStyle(3, 0x8a2030, 0.4 + 0.6 * k).strokeEllipse(screen.x, screen.y, half.x * 2, half.y * 2);
      g.fillStyle(0x0d0004, 0.4 + 0.5 * k).fillEllipse(screen.x, screen.y, core.x * 2, core.y * 2);
      return;
    }

    if (w.state === 'windup' || w.state === 'dash') {
      // The danger zone: dim while it grows, bright once he is coming.
      const dashing = w.state === 'dash';
      this.rect(g, w.reach);
      g.fillStyle(0xff3040, dashing ? 0.45 : 0.12 + 0.18 * Math.min(1, w.time / this.wolf.cfg.windupTime)).fillPath();
      this.rect(g, w.reach);
      g.lineStyle(2, 0xff6070, dashing ? 1 : 0.7).strokePath();
      // The full length as a faint outline, so the player sees at once how far it will reach.
      if (!dashing) {
        this.rect(g, this.wolf.cfg.attackRange);
        g.lineStyle(1, 0xff6070, 0.25).strokePath();
      }
    }

    const scale = render.pixelScale * this.wolf.cfg.scale;
    let frame = wolfWalkFrames[0];
    if (w.state === 'walk') {
      this.walkTime += dt;
      frame = wolfWalkFrames[Math.floor(this.walkTime * this.wolf.cfg.walkFps) % wolfWalkFrames.length];
    } else if (w.state === 'windup') {
      frame = w.time < this.wolf.cfg.windupTime * 0.3 ? wolfAttackFrames[0] : wolfAttackFrames[1];
    } else if (w.state === 'dash') {
      frame = wolfAttackFrames[1];
    } else if (w.state === 'slam') {
      frame = w.time < 0.06 ? wolfAttackFrames[2] : wolfAttackFrames[3];
    } else if (w.state === 'recover') {
      frame = wolfAttackFrames[3];
    }
    this.sprite.setTexture(frame).setPosition(screen.x, screen.y).setScale(scale).setFlipX(w.facing < 0).setDepth(screen.y);
    if (w.flash > 0) this.sprite.setTintFill(0xffffff);
    else this.sprite.clearTint();
    this.shadow.setPosition(screen.x, screen.y).setScale(scale * 1.4, scale * 0.5).setDepth(screen.y - 1000);
  }

  clear(): void {
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.ground.clear();
    this.sinceSlam = SLAM_FADE;
  }

  // The attack rectangle from `from` to `reach` along it, as a path on the ground.
  private rect(g: Phaser.GameObjects.Graphics, reach: number, from = 0): void {
    const w = this.wolf;
    const hw = this.wolf.cfg.attackWidth / 2;
    const nx = -w.dirY * hw;
    const ny = w.dirX * hw;
    const pts = [
      [w.ax + w.dirX * from + nx, w.ay + w.dirY * from + ny],
      [w.ax + w.dirX * reach + nx, w.ay + w.dirY * reach + ny],
      [w.ax + w.dirX * reach - nx, w.ay + w.dirY * reach - ny],
      [w.ax + w.dirX * from - nx, w.ay + w.dirY * from - ny],
    ];
    g.beginPath();
    pts.forEach(([x, y], i) => {
      toScreen(x, y, corner);
      if (i === 0) g.moveTo(corner.x, corner.y);
      else g.lineTo(corner.x, corner.y);
    });
    g.closePath();
  }

  // The slam: the far end of the rectangle (where it hurts) flashes and fades, and a ring spreads from where he
  // landed.
  private drawSlamFlash(g: Phaser.GameObjects.Graphics): void {
    if (this.sinceSlam >= SLAM_FADE) return;
    const k = this.sinceSlam / SLAM_FADE;
    this.rect(g, this.wolf.reach, Math.max(0, this.wolf.reach - this.wolf.cfg.attackWidth));
    g.fillStyle(0xffe0c0, 0.6 * (1 - k)).fillPath();
    toScreen(this.slamAt.x, this.slamAt.y, screen);
    const half = ellipseHalfSize(this.wolf.cfg.attackWidth * (0.5 + 1.5 * k));
    g.lineStyle(4 * (1 - k) + 1, 0xffd0a0, 1 - k).strokeEllipse(screen.x, screen.y, half.x * 2, half.y * 2);
  }

  private drawBar(width: number): void {
    const w = this.wolf;
    const g = this.bar.clear();
    const show = w.alive;
    this.name.setVisible(show);
    if (!show) return;
    const bw = Math.min(480, width * 0.5);
    const x = (width - bw) / 2;
    const y = 52;
    this.name.setPosition(width / 2, y - 4);
    g.fillStyle(0x1a1020, 0.9).fillRect(x - 3, y - 3, bw + 6, 16);
    g.fillStyle(0x8a2030, 1).fillRect(x, y, bw * Math.max(0, w.hp / this.wolf.cfg.hp), 10);
  }
}
