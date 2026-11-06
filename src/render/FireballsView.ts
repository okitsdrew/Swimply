import Phaser from 'phaser';
import { render } from '../config/render';
import { flameTorrent } from '../config/vestiges';
import { toScreen } from '../core/iso';
import { Fireballs } from '../sim/Fireballs';
import { fireballFrames, Tex } from './art';
import { Fx } from './Fx';

const screen = { x: 0, y: 0 };
const dir = { x: 0, y: 0 };

// How a set of fireballs looks: height over the ground and size (art pixels), seconds per frame, trail embers a second.
export interface FireballLook {
  height: number;
  scale: number;
  frameTime: number;
  trail: number;
}

// Flame Torrent's fireballs (or a boss's): the drawn fireball (pointing right, turned to where it is heading, its
// frames cycling) with a glow, and a trail of embers and smoke behind it.
export class FireballsView {
  private imgs: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private age = 0;
  private trailTimer = 0;

  constructor(private scene: Phaser.Scene, private fireballs: Fireballs, private fx: Fx, private cfg: FireballLook = flameTorrent) {}

  update(dt: number): void {
    const cfg = this.cfg;
    this.age += dt;
    const px = render.pixelScale;
    this.trailTimer -= dt * cfg.trail;
    let trails = 0;
    while (this.trailTimer < 0) {
      this.trailTimer += 1;
      trails++;
    }
    let n = 0;
    for (const f of this.fireballs.list) {
      if (f.age < 0) continue;
      const i = n++;
      if (!this.imgs[i]) {
        this.imgs.push(this.scene.add.image(0, 0, fireballFrames[0]));
        this.glows.push(this.scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD));
      }
      toScreen(f.x, f.y, screen);
      toScreen(f.velX, f.velY, dir);
      const y = screen.y - cfg.height * px;
      const frame = fireballFrames[Math.floor(this.age / cfg.frameTime + i) % fireballFrames.length];
      this.imgs[i].setVisible(true).setTexture(frame).setPosition(screen.x, y).setDepth(screen.y + 2).setScale(px * cfg.scale).setRotation(Math.atan2(dir.y, dir.x));
      this.glows[i].setVisible(true).setPosition(screen.x, y).setDepth(screen.y + 1).setTint(0xff8a1a).setScale((24 * px * cfg.scale) / 32).setAlpha(0.55);
      for (let k = 0; k < trails; k++) {
        const len = Math.hypot(dir.x, dir.y) || 1;
        const back = { x: screen.x - (dir.x / len) * 6 * px, y: y - (dir.y / len) * 6 * px };
        const ember = Math.random() < 0.7;
        this.fx.particle({
          texture: ember ? Tex.glow : Tex.smoke,
          x: back.x + (Math.random() - 0.5) * 4 * px,
          y: back.y + (Math.random() - 0.5) * 4 * px,
          life: ember ? 0.25 + Math.random() * 0.2 : 0.4 + Math.random() * 0.3,
          from: ember ? 0.3 * cfg.scale : 0.3 * px * cfg.scale,
          to: ember ? 0 : 0.8 * px * cfg.scale,
          alpha: ember ? 1 : 0.4,
          tint: ember ? [0xffe14a, 0xff8a1a, 0xe0301c][Math.floor(Math.random() * 3)] : 0x2a2028,
          additive: ember,
          vx: (Math.random() - 0.5) * 20,
          vy: ember ? -20 - Math.random() * 30 : -10,
          depth: screen.y + (ember ? 1.5 : 0.5),
        });
      }
    }
    for (let i = n; i < this.imgs.length; i++) {
      this.imgs[i].setVisible(false);
      this.glows[i].setVisible(false);
    }
  }

  destroy(): void {
    for (const o of [...this.imgs, ...this.glows]) o.destroy();
    this.imgs.length = 0;
    this.glows.length = 0;
  }
}
