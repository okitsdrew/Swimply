import { feel } from '../config/feel';
import { kate as cfg, kateFireballs } from '../config/kate';
import { render } from '../config/render';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { Fireballs } from './Fireballs';
import { Navigator } from './Nav';
import { Status } from './status';
import { Target } from './targets';
import { CollisionWorld } from './World';

export type KateState = 'gone' | 'idle' | 'rising' | 'walk' | 'strikeDash' | 'windup' | 'swing' | 'follow' | 'recover' | 'hop';

const off = { x: 0, y: 0 };
const way = { x: 0, y: 0 };
const DEG = Math.PI / 180;

// Like the werewolf, below zero so arrows never mix her up with a Shade (and far below, apart from the werewolves).
let nextId = -1e6;

// Kate Lamity, the kitchen boss: a state machine with two attacks (see config/kate.ts).
//   Pan Strike: strikeDash (to strikeGap short of him) -> windup -> swing (the pan hurts as it passes) -> follow ->
//               recover
//   Fire Slap:  windup (the butterfly flies in front of her) -> swing (at its middle, two fireballs leave for where
//               he is) -> follow -> hop (sideways, leaning toward the room's middle) -> windup... slapShots times,
//               then recover
// The swing is one shared piece: `panAngle` is a screen angle round her (0 her right, 90 toward the camera), turned
// by `turn` so its middle points at him. No drawing: render/KateView reads the state.
export class Kate implements Target {
  readonly id = nextId--;
  x = 0;
  y = 0;
  radius = cfg.radius * cfg.scale;
  alive = false;
  hp = 0;
  readonly status = new Status();
  state: KateState = 'gone';
  // Which attack the swing belongs to.
  move: 'strike' | 'slap' = 'strike';
  time = 0;
  vx = 0;
  vy = 0;
  kx = 0;
  ky = 0;
  flash = 0;
  // The pan: its angle (before the turn) now and at the last step, and the turn (degrees) toward him.
  panAngle = cfg.restAngle;
  private lastAngle = cfg.restAngle;
  turn = 0;
  // The dash or hop: its direction and the distance left.
  private dirX = 0;
  private dirY = 0;
  private left = 0;
  // Fire Slap: shots fired so far, the side she last hopped to, and true once this slap's fireballs are out.
  shots = 0;
  private hopSide = 1;
  private thrown = false;
  private cooldown = 0;
  // Which way she faces on screen while walking or dashing, -1 or 1.
  facing = 1;
  // Her fireballs, which come back to her.
  readonly fireballs: Fireballs;

  onRisen: () => void = () => {};
  onAttack: () => void = () => {};
  // The swing begins (the whoosh), and the slap sends its fireballs.
  onSwing: () => void = () => {};
  onSlap: () => void = () => {};
  onKilled: (x: number, y: number) => void = () => {};

  constructor(world: CollisionWorld) {
    this.fireballs = new Fireballs(world, () => false, kateFireballs);
  }

  get present(): boolean {
    return this.state !== 'gone';
  }

  // The butterfly is in front of her for the Fire Slap, from its windup to the end of its follow-through.
  get slapping(): boolean {
    return this.move === 'slap' && (this.state === 'windup' || this.state === 'swing' || this.state === 'follow');
  }

  // Where the slap's butterfly is: butterflyFront toward him.
  butterfly(out: Vec2): Vec2 {
    this.panDirection(cfg.midAngle, out);
    out.x = this.x + out.x * cfg.butterflyFront;
    out.y = this.y + out.y * cfg.butterflyFront;
    return out;
  }

  spawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.hp = cfg.hp;
    this.alive = false;
    this.vx = 0;
    this.vy = 0;
    this.cooldown = 0;
    this.panAngle = this.lastAngle = cfg.restAngle;
    this.fireballs.clear();
    this.enter('rising');
  }

  wait(x: number, y: number): void {
    this.spawn(x, y);
    this.alive = true;
    this.enter('idle');
  }

  wake(): void {
    if (this.state === 'idle') this.enter('walk');
  }

  clear(): void {
    this.alive = false;
    this.status.clear();
    this.fireballs.clear();
    this.enter('gone');
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.wake();
    this.hp -= amount;
    this.flash = feel.hitFlashTime;
    if (this.hp <= 0) {
      this.clear();
      this.onKilled(this.x, this.y);
    }
  }

  touching(x: number, y: number, r: number): boolean {
    if (!this.alive || this.status.held) return false;
    const min = r + this.radius * cfg.contactScale;
    return (this.x - x) ** 2 + (this.y - y) ** 2 < min * min;
  }

  // The swing's world direction for a pan angle, turned toward him: a circle round her seen on screen.
  panDirection(angle: number, out: Vec2): Vec2 {
    const a = (angle + this.turn) * DEG;
    toWorld(Math.cos(a), 0.5 * Math.sin(a), out);
    const len = Math.hypot(out.x, out.y) || 1;
    out.x /= len;
    out.y /= len;
    return out;
  }

  // True if the circle was in the pan's path this step: the pan's line, from panHitFrom out to its reach, swept from
  // where it was to where it is now.
  inPan(x: number, y: number, r: number): boolean {
    if (this.state !== 'swing' || this.move !== 'strike') return false;
    const from = this.lastAngle;
    const to = this.panAngle;
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 8));
    const reach = cfg.panReach * cfg.scale;
    const near = reach * cfg.panHitFrom;
    const hit = cfg.panHitRadius + r;
    for (let i = 0; i <= steps; i++) {
      this.panDirection(from + ((to - from) * i) / steps, way);
      const px = x - this.x;
      const py = y - this.y;
      const along = Math.max(near, Math.min(reach, px * way.x + py * way.y));
      if ((px - way.x * along) ** 2 + (py - way.y * along) ** 2 < hit * hit) return true;
    }
    return false;
  }

  // True if one of her fireballs is on the circle.
  inFire(x: number, y: number, r: number): boolean {
    const hit = kateFireballs.hitRadius + r;
    return this.fireballs.list.some((f) => f.age >= 0 && (f.x - x) ** 2 + (f.y - y) ** 2 < hit * hit);
  }

  interrupt(): void {
    if (this.state === 'gone' || this.state === 'idle' || this.state === 'rising' || this.state === 'walk') return;
    this.cooldown = cfg.attackCooldown;
    this.panAngle = this.lastAngle = cfg.restAngle;
    this.enter('walk');
  }

  push(fromX: number, fromY: number, amount: number): void {
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.kx += (dx / d) * amount * cfg.knockbackTaken;
    this.ky += (dy / d) * amount * cfg.knockbackTaken;
  }

  update(dt: number, world: CollisionWorld, nav: Navigator, target: Vec2): void {
    this.fireballs.update(dt, this.x, this.y, []);
    if (this.state === 'gone') return;
    this.radius = cfg.radius * cfg.scale;
    if (this.kx || this.ky) {
      this.x += this.kx * dt;
      this.y += this.ky * dt;
      const k = Math.exp(-cfg.knockbackDecay * dt);
      this.kx = Math.abs(this.kx * k) < 1 ? 0 : this.kx * k;
      this.ky = Math.abs(this.ky * k) < 1 ? 0 : this.ky * k;
      world.resolve(this);
    }
    this.lastAngle = this.panAngle;
    this.flash -= dt;
    if (this.status.held && this.state !== 'rising' && this.state !== 'idle') return;
    this.time += dt;
    this.cooldown -= dt;
    switch (this.state) {
      case 'rising':
        if (this.time >= cfg.spawnTell) {
          this.alive = true;
          this.enter('walk');
          this.onRisen();
        }
        break;
      case 'walk':
        this.walk(dt, world, nav, target);
        this.choose(target);
        break;
      case 'strikeDash':
      case 'hop': {
        const speed = this.state === 'hop' ? cfg.hopDistance / Math.max(cfg.hopTime, 1e-3) : cfg.dashSpeed;
        const step = Math.min(speed * dt, this.left);
        const f = world.sweep(this.x, this.y, this.dirX * step, this.dirY * step, this.radius);
        this.x += this.dirX * step * f;
        this.y += this.dirY * step * f;
        world.resolve(this);
        this.left -= step;
        if (this.left <= 1e-6 || f < 1) this.startWindup(target);
        break;
      }
      case 'windup': {
        const time = this.move === 'slap' ? cfg.gatherTime : cfg.windupTime;
        // The pan goes back the short way (over her head, behind her), then she holds it there.
        const k = Math.min(1, this.time / Math.max(time * cfg.windupRaise, 1e-3));
        this.panAngle = cfg.restAngle + shortest(cfg.restAngle, cfg.windAngle) * ease(k);
        if (this.time >= time) {
          this.panAngle = cfg.windAngle;
          this.thrown = false;
          this.enter('swing');
          this.onSwing();
        }
        break;
      }
      case 'swing': {
        // Straight across the front, the long way: windAngle through midAngle to followAngle.
        const k = Math.min(1, this.time / Math.max(cfg.swingTime, 1e-3));
        this.panAngle = cfg.windAngle + (cfg.followAngle - cfg.windAngle) * k;
        const mid = (cfg.midAngle - cfg.windAngle) / (cfg.followAngle - cfg.windAngle || 1);
        if (this.move === 'slap' && !this.thrown && k >= mid) this.slap(target);
        if (k >= 1) this.enter('follow');
        break;
      }
      case 'follow':
        if (this.time < (this.move === 'slap' ? cfg.slapFollowTime : cfg.followTime)) break;
        if (this.move === 'slap' && this.shots < cfg.slapShots) this.startHop(world, target);
        else this.enter('recover');
        break;
      case 'recover': {
        const k = Math.min(1, this.time / Math.max(cfg.recoverTime, 1e-3));
        this.panAngle = cfg.followAngle + shortest(cfg.followAngle, cfg.restAngle) * ease(k);
        if (k >= 1) {
          this.panAngle = cfg.restAngle;
          this.cooldown = cfg.attackCooldown;
          this.enter('walk');
        }
        break;
      }
    }
  }

  private enter(state: KateState): void {
    this.state = state;
    this.time = 0;
  }

  // Near enough, the Pan Strike; further, the Fire Slap.
  private choose(target: Vec2): void {
    if (this.cooldown > 0) return;
    const d = Math.hypot(target.x - this.x, target.y - this.y);
    if (d <= cfg.strikeRange) this.startStrike(target, d);
    else if (d <= cfg.slapRange) {
      this.move = 'slap';
      this.shots = 0;
      this.onAttack();
      this.startWindup(target);
    }
  }

  private startStrike(target: Vec2, d: number): void {
    this.move = 'strike';
    this.onAttack();
    this.dirX = (target.x - this.x) / (d || 1);
    this.dirY = (target.y - this.y) / (d || 1);
    this.left = Math.min(cfg.strikeDashMax, Math.max(0, d - cfg.strikeGap));
    this.faceAlong(this.dirX, this.dirY);
    if (this.left <= 1) this.startWindup(target);
    else this.enter('strikeDash');
  }

  // Turns the swing so its middle points at him, and starts the windup.
  private startWindup(target: Vec2): void {
    this.vx = 0;
    this.vy = 0;
    toScreen(target.x - this.x, target.y - this.y, off);
    if (Math.hypot(off.x, off.y) > 1e-3) this.turn = Math.atan2(off.y * 2, off.x) / DEG - cfg.midAngle;
    this.enter('windup');
  }

  // The slap lands: two fireballs leave the butterfly for where he is now.
  private slap(target: Vec2): void {
    this.thrown = true;
    this.shots++;
    this.butterfly(off);
    const dx = target.x - off.x;
    const dy = target.y - off.y;
    const range = Math.max(kateFireballs.minRange, Math.min(kateFireballs.range, Math.hypot(dx, dy)));
    this.fireballs.cast(off.x, off.y, dx, dy, range);
    this.onSlap();
  }

  // Sideways to him, on the side nearer the room's middle, bent toward it by hopToMiddle (alternating sides at 0).
  private startHop(world: CollisionWorld, target: Vec2): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const sx = -dy / d;
    const sy = dx / d;
    const mx = world.width / 2 - this.x;
    const my = world.height / 2 - this.y;
    const md = Math.hypot(mx, my) || 1;
    const w = cfg.hopToMiddle;
    const toward = sx * mx + sy * my;
    this.hopSide = w > 0 && Math.abs(toward) > 1e-3 ? Math.sign(toward) : -this.hopSide;
    let hx = sx * this.hopSide * (1 - w) + (mx / md) * w;
    let hy = sy * this.hopSide * (1 - w) + (my / md) * w;
    const len = Math.hypot(hx, hy) || 1;
    hx /= len;
    hy /= len;
    this.dirX = hx;
    this.dirY = hy;
    this.left = cfg.hopDistance;
    this.faceAlong(hx, hy);
    this.enter('hop');
  }

  private faceAlong(dx: number, dy: number): void {
    this.facing = toScreen(dx, dy, off).x < 0 ? -1 : 1;
  }

  private walk(dt: number, world: CollisionWorld, nav: Navigator, target: Vec2): void {
    nav.direction(this.x, this.y, this.radius, way);
    let speed = cfg.speed * this.status.speedMult;
    if (cfg.uniformScreenSpeed) {
      toScreen(way.x, way.y, off);
      speed *= (render.isoScale * Math.SQRT2) / (Math.hypot(off.x, off.y) || 1);
    }
    const turn = 1 - Math.exp(-cfg.turnRate * dt);
    this.vx += (way.x * speed - this.vx) * turn;
    this.vy += (way.y * speed - this.vy) * turn;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    world.resolve(this);
    this.faceAlong(target.x - this.x, target.y - this.y);
  }
}

// The short way round from angle a to angle b, in degrees (-180 to 180).
function shortest(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}
