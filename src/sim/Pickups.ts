import { pickups as cfg } from '../config/pickups';
import { render } from '../config/render';
import { toScreen } from '../core/iso';
import { PickupKind } from '../data/pickups';

const off = { x: 0, y: 0 };

// How far an orb is from him for the pickup radius: on the ground, or as seen on screen (pickups.roundOnScreen),
// scaled so the two agree beside him.
function reach(dx: number, dy: number): number {
  if (!cfg.roundOnScreen) return Math.hypot(dx, dy);
  toScreen(dx, dy, off);
  return Math.hypot(off.x, off.y) / (render.isoScale * Math.SQRT2);
}

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Seconds since it dropped; it can be picked up from pickups.settleTime on.
  age: number;
  // Flying to the player, at `speed`.
  flying: boolean;
  speed: number;
  // Fly to him once settled, wherever he is (after the Mindscape is won).
  called: boolean;
  phase: number;
}

// Orbs on the ground. Each lies where it settled until the player comes within reach, then flies to him, faster
// and faster, and is picked up. They never merge and never fade; a new run clears them. No drawing:
// render/PickupsView reads `list`.
export class Pickups {
  readonly list: Pickup[] = [];

  onCollected: (kind: PickupKind) => void = () => {};

  // Drops `count` orbs at a spot, popping out in random directions up to `speed` fast.
  drop(kind: PickupKind, x: number, y: number, count: number, speed = cfg.popSpeed): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + 0.7 * Math.random());
      this.list.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, flying: false, speed: 0, called: false, phase: Math.random() * Math.PI * 2 });
    }
  }

  // Every orb flies to the player as soon as it has settled.
  callAll(): void {
    for (const p of this.list) p.called = true;
  }

  clear(): void {
    this.list.length = 0;
  }

  // `collecting` is false while he cannot pick things up (dead, or a scene has control).
  update(dt: number, px: number, py: number, collecting: boolean): void {
    const drag = Math.exp(-cfg.popDrag * dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      const dx = px - p.x;
      const dy = py - p.y;
      const d = Math.hypot(dx, dy);
      if (!p.flying) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= drag;
        p.vy *= drag;
        if (collecting && p.age >= cfg.settleTime && (p.called || reach(dx, dy) <= cfg.pickupRadius)) {
          p.flying = true;
          p.speed = cfg.flyStartSpeed;
        }
        continue;
      }
      if (!collecting) continue;
      p.speed = Math.min(cfg.flySpeed, p.speed + cfg.flyAccel * dt);
      const move = p.speed * dt;
      if (d <= cfg.collectRadius || move >= d) {
        this.list.splice(i, 1);
        this.onCollected(p.kind);
        continue;
      }
      p.x += (dx / d) * move;
      p.y += (dy / d) * move;
    }
  }
}
