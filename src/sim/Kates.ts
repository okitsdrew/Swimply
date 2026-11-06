import { kate as cfg, kateFireballs } from '../config/kate';
import { Vec2 } from '../core/iso';
import { DebugDraw, EnemyGroup } from './enemies';
import { Firespawn, Kate } from './Kate';
import { Navigator } from './Nav';
import { Target } from './targets';
import { CollisionWorld } from './World';

const way = { x: 0, y: 0 };

// Kate Lamity as the scene sees her: usually one, placed in the kitchen. Each is her own state machine (sim/Kate).
export class Kates implements EnemyGroup<Kate> {
  readonly list: Kate[] = [];

  onRisen: (k: Kate) => void = () => {};
  onKilled: (x: number, y: number, k: Kate) => void = () => {};
  onAttack: (k: Kate) => void = () => {};
  onSwing: (k: Kate) => void = () => {};
  onSlap: (k: Kate) => void = () => {};
  onLand: (k: Kate) => void = () => {};
  onFireWave: (k: Kate) => void = () => {};

  constructor(private world: CollisionWorld) {}

  get bodyRadius(): number {
    return cfg.radius * cfg.scale;
  }

  get ccResist(): number {
    return cfg.ccResist;
  }

  private add(): Kate {
    const k = new Kate(this.world);
    k.onRisen = () => this.onRisen(k);
    k.onAttack = () => this.onAttack(k);
    k.onSwing = () => this.onSwing(k);
    k.onSlap = () => this.onSlap(k);
    k.onLand = () => this.onLand(k);
    k.onFireWave = () => this.onFireWave(k);
    k.onKilled = (x, y) => {
      this.list.splice(this.list.indexOf(k), 1);
      this.onKilled(x, y, k);
    };
    this.list.push(k);
    return k;
  }

  spawn(x: number, y: number): Kate {
    const k = this.add();
    k.spawn(x, y);
    return k;
  }

  wait(x: number, y: number): Kate {
    const k = this.add();
    k.wait(x, y);
    return k;
  }

  wake(k: Kate): void {
    k.wake();
  }

  waiting(k: Kate): boolean {
    return k.state === 'idle';
  }

  // Arrows reach her or one of her firespawns (see targets), each with its own health.
  damage(k: Kate | Firespawn, amount: number): void {
    k.damage(amount);
  }

  interrupt(k: Kate): void {
    k.interrupt();
  }

  push(k: Kate, fromX: number, fromY: number, amount: number): void {
    k.push(fromX, fromY, amount);
  }

  kill(k: Kate): void {
    k.damage(k.hp);
  }

  clear(): void {
    for (const k of this.list) k.clear();
    this.list.length = 0;
  }

  update(dt: number, world: CollisionWorld, nav: Navigator, target: Vec2): void {
    for (const k of this.list) k.update(dt, world, nav, target);
  }

  targets(out: Target[]): void {
    for (const k of this.list) {
      if (k.alive && !k.airborne) out.push(k);
      for (const f of k.firespawns) if (f.alive) out.push(f);
    }
  }

  // The pan as it passes, the Fire Slam's landing, and her fireballs and rings of fire (which carry on through a stun).
  strikes(x: number, y: number, r: number, safe: boolean): boolean {
    if (safe) return false;
    return this.list.some((k) => (!k.status.held && k.inPan(x, y, r)) || k.inLanding(x, y, r) || k.inFire(x, y, r) || k.inWave(x, y, r));
  }

  touching(x: number, y: number, r: number): boolean {
    return this.list.some((k) => k.touching(x, y, r));
  }

  // Her body, her fireballs, rings of fire and landing spot, and the pan's line and reach while she swings.
  debug(d: DebugDraw): void {
    for (const k of this.list) {
      if (!k.alive) continue;
      d.ring(k.x, k.y, k.radius, false);
      d.ring(k.x, k.y, k.radius * cfg.contactScale, true);
      for (const f of k.fireballs.list) if (f.age >= 0) d.ring(f.x, f.y, kateFireballs.hitRadius, true);
      for (const w of k.waves) d.ring(w.x, w.y, w.r, true);
      for (const f of k.firespawns) if (f.alive) d.ring(f.x, f.y, f.radius, false);
      if (k.state === 'jump') d.ring(k.jx, k.jy, cfg.slamRadius, true);
      if (k.state !== 'windup' && k.state !== 'swing' && k.state !== 'follow') continue;
      k.panDirection(k.panAngle, way);
      const reach = cfg.panReach * cfg.scale;
      d.line(k.x + way.x * reach * cfg.panHitFrom, k.y + way.y * reach * cfg.panHitFrom, k.x + way.x * reach, k.y + way.y * reach);
      d.ring(k.x + way.x * reach, k.y + way.y * reach, cfg.panHitRadius, k.state === 'swing' && k.move === 'strike');
    }
  }
}
