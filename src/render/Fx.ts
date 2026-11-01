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

// The teleport's tear, rasterised once on the art pixel grid. `jag` pushes an extra edge pixel out from the line,
// `hole` decides when each pixel crumbles as the tail closes in.
interface Streak {
  cells: { x: number; y: number; jag: number; hole: number }[];
  // Which side the edges go: below/above for a flat line, right/left for a steep one.
  nx: number;
  ny: number;
  age: number;
  zip: number;
  fade: number;
  width: number;
  shed: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  drag: number;
}

// The arrow's palette, which the tear and the burst are drawn in.
const VOID = { core: 0x07000d, deep: 0x2a0a4a, mid: 0x4a1a7a, purple: 0x7a2fd0, lilac: 0xe0c8ff };

// Short-lived visual effects. Positions here are already in screen space.
export class Fx {
  private images: Pool<Fading>;
  private texts: Pool<Fading>;
  private streakGfx: Phaser.GameObjects.Graphics;
  private streaks: Streak[] = [];
  // Single art pixels in flight: the tear's wisps and the landing burst's sparks.
  private bits: Bit[] = [];
  private rings: { x: number; y: number; age: number }[] = [];
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

  // A tear in art pixels that zips from start to end, then crumbles from its tail, shedding wisps.
  streak(x0: number, y0: number, x1: number, y1: number, zip = teleport.zipTime, width = teleport.lineWidth): void {
    const px = render.pixelScale;
    let x = Math.round(x0 / px);
    let y = Math.round(y0 / px);
    const ex = Math.round(x1 / px);
    const ey = Math.round(y1 / px);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    const cells: Streak['cells'] = [];
    for (;;) {
      cells.push({ x, y, jag: Math.random() < 0.33 ? 1 : 0, hole: Math.random() });
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    const flat = dx >= -dy;
    this.streaks.push({ cells, nx: flat ? 0 : 1, ny: flat ? 1 : 0, age: 0, zip, fade: teleport.lineFade, width, shed: 0 });
  }

  // Where he lands: a ring of pixels that grows and a spray of chunky sparks.
  burst(x: number, y: number): void {
    const px = render.pixelScale;
    this.rings.push({ x: x / px, y: y / px, age: 0 });
    const n = Math.round(teleport.burstSparks);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const v = teleport.burstSpeed * (0.7 + Math.random() * 0.6);
      this.bits.push({ x: x / px, y: y / px, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, age: 0, life: teleport.burstLife * (0.6 + Math.random() * 0.4), size: 2, drag: 4 });
    }
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
    const px = render.pixelScale;
    g.clear();
    const dot = (x: number, y: number, color: number, alpha = 1, size = 1) => g.fillStyle(color, alpha).fillRect(Math.round(x) * px, Math.round(y) * px, px * size, px * size);
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.age += dt;
      if (s.age >= s.zip + s.fade) {
        this.streaks.splice(i, 1);
        continue;
      }
      const n = s.cells.length - 1;
      const head = Math.round(Math.min(1, s.age / s.zip) * n);
      const closing = s.age <= s.zip ? 0 : (s.age - s.zip) / s.fade;
      const tail = Math.round(closing * n);
      // Pixels the tail has passed shed wisps.
      for (; s.shed < tail; s.shed++) {
        if (Math.random() >= teleport.wispChance) continue;
        const c = s.cells[s.shed];
        this.bits.push({ x: c.x, y: c.y, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 10, age: 0, life: teleport.wispLife * (0.6 + Math.random() * 0.4), size: 1, drag: 1 });
      }
      const thick = Math.max(1, Math.round(s.width / px));
      const crumbling = tail + (head - tail) * 0.6;
      for (let k = tail; k <= head; k++) {
        const c = s.cells[k];
        // Near the tail the tear crumbles away pixel by pixel.
        if (k < crumbling && c.hole < closing * 1.3) continue;
        for (let t = 0; t < thick; t++) dot(c.x + s.nx * t, c.y + s.ny * t, VOID.core);
        dot(c.x - s.nx, c.y - s.ny, VOID.mid);
        dot(c.x + s.nx * thick, c.y + s.ny * thick, VOID.deep);
        if (c.jag) dot(c.x - s.nx * 2, c.y - s.ny * 2, VOID.purple);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const t = r.age / Math.max(teleport.burstRingTime, 1e-3);
      if (t >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const radius = 2 + (teleport.burstRing / 2 - 2) * t;
      const steps = Math.max(8, Math.round(radius * 5));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        dot(r.x + Math.cos(a) * radius, r.y + Math.sin(a) * radius * 0.6, t < 0.5 ? VOID.lilac : VOID.purple);
      }
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.bits.splice(i, 1);
        continue;
      }
      const slow = Math.exp(-b.drag * dt);
      b.vx *= slow;
      b.vy *= slow;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      dot(b.x, b.y, b.age < b.life * 0.5 ? VOID.lilac : VOID.purple, 1, b.size);
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
