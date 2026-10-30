import Phaser from 'phaser';
import { feel } from '../config/feel';
import { Vec2 } from '../core/iso';
import { hash } from './armMath';
import { Fx } from './Fx';

// The magic bow is drawn procedurally in this local frame: grip at the origin, aiming along +x.
const BOW_HALF = 17;
export const BOW_STRING = 11;
const BOW_POINTS = 28;
const HAND_YELLOW = 0xf2d34a;

export interface BowPose {
  pos: Vec2;
  angle: number;
  scale: number;
  // 0 to 1: how far the bow has phased in.
  vis: number;
  prevVis: number;
  // 0 to 1: how far the string is drawn back.
  pull: number;
  shooting: boolean;
  // Screen y the bow sorts by, plus a small offset so it sits in front of or behind the body.
  depthY: number;
  depthOffset: number;
}

// A floating bow of purple light that phases in while he shoots.
export class BowView {
  private gfx: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private wispTimer = 0;
  private time = 0;

  constructor(scene: Phaser.Scene, private fx: Fx) {
    this.gfx = scene.add.graphics();
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  }

  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible);
    this.glow.setVisible(visible);
  }

  clear(): void {
    this.gfx.clear();
    this.glow.clear();
  }

  draw(p: BowPose, dt: number): void {
    const g = this.gfx;
    const glow = this.glow;
    g.clear();
    glow.clear();
    this.time += dt;
    const { pos, angle, scale, vis, prevVis, pull, shooting } = p;
    if (vis <= 0.005) return;
    g.setDepth(p.depthY + p.depthOffset);
    glow.setDepth(p.depthY + p.depthOffset - 0.1);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const place = (lx: number, ly: number): Vec2 => ({
      x: pos.x + (lx * cos - ly * sin) * scale,
      y: pos.y + (lx * sin + ly * cos) * scale,
    });

    // Limbs wobble and shimmer; while phasing in or out, segments flicker away.
    const pts: Vec2[] = [];
    const flicker = 1 + Math.sin(this.time * 31) * 0.15;
    for (let i = 0; i < BOW_POINTS; i++) {
      const u = (i / (BOW_POINTS - 1)) * 2 - 1;
      const k = Math.pow(Math.abs(u), 1.5);
      const x = -BOW_STRING * k + Math.sin(this.time * 7 + u * 9) * 0.7 * flicker + (Math.abs(u) > 0.9 ? 1.5 : 0);
      const y = u * BOW_HALF + Math.sin(this.time * 5 + u * 6) * 0.5;
      pts.push(place(x, y));
    }
    const frame = Math.floor(this.time * 30);
    const segVisible = (i: number) => vis >= 0.99 || hash(i, frame) < vis * 1.15;
    for (const [target, width, color, alpha] of [
      [glow, 6 * scale, 0x7a2fd0, 0.5],
      [g, 3.4 * scale, 0x3a0f6a, 0.95],
      [g, 1.6 * scale, 0x07000d, 1],
    ] as const) {
      target.lineStyle(width, color, alpha * vis);
      for (let i = 0; i < pts.length - 1; i++) {
        if (segVisible(i)) target.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      }
    }

    // Spearhead rest with a glowing core.
    const tip = place(5, 0);
    const l = place(-1, -2.2);
    const r = place(-1, 2.2);
    g.fillStyle(0x2a0a4a, vis);
    g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    glow.fillStyle(0xc9a0ff, 0.7 * vis);
    glow.fillCircle(pos.x, pos.y, 1.6 * scale);

    // The string, pulled by a small yellow hand.
    const pulledX = -BOW_STRING - (shooting ? pull : 0) * feel.drawDistance;
    const nock = place(pulledX, 0);
    const a = pts[0];
    const b = pts[pts.length - 1];
    g.lineStyle(1, 0xd9b8ff, 0.9 * vis);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(nock.x, nock.y);
    g.lineTo(b.x, b.y);
    g.strokePath();
    if (shooting && pull > 0.02) {
      const head = place(5, 0);
      g.lineStyle(Math.max(1, scale), 0xc9a0ff, vis);
      g.beginPath();
      g.moveTo(nock.x, nock.y);
      g.lineTo(head.x, head.y);
      g.strokePath();
    }
    glow.fillStyle(HAND_YELLOW, 0.5 * vis);
    glow.fillCircle(nock.x, nock.y, 3.2 * scale);
    g.fillStyle(0x8a6a10, vis);
    g.fillCircle(nock.x, nock.y, 1.9 * scale);
    g.fillStyle(HAND_YELLOW, vis);
    g.fillCircle(nock.x, nock.y, 1.5 * scale);
    for (const [fx, fy] of [[-1.2, -1.6], [-1.9, 0], [-1.2, 1.6]] as const) {
      const f = place(pulledX + fx, fy);
      g.fillCircle(f.x, f.y, 0.7 * scale);
    }

    // Wisps drift off the limbs, with a burst as it phases in or out.
    this.wispTimer += dt * 25 * vis;
    const burst = (prevVis <= 0.005 && vis > 0.005) || (prevVis >= 0.999 && vis < 0.999 && !shooting) ? 8 : 0;
    let count = burst;
    while (this.wispTimer >= 1) {
      this.wispTimer -= 1;
      count++;
    }
    for (let i = 0; i < count; i++) {
      const w = pts[Math.floor(Math.random() * pts.length)];
      this.fx.particle({
        x: w.x,
        y: w.y,
        life: 0.3 + Math.random() * 0.3,
        from: 0.25 + Math.random() * 0.2,
        to: 0.05,
        alpha: 0.9,
        tint: Math.random() < 0.5 ? 0xa060ff : 0x6a20c0,
        vx: (Math.random() - 0.5) * 30,
        vy: -10 - Math.random() * 25,
        depth: p.depthY + 1,
      });
    }
  }
}
