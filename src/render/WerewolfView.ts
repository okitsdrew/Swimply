import Phaser from 'phaser';
import { render } from '../config/render';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { Werewolf } from '../sim/Werewolf';
import { Tex, wolfAttackFrames, wolfJumpFrames, wolfWalkFrames } from './art';
import { Fx } from './Fx';
import { ui, uiText } from './ui';

const screen = { x: 0, y: 0 };
const corner = { x: 0, y: 0 };
// How long the slam's ground flash and ring last.
const SLAM_FADE = 0.35;

// Draws the werewolf, his attack markings on the ground, the slam and landing, and his health bar.
//   walk: werewolf_0-3   windup: werewolf_10 then 11 (held)   dash: 11   slam: 12 then 13 (held)   recover: 13
//   swipe windup: werewolf_10 then 11   swipe: 12 then 13   (the dash attack's frames, quicker)
//   crouch: werewolf_14   jump: werewolf_12 (takeoff) then 15   land: werewolf_13   quick dash: walk frames, afterimages
export class WerewolfView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private ground: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;
  private walkTime = 0;
  private afterimageTimer = 0;
  // Seconds since the last slam, for its fading flash.
  private sinceSlam = SLAM_FADE;
  private slamAt = { x: 0, y: 0 };
  // Which attack the fading flash belongs to.
  private flashShape: 'slam' | 'land' | 'swipe' = 'slam';

  // `boss` gives him the big named bar under the run's clock; a plain werewolf gets a small one over his head once hurt.
  constructor(scene: Phaser.Scene, private wolf: Werewolf, private fx: Fx, private boss = true) {
    this.sprite = scene.add.image(0, 0, wolfWalkFrames[0]).setOrigin(0.5, 1).setVisible(false);
    this.shadow = scene.add.image(0, 0, Tex.shadow).setVisible(false);
    this.ground = scene.add.graphics().setDepth(-5e7 + 1);
    this.bar = scene.add.graphics().setScrollFactor(boss ? 0 : 1).setDepth(2e7);
    this.name = scene.add.text(0, 0, 'THE WEREWOLF', uiText(16)).setOrigin(0.5, 1).setScrollFactor(0).setDepth(2e7).setVisible(false);
  }

  onRisen(): void {
    toScreen(this.wolf.x, this.wolf.y, screen);
    this.fx.smoke(screen.x, screen.y - 10 * render.pixelScale, 16, 20);
  }

  onSlam(): void {
    const w = this.wolf;
    const px = render.pixelScale;
    this.sinceSlam = 0;
    this.flashShape = 'slam';
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

  onSwipe(): void {
    const w = this.wolf;
    this.sinceSlam = 0;
    this.flashShape = 'swipe';
    this.slamAt = { x: w.ax, y: w.ay };
    this.fx.addShake(w.cfg.slamShake * 0.4);
  }

  onLand(): void {
    const w = this.wolf;
    const px = render.pixelScale;
    this.sinceSlam = 0;
    this.flashShape = 'land';
    this.slamAt = { x: w.jx, y: w.jy };
    this.fx.addShake(w.cfg.slamShake * 1.3);
    toScreen(w.jx, w.jy, screen);
    this.fx.smoke(screen.x, screen.y, Math.round(w.cfg.slamSmoke * 1.5), w.cfg.jumpRadius * 0.6);
    this.fx.particle({ x: screen.x, y: screen.y - 4 * px, life: 0.22, from: 3.5, to: 0, tint: 0xffd0a0, depth: screen.y + 2 });
  }

  onKilled(x: number, y: number): void {
    const px = render.pixelScale;
    toScreen(x, y, screen);
    this.fx.smoke(screen.x, screen.y - 12 * px, this.wolf.cfg.deathSmoke, 14 * px);
    this.fx.particle({ x: screen.x, y: screen.y - 12 * px, life: 0.3, from: 4, to: 0, tint: 0xffe0b0, depth: screen.y + 2 });
    this.fx.addShake(this.boss ? 14 : 6);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.ground.destroy();
    this.bar.destroy();
    this.name.destroy();
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
      g.fillStyle(0xff3040, dashing ? 0.45 : 0.12 + 0.18 * Math.min(1, w.time / w.windupTime)).fillPath();
      this.rect(g, w.reach);
      g.lineStyle(2, 0xff6070, dashing ? 1 : 0.7).strokePath();
      // The full length as a faint outline, so the player sees at once how far it will reach.
      if (!dashing) {
        this.rect(g, this.wolf.cfg.attackRange);
        g.lineStyle(1, 0xff6070, 0.25).strokePath();
      }
    }

    if (w.state === 'swipeWindup') {
      // The cone fills from him outward; its full size shows faintly from the start.
      const k = Math.min(1, w.time / Math.max(w.cfg.swipeWindup, 1e-3));
      this.cone(g, w.reach);
      g.fillStyle(0xff3040, 0.15 + 0.25 * k).fillPath();
      this.cone(g, w.cfg.swipeRange);
      g.lineStyle(2, 0xff6070, 0.4 + 0.6 * k).strokePath();
    }
    if (w.state === 'swipe') {
      this.cone(g, w.cfg.swipeRange);
      g.fillStyle(0xff3040, 0.45).fillPath();
    }

    if (w.state === 'jump') {
      // Where he will land: the outline from the moment he leaves the ground, filling as he comes down.
      const k = w.jumpProgress;
      toScreen(w.jx, w.jy, corner);
      const full = ellipseHalfSize(w.cfg.jumpRadius);
      const fill = ellipseHalfSize(w.cfg.jumpRadius * k);
      g.fillStyle(0xff3040, 0.12 + 0.3 * k).fillEllipse(corner.x, corner.y, fill.x * 2, fill.y * 2);
      g.lineStyle(2, 0xff6070, 0.6 + 0.4 * k).strokeEllipse(corner.x, corner.y, full.x * 2, full.y * 2);
    }

    const scale = render.pixelScale * this.wolf.cfg.scale;
    let frame = wolfWalkFrames[0];
    if (w.state === 'walk' || w.state === 'quickDash') {
      this.walkTime += dt;
      frame = wolfWalkFrames[Math.floor(this.walkTime * this.wolf.cfg.walkFps) % wolfWalkFrames.length];
    } else if (w.state === 'windup') {
      frame = w.time < w.windupTime * 0.3 ? wolfAttackFrames[0] : wolfAttackFrames[1];
    } else if (w.state === 'swipeWindup') {
      frame = w.time < w.cfg.swipeWindup * 0.3 ? wolfAttackFrames[0] : wolfAttackFrames[1];
    } else if (w.state === 'swipe') {
      frame = w.time < 0.04 ? wolfAttackFrames[2] : wolfAttackFrames[3];
    } else if (w.state === 'dash') {
      frame = wolfAttackFrames[1];
    } else if (w.state === 'slam') {
      frame = w.time < 0.06 ? wolfAttackFrames[2] : wolfAttackFrames[3];
    } else if (w.state === 'crouch') {
      frame = wolfJumpFrames[0];
    } else if (w.state === 'jump') {
      frame = w.time < w.cfg.jumpTakeoff ? wolfJumpFrames[1] : wolfJumpFrames[2];
    } else if (w.state === 'land') {
      frame = wolfJumpFrames[3];
    } else if (w.state === 'recover') {
      frame = wolfAttackFrames[3];
    }
    // In the air he rises along an arc; his shadow stays on the ground and shrinks.
    const lift = Math.sin(Math.PI * w.jumpProgress) * w.cfg.jumpHeight;
    this.sprite.setTexture(frame).setPosition(screen.x, screen.y - lift).setScale(scale).setFlipX(w.facing < 0).setDepth(screen.y);
    if (w.flash > 0) this.sprite.setTintFill(0xffffff);
    else this.sprite.clearTint();
    // The quick dash leaves afterimages, like the player's dash.
    if (w.state === 'quickDash' && w.cfg.quickDashAfterimages > 0) {
      if (w.time <= dt) this.afterimageTimer = 0;
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.fx.afterimage(frame, screen.x, screen.y, w.facing < 0, scale, screen.y, 0xc4a08f);
        this.afterimageTimer += w.cfg.quickDashDuration / w.cfg.quickDashAfterimages;
      }
    }
    const shrink = 1 - 0.5 * (lift / Math.max(w.cfg.jumpHeight, 1));
    this.shadow.setPosition(screen.x, screen.y).setScale(scale * 1.4 * shrink, scale * 0.5 * shrink).setDepth(screen.y - 1000);
    if (!this.boss) this.drawHeadBar(this.bar);
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

  // The swipe's cone out to `reach`, as a path on the ground: a fan round its locked direction.
  private cone(g: Phaser.GameObjects.Graphics, reach: number): void {
    const w = this.wolf;
    const half = (w.cfg.swipeAngle * Math.PI) / 360;
    const base = Math.atan2(w.dirY, w.dirX);
    const steps = Math.max(2, Math.ceil(w.cfg.swipeAngle / 10));
    g.beginPath();
    toScreen(w.ax, w.ay, corner);
    g.moveTo(corner.x, corner.y);
    for (let i = 0; i <= steps; i++) {
      const a = base - half + (2 * half * i) / steps;
      toScreen(w.ax + Math.cos(a) * reach, w.ay + Math.sin(a) * reach, corner);
      g.lineTo(corner.x, corner.y);
    }
    g.closePath();
  }

  // The hit: the part that hurt (the far end of the rectangle, or the landing circle) flashes and fades, and a ring
  // spreads from where he came down.
  private drawSlamFlash(g: Phaser.GameObjects.Graphics): void {
    if (this.sinceSlam >= SLAM_FADE) return;
    const k = this.sinceSlam / SLAM_FADE;
    const w = this.wolf;
    toScreen(this.slamAt.x, this.slamAt.y, screen);
    let size = w.cfg.attackWidth;
    if (this.flashShape === 'swipe') {
      // Just the cone flashing and fading, no ring.
      this.cone(g, w.cfg.swipeRange);
      g.fillStyle(0xffe0c0, 0.6 * (1 - k)).fillPath();
      return;
    }
    if (this.flashShape === 'land') {
      const area = ellipseHalfSize(w.cfg.jumpRadius);
      g.fillStyle(0xffe0c0, 0.6 * (1 - k)).fillEllipse(screen.x, screen.y, area.x * 2, area.y * 2);
      size = w.cfg.jumpRadius * 1.4;
    } else {
      this.rect(g, w.reach, Math.max(0, w.reach - w.cfg.attackWidth));
      g.fillStyle(0xffe0c0, 0.6 * (1 - k)).fillPath();
    }
    const half = ellipseHalfSize(size * (0.5 + 1.5 * k));
    g.lineStyle(4 * (1 - k) + 1, 0xffd0a0, 1 - k).strokeEllipse(screen.x, screen.y, half.x * 2, half.y * 2);
  }

  private drawBar(width: number): void {
    const w = this.wolf;
    const g = this.bar.clear();
    if (!this.boss) return;
    const show = w.alive;
    this.name.setVisible(show);
    if (!show) return;
    // Just under the run's clock.
    const bw = Math.min(480, width * 0.5);
    const x = Math.round((width - bw) / 2);
    const y = 92;
    this.name.setPosition(width / 2, y - 8);
    const left = Math.max(0, w.hp / this.wolf.cfg.hp);
    g.fillStyle(ui.ink, 1).fillRect(x - 6, y - 6, bw + 12, 24);
    g.fillStyle(ui.mid, 1).fillRect(x - 3, y - 3, bw + 6, 18);
    g.fillStyle(ui.deep, 1).fillRect(x, y, bw, 12);
    g.fillStyle(0x8a2030, 1).fillRect(x, y, Math.round(bw * left), 12);
    g.fillStyle(0xc04050, 1).fillRect(x, y, Math.round(bw * left), 3);
  }

  // A plain werewolf's bar: small, over his head, only once he has been hurt.
  private drawHeadBar(g: Phaser.GameObjects.Graphics): void {
    const w = this.wolf;
    this.name.setVisible(false);
    if (!w.alive || w.hp >= w.cfg.hp) return;
    const bw = 48;
    const x = Math.round(this.sprite.x - bw / 2);
    const y = Math.round(this.sprite.y - this.sprite.displayHeight - 12);
    const left = Math.max(0, w.hp / w.cfg.hp);
    g.fillStyle(ui.ink, 1).fillRect(x - 2, y - 2, bw + 4, 8);
    g.fillStyle(ui.deep, 1).fillRect(x, y, bw, 4);
    g.fillStyle(0xc04050, 1).fillRect(x, y, Math.round(bw * left), 4);
  }
}
