import Phaser from 'phaser';
import { Vec2 } from '../core/iso';

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function hash(i: number, frame: number): number {
  const h = Math.sin(i * 12.9898 + frame * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

// Two-bone arm. The elbow bends downward, and the hand stops short if the target is out of reach.
export function solveArm(shoulder: Vec2, target: Vec2, segment: number): { shoulder: Vec2; elbow: Vec2; hand: Vec2 } {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = Math.min(len, segment * 2 - 0.01);
  const ux = dx / len;
  const uy = dy / len;
  const h = Math.sqrt(Math.max(0, segment * segment - (d * d) / 4));
  const mx = shoulder.x + (ux * d) / 2;
  const my = shoulder.y + (uy * d) / 2;
  const a = { x: mx - uy * h, y: my + ux * h };
  const b = { x: mx + uy * h, y: my - ux * h };
  return {
    shoulder,
    elbow: a.y > b.y ? a : b,
    hand: { x: shoulder.x + ux * d, y: shoulder.y + uy * d },
  };
}

export function ellipseArc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, fraction: number): void {
  if (fraction <= 0) return;
  const segments = Math.max(2, Math.ceil(40 * fraction));
  const start = -Math.PI / 2;
  g.beginPath();
  for (let i = 0; i < segments + 1; i++) {
    const a = start + (i / segments) * fraction * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
}
