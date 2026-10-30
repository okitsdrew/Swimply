import Phaser from 'phaser';
import { dash, teleport } from '../config/character';
import { camera, feel } from '../config/feel';
import { render } from '../config/render';
import { Pool } from '../core/pool';
import { Tex } from './art';

interface Fading {
  active: boolean;
  age: number;
  life: number;
  vx: number;
  vy: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
}

// Short-lived visual effects. Positions here are already in screen space.
export class Fx {
  private images: Pool<Fading>;
  private texts: Pool<Fading>;
  private streakGfx: Phaser.GameObjects.Graphics;
  private streaks: { x0: number; y0: number; x1: number; y1: number; age: number; zip: number; fade: number; width: number }[] = [];
  private shake = 0;
  private numbersThisFrame = 0;
  private numbersAlive = 0;
  readonly shakeOffset = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.streakGfx = scene.add.graphics().setDepth(1e6 - 1);
    const fading = (obj: Fading['obj']): Fading => ({
      active: false,
      age: 0,
      life: 1,
      vx: 0,
      vy: 0,
      startScale: 1,
      endScale: 1,
      startAlpha: 1,
      obj,
    });
    this.images = new Pool(() => fading(scene.add.image(0, 0, Tex.smoke).setVisible(false)));
    this.texts = new Pool(() =>
      fading(
        scene.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#f2d7a6',
            stroke: '#1a1020',
            strokeThickness: 3,
          })
          .setOrigin(0.5, 1)
          .setVisible(false),
      ),
    );
  }

  afterimage(
    texture: string,
    x: number,
    y: number,
    flipX: boolean,
    scale: number,
    depth: number,
    tint = 0x9a8fc4,
    life = dash.afterimageFade,
    alpha = 0.5,
  ): void {
    const f = this.spawn(this.images, life, scale, scale, alpha);
    const img = f.obj as Phaser.GameObjects.Image;
    img.setTexture(texture).setOrigin(0.5, 1).setFlipX(flipX).setTintFill(tint);
    img.setPosition(x, y).setDepth(depth - 0.5).setBlendMode(Phaser.BlendModes.ADD);
  }

  particle(o: {
    texture?: string;
    x: number;
    y: number;
    life: number;
    from: number;
    to: number;
    alpha?: number;
    tint?: number;
    additive?: boolean;
    vx?: number;
    vy?: number;
    depth?: number;
  }): void {
    const f = this.spawn(this.images, o.life, o.from, o.to, o.alpha ?? 1);
    const img = f.obj as Phaser.GameObjects.Image;
    img
      .setTexture(o.texture ?? Tex.glow)
      .setOrigin(0.5)
      .setFlipX(false)
      .setPosition(o.x, o.y)
      .setDepth(o.depth ?? 1e6)
      .setBlendMode(o.additive === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    if (o.tint !== undefined) img.setTint(o.tint);
    else img.clearTint();
    f.vx = o.vx ?? 0;
    f.vy = o.vy ?? 0;
  }

  // A line that zips from start to end, then its tail catches up and it fades.
  streak(x0: number, y0: number, x1: number, y1: number, zip = teleport.zipTime, width = teleport.lineWidth): void {
    this.streaks.push({ x0, y0, x1, y1, age: 0, zip, fade: teleport.lineFade, width });
  }

  smoke(x: number, y: number, count: number, spread: number): void {
    const px = render.pixelScale;
    for (let i = 0; i < count; i++) {
      const f = this.spawn(this.images, 0.45 + Math.random() * 0.35, px * 0.8, px * (1.6 + Math.random()), 0.8);
      const img = f.obj as Phaser.GameObjects.Image;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      img.setTexture(Tex.smoke).setOrigin(0.5).setFlipX(false).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
      img.setPosition(x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.5).setDepth(y + 1);
      f.vx = Math.cos(angle) * 30;
      f.vy = Math.sin(angle) * 15 - 25;
    }
  }

  damageNumber(x: number, y: number, amount: number): void {
    if (!feel.damageNumbers) return;
    // Big groups would otherwise create hundreds of text objects in one frame.
    if (this.numbersThisFrame >= feel.maxNumbersPerFrame || this.numbersAlive >= feel.maxNumbersAlive) return;
    this.numbersThisFrame++;
    const f = this.spawn(this.texts, 0.55, 1, 1, 1);
    const text = f.obj as Phaser.GameObjects.Text;
    text.setText(String(Math.round(amount))).setPosition(x + (Math.random() - 0.5) * 10, y).setDepth(1e6);
    f.vy = -60;
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number): void {
    this.numbersThisFrame = 0;
    this.numbersAlive = 0;
    for (const pool of [this.images, this.texts]) {
      for (const f of pool.items) {
        if (!f.active) continue;
        if (pool === this.texts) this.numbersAlive++;
        f.age += dt;
        const t = f.age / f.life;
        if (t >= 1) {
          f.active = false;
          f.obj.setVisible(false);
          continue;
        }
        f.obj.x += f.vx * dt;
        f.obj.y += f.vy * dt;
        f.obj.setScale(f.startScale + (f.endScale - f.startScale) * t);
        f.obj.setAlpha(f.startAlpha * (1 - t));
      }
    }
    this.drawStreaks(dt);
    this.shake *= Math.exp(-camera.shakeDecay * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.shakeOffset.x = (Math.random() * 2 - 1) * this.shake;
    this.shakeOffset.y = (Math.random() * 2 - 1) * this.shake;
  }

  private drawStreaks(dt: number): void {
    const g = this.streakGfx;
    g.clear();
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.age += dt;
      if (s.age >= s.zip + s.fade) {
        this.streaks.splice(i, 1);
        continue;
      }
      const head = Math.min(1, s.age / s.zip);
      const tail = s.age <= s.zip ? 0 : (s.age - s.zip) / s.fade;
      const ax = s.x0 + (s.x1 - s.x0) * tail;
      const ay = s.y0 + (s.y1 - s.y0) * tail;
      const bx = s.x0 + (s.x1 - s.x0) * head;
      const by = s.y0 + (s.y1 - s.y0) * head;
      const alpha = 1 - tail * tail;
      for (const [w, color, a] of [
        [s.width * 3.2, 0x7a2fd0, 0.45],
        [s.width * 2, 0x3a0f6a, 0.9],
        [s.width, 0x07000d, 1],
      ] as const) {
        g.lineStyle(w, color, a * alpha);
        g.lineBetween(ax, ay, bx, by);
      }
    }
  }

  private spawn(pool: Pool<Fading>, life: number, startScale: number, endScale: number, alpha: number): Fading {
    const f = pool.obtain();
    f.active = true;
    f.age = 0;
    f.life = life;
    f.vx = 0;
    f.vy = 0;
    f.startScale = startScale;
    f.endScale = endScale;
    f.startAlpha = alpha;
    f.obj.setVisible(true).setAlpha(alpha).setScale(startScale);
    return f;
  }
}
