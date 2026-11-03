import { feel } from '../config/feel';
import { priest } from '../config/priest';
import { Navigator } from './Nav';
import { Target } from './targets';
import { CollisionWorld } from './World';

export type PriestState = 'idle' | 'rising' | 'walk' | 'windup' | 'cast' | 'blinkOut' | 'blinkIn';

export interface Priest extends Target {
  hp: number;
  state: PriestState;
  // Seconds spent in the current state.
  time: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  flash: number;
  // Seconds until it may start its next cast.
  cooldown: number;
  // Seconds until it may teleport again, and where the teleport it is in goes.
  tpCooldown: number;
  bx: number;
  by: number;
}

export interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Seconds it has flown.
  age: number;
}

const way = { x: 0, y: 0 };
const test = { x: 0, y: 0, radius: 0 };
// Priests id themselves from here up, apart from Shades (counting up from 1) and werewolves (below zero).
let nextId = 1_000_000;

// Priests walk toward the player until he is within castRange and nothing solid is between them, then stand
// (backing off if he comes too close) and cast: windup (arms up, the warning) -> cast (the orb leaves, aimed where
// he stands at that moment) -> walk, with a cooldown before the next. Orbs fly straight, over water and (with
// orbsThroughWalls) through walls; otherwise they stop at whatever stops arrows. No drawing: render/PriestsView reads `list` and `orbs`.
export class Priests {
  readonly list: Priest[] = [];
  readonly orbs: Orb[] = [];

  onCast: (p: Priest, orb: Orb) => void = () => {};
  onRisen: (p: Priest) => void = () => {};
  onKilled: (x: number, y: number, p: Priest) => void = () => {};
  onOrbGone: (x: number, y: number) => void = () => {};
  // It fades out at (x0, y0) and will appear at (x1, y1).
  onTeleport: (p: Priest, x0: number, y0: number, x1: number, y1: number) => void = () => {};

  // One rising at (x, y): the spawn mark shows first.
  spawn(x: number, y: number): Priest {
    const p: Priest = {
      id: nextId++, x, y, radius: priest.radius * priest.scale, alive: false, hp: priest.hp, state: 'rising', time: 0,
      vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, cooldown: priest.firstCast, tpCooldown: priest.firstTeleport, bx: x, by: y,
    };
    this.list.push(p);
    return p;
  }

  // Placed in a map: it stands there, and can be shot, until wake() (the player comes near, or an arrow hits it).
  wait(x: number, y: number): Priest {
    const p = this.spawn(x, y);
    p.alive = true;
    p.state = 'idle';
    return p;
  }

  wake(p: Priest): void {
    if (p.state !== 'idle') return;
    p.state = 'walk';
    p.time = 0;
    p.cooldown = priest.firstCast;
    p.tpCooldown = priest.firstTeleport;
  }

  clear(): void {
    this.list.length = 0;
    this.orbs.length = 0;
  }

  damage(target: Target, amount: number, fromX: number, fromY: number): void {
    const p = target as Priest;
    if (!p.alive) return;
    this.wake(p);
    p.hp -= amount;
    p.flash = feel.hitFlashTime;
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    p.kx += (dx / d) * priest.knockback;
    p.ky += (dy / d) * priest.knockback;
    if (p.hp <= 0) this.kill(p);
  }

  kill(p: Priest): void {
    p.alive = false;
    this.list.splice(this.list.indexOf(p), 1);
    this.onKilled(p.x, p.y, p);
  }

  // True if a Priest's body or one of the orbs overlaps the circle (the player's forgiving hit circle).
  touching(x: number, y: number, r: number): boolean {
    for (const p of this.list) {
      if (!p.alive || p.state === 'blinkOut' || p.state === 'blinkIn') continue;
      const min = r + p.radius * priest.contactScale;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < min * min) return true;
    }
    for (const o of this.orbs) {
      const min = r + priest.orbRadius * priest.orbContact;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < min * min) return true;
    }
    return false;
  }

  update(dt: number, world: CollisionWorld, nav: Navigator, target: { x: number; y: number }): void {
    const turn = 1 - Math.exp(-priest.turnRate * dt);
    const kdecay = Math.exp(-priest.knockbackDecay * dt);
    for (const p of this.list) {
      p.radius = priest.radius * priest.scale;
      p.flash -= dt;
      p.time += dt;
      if (p.state === 'rising') {
        if (p.time >= Math.max(priest.spawnTell, 1e-4)) {
          p.alive = true;
          this.enter(p, 'walk');
          this.onRisen(p);
        }
        continue;
      }
      if (p.state === 'idle') continue;

      const tx = target.x - p.x;
      const ty = target.y - p.y;
      const dist = Math.hypot(tx, ty) || 1;
      const seen = !priest.needsSight || world.raycast(p.x, p.y, tx / dist, ty / dist, dist) < 0;
      let wantX = 0;
      let wantY = 0;
      if (p.state === 'walk') {
        p.cooldown -= dt;
        p.tpCooldown -= dt;
        if (!seen || dist > priest.castRange) {
          if (!(p.tpCooldown <= 0 && this.blink(p, this.castSpot(p, target, world)))) {
            nav.direction(p.x, p.y, p.radius, way);
            wantX = way.x * priest.speed;
            wantY = way.y * priest.speed;
          }
        } else if (dist < priest.tooClose && !(p.tpCooldown <= 0 && this.blink(p, this.escapeSpot(p, target, world)))) {
          wantX = (-tx / dist) * priest.backSpeed;
          wantY = (-ty / dist) * priest.backSpeed;
          if (p.cooldown <= 0) this.enter(p, 'windup');
        } else if (p.state === 'walk' && p.cooldown <= 0) this.enter(p, 'windup');
      } else if (p.state === 'blinkOut') {
        if (p.time >= priest.blinkTime) {
          p.x = p.bx;
          p.y = p.by;
          p.vx = p.vy = p.kx = p.ky = 0;
          this.enter(p, 'blinkIn');
        }
        continue;
      } else if (p.state === 'blinkIn') {
        if (p.time >= priest.blinkTime) this.enter(p, 'walk');
        continue;
      } else if (p.state === 'windup') {
        if (p.time >= priest.castWindup) {
          const orb = { x: p.x, y: p.y, vx: (tx / dist) * priest.orbSpeed, vy: (ty / dist) * priest.orbSpeed, age: 0 };
          this.orbs.push(orb);
          this.onCast(p, orb);
          this.enter(p, 'cast');
        }
      } else if (p.time >= priest.castHold) {
        p.cooldown = priest.castCooldown;
        this.enter(p, 'walk');
      }

      p.vx += (wantX - p.vx) * turn;
      p.vy += (wantY - p.vy) * turn;
      p.kx *= kdecay;
      p.ky *= kdecay;
      p.x += (p.vx + p.kx) * dt;
      p.y += (p.vy + p.ky) * dt;
      world.resolve(p);
    }

    const turnMax = ((priest.homingTurn * Math.PI) / 180) * dt;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.age += dt;
      // Homing: turn the heading toward him, by no more than turnMax this step.
      if (o.age < priest.homingTime && turnMax > 0) {
        const want = Math.atan2(target.y - o.y, target.x - o.x);
        const now = Math.atan2(o.vy, o.vx);
        let d = want - now;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const a = now + Math.max(-turnMax, Math.min(turnMax, d));
        o.vx = Math.cos(a) * priest.orbSpeed;
        o.vy = Math.sin(a) * priest.orbSpeed;
      }
      const step = Math.hypot(o.vx, o.vy) * dt;
      const hit = step > 0 && !priest.orbsThroughWalls ? world.raycast(o.x, o.y, (o.vx * dt) / step, (o.vy * dt) / step, step) : -1;
      const out = o.x < 0 || o.y < 0 || o.x > world.width || o.y > world.height;
      if (hit >= 0 || out || (priest.orbLife > 0 && o.age >= priest.orbLife)) {
        const k = hit >= 0 ? hit / step : 1;
        this.orbs.splice(i, 1);
        this.onOrbGone(o.x + o.vx * dt * k, o.y + o.vy * dt * k);
        continue;
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
    }
  }

  // Starts a teleport to the spot, if there is one.
  private blink(p: Priest, to: { x: number; y: number } | null): boolean {
    if (!to) return false;
    p.bx = to.x;
    p.by = to.y;
    p.tpCooldown = priest.teleportCooldown;
    this.onTeleport(p, p.x, p.y, to.x, to.y);
    this.enter(p, 'blinkOut');
    return true;
  }

  // Somewhere it can stand: inside the map, not in anything solid, not on water or a killing floor.
  private standable(x: number, y: number, r: number, world: CollisionWorld): boolean {
    if (x < r || y < r || x > world.width - r || y > world.height - r) return false;
    test.x = x;
    test.y = y;
    test.radius = r;
    world.resolve(test);
    if (Math.hypot(test.x - x, test.y - y) > 1) return false;
    return !world.onBlockingFloor(x, y, r) && !world.onHurtingFloor(x, y);
  }

  // A spot between tooClose and castRange from him, that can see him, within teleportRange of the priest (walls
  // in between do not matter). Of a few random tries, the one nearest the priest.
  private castSpot(p: Priest, target: { x: number; y: number }, world: CollisionWorld): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const near = Math.min(priest.tooClose + 50, priest.castRange);
    const far = Math.max(near, priest.castRange * 0.85);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = near + Math.random() * (far - near);
      const x = target.x + Math.cos(a) * d;
      const y = target.y + Math.sin(a) * d;
      const fromP = Math.hypot(x - p.x, y - p.y);
      if (fromP > priest.teleportRange || fromP >= bestD || !this.standable(x, y, p.radius, world)) continue;
      if (world.raycast(x, y, (target.x - x) / d, (target.y - y) / d, d) >= 0) continue;
      best = { x, y };
      bestD = fromP;
    }
    return best;
  }

  // A spot escapeDistance away from him, roughly straight away, with open ground the whole way there. Of a few
  // tries, the one farthest from him.
  private escapeSpot(p: Priest, target: { x: number; y: number }, world: CollisionWorld): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = -1;
    const away = Math.atan2(p.y - target.y, p.x - target.x);
    for (let i = 0; i < 10; i++) {
      const a = away + (Math.random() - 0.5) * (Math.PI * 2) / 3;
      const dx = Math.cos(a) * priest.escapeDistance;
      const dy = Math.sin(a) * priest.escapeDistance;
      const x = p.x + dx;
      const y = p.y + dy;
      const fromT = Math.hypot(x - target.x, y - target.y);
      if (fromT <= bestD || world.sweep(p.x, p.y, dx, dy, p.radius) < 1 || !this.standable(x, y, p.radius, world)) continue;
      best = { x, y };
      bestD = fromT;
    }
    return best;
  }

  private enter(p: Priest, state: PriestState): void {
    p.state = state;
    p.time = 0;
  }
}
