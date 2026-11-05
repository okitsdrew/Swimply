import Phaser from 'phaser';
import { render } from '../config/render';
import { status as cfg } from '../config/status';
import { toScreen } from '../core/iso';
import { Enemy } from '../sim/enemies';
import { starFrames, Tex } from './art';
import { Fx } from './Fx';

// Effects on enemies, the same for every kind: stars circling a stunned one's head, an icy glow on a frozen one, a
// dull one on a slowed one, flames rising off a burning one. The stars are drawn and spin (starFrames); the rest are
// placeholder looks.
export class StatusView {
  private stars: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private age = 0;
  private flameTimer = 0;

  constructor(private scene: Phaser.Scene, private fx: Fx) {}

  update(dt: number, enemies: readonly Enemy[]): void {
    this.age += dt;
    this.flameTimer -= dt;
    const flames = this.flameTimer <= 0;
    if (flames) this.flameTimer = 0.08;
    const px = render.pixelScale;
    let star = 0;
    let glow = 0;
    for (const e of enemies) {
      const st = e.status;
      if (!e.alive || !(st.stun > 0 || st.freeze > 0 || st.slow > 0 || st.burn > 0)) continue;
      const s = toScreen(e.x, e.y);
      const head = s.y - (e.radius * cfg.headHeight + cfg.headExtra) * px;
      if (st.stun > 0) {
        const n = Math.max(1, Math.round(cfg.stunStars));
        for (let i = 0; i < n; i++) {
          const a = this.age * cfg.stunSpin * Math.PI * 2 + (i / n) * Math.PI * 2;
          const frame = starFrames[Math.floor(this.age / cfg.starFrameTime + i) % starFrames.length];
          const img = this.take(this.stars, star++, starFrames[0], false);
          if (this.scene.textures.exists(frame)) img.setTexture(frame);
          img.setPosition(s.x + Math.cos(a) * cfg.stunWidth * px, head + Math.sin(a) * cfg.stunWidth * 0.35 * px).setDepth(s.y + (Math.sin(a) > 0 ? 2 : -2)).setScale(px);
        }
      }
      const tint = st.freeze > 0 ? cfg.freezeColor : st.slow > 0 ? cfg.slowColor : st.burn > 0 ? cfg.burnColor : -1;
      if (tint >= 0) {
        const img = this.take(this.glows, glow++, Tex.glow, true);
        img.setPosition(s.x, s.y - e.radius * 0.8 * px).setDepth(s.y + 1).setScale((e.radius * 2.6 * px) / 32).setTint(tint).setAlpha(0.5 + 0.15 * Math.sin(this.age * 6));
      }
      if (st.burn > 0 && flames) {
        this.fx.particle({ x: s.x + (Math.random() - 0.5) * e.radius * px, y: s.y - Math.random() * e.radius * 1.5 * px, life: 0.4, from: 0.5, to: 0, tint: cfg.burnColor, vy: -60, depth: s.y + 3 });
      }
    }
    for (let i = star; i < this.stars.length; i++) this.stars[i].setVisible(false);
    for (let i = glow; i < this.glows.length; i++) this.glows[i].setVisible(false);
  }

  private take(list: Phaser.GameObjects.Image[], i: number, texture: string, additive: boolean): Phaser.GameObjects.Image {
    let img = list[i];
    if (!img) {
      img = this.scene.add.image(0, 0, texture);
      if (additive) img.setBlendMode(Phaser.BlendModes.ADD);
      list.push(img);
    }
    return img.setVisible(true);
  }
}
