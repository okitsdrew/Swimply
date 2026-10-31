import { feel } from '../config/feel';
import { render } from '../config/render';
import { WolfConfig } from '../config/werewolf';
import { toScreen, Vec2 } from '../core/iso';
import { Navigator } from './Nav';
import { Target } from './targets';
import { CollisionWorld } from './World';

export type WolfState = 'gone' | 'rising' | 'walk' | 'windup' | 'dash' | 'slam' | 'crouch' | 'jump' | 'land' | 'recover';

const off = { x: 0, y: 0 };
const way = { x: 0, y: 0 };

// The werewolf mini-boss. One at a time, so this is a single creature rather than a list. A state machine with
// two attacks, picked at random when the player comes in range:
//   dash: windup (the attack rectangle grows, aimed where the player was) -> dash (to the rectangle's far end,
//         hurting what it passes) -> slam (hurts the far end) -> recover
//   jump: crouch -> jump (in the air, over anything, toward where the player was) -> land (hurts the landing
//         circle) -> recover
// No drawing: render/WerewolfView reads the state.
export class Werewolf implements Target {
  // Arrows remember what they have hit by id; this one never matches a Shade's.
  readonly id = -1;
  x = 0;
  y = 0;
  radius: number;
  alive = false;
  hp = 0;
  state: WolfState = 'gone';
  // Seconds spent in the current state.
  time = 0;
  vx = 0;
  vy = 0;
  flash = 0;
  // The attack: where the rectangle starts, its locked direction, and how far it reaches right now.
  ax = 0;
  ay = 0;
  dirX = 1;
  dirY = 0;
  reach = 0;
  // How far the dash has gone.
  private dashed = 0;
  // The stretch of the rectangle (distances along it) he passed through in this step's dash, or null.
  sweep: { from: number; to: number } | null = null;
  // True for the one step in which he slams.
  slammed = false;
  // The jump: where it started, where it lands, and true for the one step in which he lands.
  jx = 0;
  jy = 0;
  private sx = 0;
  private sy = 0;
  landed = false;
  // Set by the scene when an attack would have caught the player, so a dash the player survived counts as a miss.
  struck = false;
  private dashMissed = false;
  private cooldown = 0;
  // Which way he faces on screen, -1 or 1.
  facing = 1;

  // Which config section drives him (the mini-boss now; plain elites later).
  constructor(readonly cfg: WolfConfig) {
    this.radius = cfg.radius * cfg.scale;
  }

  // In the air: arrows and touch pass under him.
  get airborne(): boolean {
    return this.state === 'jump';
  }

  // How far through the jump he is, 0 to 1.
  get jumpProgress(): number {
    return this.state === 'jump' ? Math.min(1, this.time / Math.max(this.cfg.jumpAirTime, 1e-3)) : 0;
  }

  onRisen: () => void = () => {};
  onSlam: () => void = () => {};
  onLand: () => void = () => {};
  onKilled: (x: number, y: number) => void = () => {};

  get present(): boolean {
    return this.state !== 'gone';
  }

  spawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.hp = this.cfg.hp;
    this.alive = false;
    this.vx = 0;
    this.vy = 0;
    this.reach = 0;
    this.cooldown = 0;
    this.dashMissed = false;
    this.enter('rising');
  }

  clear(): void {
    this.alive = false;
    this.enter('gone');
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.flash = feel.hitFlashTime;
    if (this.hp <= 0) {
      this.clear();
      this.onKilled(this.x, this.y);
    }
  }

  // True if he is walking into the circle (the player's hit circle).
  touching(x: number, y: number, r: number): boolean {
    if (!this.alive || this.airborne) return false;
    const min = r + this.radius * this.cfg.contactScale;
    return (this.x - x) ** 2 + (this.y - y) ** 2 < min * min;
  }

  // True if the circle is inside the attack rectangle between `from` and `to` (distances along it).
  inAttack(x: number, y: number, r: number, from = 0, to = this.reach): boolean {
    const px = x - this.ax;
    const py = y - this.ay;
    const along = px * this.dirX + py * this.dirY;
    const side = Math.abs(px * this.dirY - py * this.dirX);
    return along >= from - r && along <= to + r && side <= this.cfg.attackWidth / 2 + r;
  }

  // True if the circle was in his path during this step's dash: the danger travels with him.
  inDash(x: number, y: number, r: number): boolean {
    return !!this.sweep && this.inAttack(x, y, r, this.sweep.from - this.cfg.attackWidth / 2, this.sweep.to + this.cfg.attackWidth / 2);
  }

  // True if the circle is where the slam lands: the far end of the rectangle.
  inSlam(x: number, y: number, r: number): boolean {
    return this.inAttack(x, y, r, this.reach - this.cfg.attackWidth, this.reach);
  }

  // True if the circle is inside the landing circle.
  inLanding(x: number, y: number, r: number): boolean {
    const min = this.cfg.jumpRadius + r;
    return (x - this.jx) ** 2 + (y - this.jy) ** 2 < min * min;
  }

  update(dt: number, world: CollisionWorld, nav: Navigator, target: Vec2): void {
    if (this.state === 'gone') return;
    this.radius = this.cfg.radius * this.cfg.scale;
    this.landed = false;
    this.time += dt;
    this.flash -= dt;
    this.sweep = null;
    this.slammed = false;
    this.cooldown -= dt;
    switch (this.state) {
      case 'rising':
        if (this.time >= this.cfg.spawnTell) {
          this.alive = true;
          this.enter('walk');
          this.onRisen();
        }
        break;
      case 'walk':
        this.walk(dt, world, nav, target);
        if (this.cooldown <= 0 && Math.hypot(target.x - this.x, target.y - this.y) <= this.cfg.triggerRange) {
          const chance = this.dashMissed ? this.cfg.jumpChanceAfterMiss : this.cfg.jumpChance;
          if (Math.random() < chance) this.startCrouch(target);
          else this.startWindup(target);
        }
        break;
      case 'windup': {
        // Grows fast at first and settles into its full length, so the far end is clear well before the dash.
        const k = Math.min(1, this.time / Math.max(this.cfg.windupTime, 1e-3));
        this.reach = this.cfg.attackRange * (1 - (1 - k) ** 2);
        if (k >= 1) {
          this.dashed = 0;
          this.enter('dash');
        }
        break;
      }
      case 'dash': {
        const step = Math.min(this.cfg.dashSpeed * dt, this.cfg.attackRange - this.dashed);
        const bx = this.x;
        const by = this.y;
        this.x += this.dirX * step;
        this.y += this.dirY * step;
        world.resolve(this);
        const moved = Math.hypot(this.x - bx, this.y - by);
        this.sweep = { from: this.dashed, to: this.dashed + moved };
        this.dashed += step;
        // Stopped short by a wall: the slam lands where he stands, and the rectangle shrinks to match.
        if (moved < step * 0.5) this.reach = Math.min(this.reach, Math.hypot(this.x - this.ax, this.y - this.ay));
        if (this.dashed >= this.cfg.attackRange - 1e-6 || moved < step * 0.5) {
          this.enter('slam');
          this.slammed = true;
          this.onSlam();
          this.dashMissed = !this.struck;
        }
        break;
      }
      case 'crouch':
        this.face(target);
        if (this.time >= this.cfg.jumpWindup) this.startJump(target);
        break;
      case 'jump': {
        // Straight over everything: no collision until he lands.
        const k = this.jumpProgress;
        this.x = this.sx + (this.jx - this.sx) * k;
        this.y = this.sy + (this.jy - this.sy) * k;
        if (k >= 1) {
          world.resolve(this);
          this.enter('land');
          this.landed = true;
          this.onLand();
        }
        break;
      }
      case 'land':
        if (this.time >= this.cfg.jumpLandTime) this.enter('recover');
        break;
      case 'slam':
        if (this.time >= this.cfg.slamTime) this.enter('recover');
        break;
      case 'recover':
        if (this.time >= this.cfg.recoverTime) {
          this.cooldown = this.cfg.attackCooldown;
          this.enter('walk');
        }
        break;
    }
  }

  private enter(state: WolfState): void {
    this.state = state;
    this.time = 0;
  }

  private face(target: Vec2): void {
    this.facing = toScreen(target.x - this.x, target.y - this.y, off).x < 0 ? -1 : 1;
  }

  private startCrouch(target: Vec2): void {
    this.vx = 0;
    this.vy = 0;
    this.dashMissed = false;
    this.face(target);
    this.enter('crouch');
  }

  // Leaps at where the player is now, no further than jumpRange.
  private startJump(target: Vec2): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const d = Math.hypot(dx, dy);
    const k = d > this.cfg.jumpRange ? this.cfg.jumpRange / d : 1;
    this.sx = this.x;
    this.sy = this.y;
    this.jx = this.x + dx * k;
    this.jy = this.y + dy * k;
    this.enter('jump');
  }

  private startWindup(target: Vec2): void {
    this.struck = false;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.dirX = dx / d;
    this.dirY = dy / d;
    this.ax = this.x;
    this.ay = this.y;
    this.reach = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = toScreen(dx, dy, off).x < 0 ? -1 : 1;
    this.enter('windup');
  }

  private walk(dt: number, world: CollisionWorld, nav: Navigator, target: Vec2): void {
    nav.direction(this.x, this.y, this.radius, way);
    let speed = this.cfg.speed;
    if (this.cfg.uniformScreenSpeed) {
      toScreen(way.x, way.y, off);
      speed *= (render.isoScale * Math.SQRT2) / (Math.hypot(off.x, off.y) || 1);
    }
    const turn = 1 - Math.exp(-this.cfg.turnRate * dt);
    this.vx += (way.x * speed - this.vx) * turn;
    this.vy += (way.y * speed - this.vy) * turn;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    world.resolve(this);
    this.facing = toScreen(target.x - this.x, target.y - this.y, off).x < 0 ? -1 : 1;
  }
}
