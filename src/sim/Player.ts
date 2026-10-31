import { bow, dash, player as cfgPlayer, teleport } from '../config/character';
import { feel } from '../config/feel';
import { render } from '../config/render';
import { Input } from '../core/input';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { stats } from './stats';
import { CollisionWorld } from './World';

const tmp = { x: 0, y: 0 };

// Turns a screen-space direction (length = amount, 0..1) into a world velocity.
// Uniform mode keeps on-screen speed equal in every direction; the iso projection otherwise
// makes horizontal screen movement twice as fast as vertical and diagonals feel slow.
function screenToWorldVel(dx: number, dy: number, speed: number, out: Vec2): Vec2 {
  if (cfgPlayer.uniformScreenSpeed) {
    const s = speed * cfgPlayer.screenSpeedMult * render.isoScale * Math.SQRT2;
    return toWorld(dx * s, dy * s, out);
  }
  toWorld(dx, dy, out);
  const len = Math.hypot(out.x, out.y);
  const k = len > 0 ? (speed * Math.hypot(dx, dy)) / len : 0;
  out.x *= k;
  out.y *= k;
  return out;
}

// Pure simulation in world space. Rendering lives in render/PlayerView.
export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  aimX = 1;
  aimY = 0;
  // Offset from him to the cursor in world space, or null when there is no cursor.
  private aimOffX = 0;
  private aimOffY = 0;
  private hasCursor = false;

  fireCooldown = 0;
  dashTime = 0;
  dashCooldown = 0;
  dashBuffer = 0;
  dashVx = 0;
  dashVy = 0;
  dashEndVx = 0;
  dashEndVy = 0;
  dashCooldownMax = 0;
  teleportCooldown = 0;
  teleportTime = 0;
  lockTime = 0;
  armsUpTimer = 0;
  private lockTotal = 0;
  private lockStartMult = 1;
  private lockEndMult = 1;
  private tpVx = 0;
  private tpVy = 0;
  private tpEndVx = 0;
  private tpEndVy = 0;
  private lockVx = 0;
  private lockVy = 0;
  readyTimer = 0;
  // Grace period after a dash or teleport ends.
  graceTime = 0;
  fireBlocked = false;
  shootSlowTimer = 0;
  private lastMoveX = 0;
  private lastMoveY = 0;
  private body = { x: 0, y: 0, radius: 0 };

  onFire: (x: number, y: number, dirX: number, dirY: number) => void = () => {};
  onDashStart: () => void = () => {};
  onTeleport: (fromX: number, fromY: number, toX: number, toY: number, travelTime: number) => void = () => {};
  onTeleportArrive: (x: number, y: number) => void = () => {};

  // What his body and his teleport cannot pass through.
  constructor(private world: CollisionWorld) {}

  // Back to a fresh start at (x, y), keeping the callbacks the scene wired up.
  reset(x: number, y: number): void {
    const { onFire, onDashStart, onTeleport, onTeleportArrive } = this;
    Object.assign(this, new Player(this.world), { onFire, onDashStart, onTeleport, onTeleportArrive, x, y });
  }

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  get teleporting(): boolean {
    return this.teleportTime > 0;
  }

  // True while the post-teleport lock is decelerating him into a slide.
  get sliding(): boolean {
    return this.lockTime > 0 && this.lockStartMult !== this.lockEndMult;
  }

  get invincible(): boolean {
    return this.dashing || this.teleporting;
  }

  // Cannot be killed: mid-dash or teleport, or in the short grace afterwards.
  get safe(): boolean {
    return this.invincible || this.graceTime > 0;
  }

  // 0 right after a shot, rising to 1 as the next shot is about to release.
  get drawProgress(): number {
    if (this.fireCooldown <= 0) return 0;
    const window = Math.min(feel.drawTime, 1 / Math.max(stats.fireRate(), 0.01));
    return 1 - Math.min(1, this.fireCooldown / window);
  }

  // 0 while ready, 1 right after a dash ends.
  get dashCooldownFraction(): number {
    return this.dashCooldownMax > 0 ? Math.max(0, this.dashCooldown / this.dashCooldownMax) : 0;
  }

  update(dt: number, input: Input, aimWorld: Vec2 | null): void {
    if (aimWorld) {
      const dx = aimWorld.x - this.x;
      const dy = aimWorld.y - this.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-3) {
        this.aimX = dx / len;
        this.aimY = dy / len;
      }
      this.aimOffX = dx;
      this.aimOffY = dy;
    }
    this.hasCursor = aimWorld !== null;

    if (input.justPressed('dash')) this.dashBuffer = Math.max(dash.inputBuffer, 1e-4);
    if (this.dashBuffer > 0 && !this.dashing && this.dashCooldown <= 0) {
      this.resolveMoveDir(input);
      this.startDash();
    }
    this.dashBuffer -= dt;
    this.armsUpTimer = Math.max(0, this.armsUpTimer - dt);
    this.graceTime = Math.max(0, this.graceTime - dt);

    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
    if (input.justPressed('teleport') && this.teleportCooldown <= 0) {
      this.teleport();
    }

    if (this.dashing) this.updateDash(dt);
    if (this.teleporting) this.updateTeleport(dt);
    if (!this.dashing && !this.teleporting) {
      if (this.lockTime > 0) this.updateLock(dt);
      else this.updateMove(dt, input);
    }

    if (!this.dashing) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.body.x = this.x;
    this.body.y = this.y;
    this.body.radius = cfgPlayer.bodyRadius;
    this.world.resolve(this.body, this.teleporting);
    this.x = this.body.x;
    this.y = this.body.y;
    this.updateFire(dt, input);
  }

  private updateMove(dt: number, input: Input): void {
    // Move input is in screen directions (W = up the screen); convert to a world direction.
    const speed = stats.moveSpeed() * (this.shootSlowTimer > 0 ? cfgPlayer.shootSpeedMult : 1);
    screenToWorldVel(input.move.x, input.move.y, speed, tmp);
    const tx = tmp.x;
    const ty = tmp.y;
    const dvx = tx - this.vx;
    const dvy = ty - this.vy;
    const dv = Math.hypot(dvx, dvy);
    const maxStep = cfgPlayer.accel * dt;
    if (dv <= maxStep) {
      this.vx = tx;
      this.vy = ty;
    } else {
      this.vx += (dvx / dv) * maxStep;
      this.vy += (dvy / dv) * maxStep;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  // Dash goes in the direction of movement, or the last one if standing still.
  private resolveMoveDir(input: Input): void {
    const len = Math.hypot(input.move.x, input.move.y);
    if (len > 0.01) {
      this.lastMoveX = input.move.x / len;
      this.lastMoveY = input.move.y / len;
    } else if (this.lastMoveX === 0 && this.lastMoveY === 0) {
      // Never moved yet: fall back to the aim direction as seen on screen.
      const from = toScreen(this.x, this.y, { x: 0, y: 0 });
      const to = toScreen(this.x + this.aimX, this.y + this.aimY, { x: 0, y: 0 });
      const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      this.lastMoveX = (to.x - from.x) / l;
      this.lastMoveY = (to.y - from.y) / l;
    }
  }

  // Teleports toward the cursor, using its direction as seen on screen. Optionally travels at dash speed.
  private teleport(): void {
    const fromX = this.x;
    const fromY = this.y;
    const from = toScreen(this.x, this.y, { x: 0, y: 0 });
    const to = toScreen(this.x + this.aimX, this.y + this.aimY, { x: 0, y: 0 });
    const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const dx = (to.x - from.x) / l;
    const dy = (to.y - from.y) / l;
    screenToWorldVel(dx, dy, stats.teleportDistance(), tmp);
    let jumpX = tmp.x;
    let jumpY = tmp.y;
    // A cursor inside the range is landed on exactly; outside it, he goes the full distance toward it.
    const full = Math.hypot(jumpX, jumpY);
    if (this.hasCursor && Math.hypot(this.aimOffX, this.aimOffY) < full) {
      jumpX = this.aimOffX;
      jumpY = this.aimOffY;
    }
    const stop = this.clipJump(jumpX, jumpY);
    jumpX *= stop;
    jumpY *= stop;
    const jumpLen = Math.hypot(jumpX, jumpY);
    screenToWorldVel(dx, dy, stats.moveSpeed(), tmp);
    this.tpEndVx = tmp.x;
    this.tpEndVy = tmp.y;

    const travel = teleport.speed > 0 ? jumpLen / teleport.speed : 0;
    this.teleportCooldown = teleport.cooldown;
    this.lockTime = 0;
    this.onTeleport(fromX, fromY, fromX + jumpX, fromY + jumpY, travel);
    if (travel > 1e-3) {
      this.teleportTime = travel;
      this.tpVx = jumpX / travel;
      this.tpVy = jumpY / travel;
    } else {
      this.x += jumpX;
      this.y += jumpY;
      this.endTeleport();
    }
  }

  // How much of a jump he gets (0 to 1). He passes over water but not through pillars or the map's edge, and never
  // lands in water: a jump that would end there is cut back to the last spot where he can stand.
  private clipJump(jx: number, jy: number): number {
    const len = Math.hypot(jx, jy);
    if (len < 1e-3) return 1;
    const r = cfgPlayer.bodyRadius;
    const best = this.world.sweep(this.x, this.y, jx, jy, r, true);
    let f = best < 1 ? Math.max(0, best - 4 / len) : 1;
    const back = 4 / len;
    while (f > 0 && this.world.onBlockingFloor(this.x + jx * f, this.y + jy * f, r)) f = Math.max(0, f - back);
    return f;
  }

  private updateTeleport(dt: number): void {
    const step = Math.min(dt, this.teleportTime);
    this.x += this.tpVx * step;
    this.y += this.tpVy * step;
    this.teleportTime -= dt;
    if (this.teleportTime <= 0) {
      this.teleportTime = 0;
      this.endTeleport();
    }
  }

  // After a teleport (or dash) input is locked briefly and he keeps walking the way he was going.
  private endTeleport(): void {
    this.graceTime = cfgPlayer.invulnAfter;
    this.vx = this.tpEndVx;
    this.vy = this.tpEndVy;
    this.armsUpTimer = teleport.armsUpTime;
    this.startLock(teleport.lockTime, this.tpEndVx, this.tpEndVy, teleport.slideStartMult, teleport.slideEndMult);
    this.onTeleportArrive(this.x, this.y);
  }

  private startLock(time: number, vx: number, vy: number, startMult: number, endMult: number): void {
    this.lockTime = time;
    this.lockTotal = time;
    this.lockVx = vx;
    this.lockVy = vy;
    this.lockStartMult = startMult;
    this.lockEndMult = endMult;
  }

  // Locked input: he keeps going the way he went, easing from the start speed to the end speed.
  private updateLock(dt: number): void {
    this.lockTime = Math.max(0, this.lockTime - dt);
    const f = this.lockTotal > 0 ? 1 - this.lockTime / this.lockTotal : 1;
    const mult = this.lockStartMult + (this.lockEndMult - this.lockStartMult) * f;
    this.vx = this.lockVx * mult;
    this.vy = this.lockVy * mult;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  private startDash(): void {
    screenToWorldVel(this.lastMoveX, this.lastMoveY, dash.distance / dash.duration, tmp);
    this.dashVx = tmp.x;
    this.dashVy = tmp.y;
    // Carry normal run speed out of the dash rather than the dash speed.
    screenToWorldVel(this.lastMoveX, this.lastMoveY, stats.moveSpeed(), tmp);
    this.dashEndVx = tmp.x;
    this.dashEndVy = tmp.y;
    this.dashBuffer = 0;
    this.lockTime = 0;
    this.dashTime = dash.duration;
    this.onDashStart();
  }

  private updateDash(dt: number): void {
    const step = Math.min(dt, this.dashTime);
    this.x += this.dashVx * step;
    this.y += this.dashVy * step;
    this.dashTime -= dt;
    if (this.dashTime <= 0) {
      this.dashTime = 0;
      this.graceTime = cfgPlayer.invulnAfter;
      this.dashCooldown = stats.dashCooldown();
      this.dashCooldownMax = stats.dashCooldown();
      this.vx = this.dashEndVx;
      this.vy = this.dashEndVy;
      this.startLock(dash.lockTime, this.dashEndVx, this.dashEndVy, dash.slideStartMult, dash.slideEndMult);
    }
  }

  private updateFire(dt: number, input: Input): void {
    this.fireCooldown -= dt;
    const holding = input.isDown('fire') && !this.fireBlocked;
    if (this.fireBlocked) this.readyTimer = 0;
    if (holding) {
      this.readyTimer = feel.armReadyTime;
      this.shootSlowTimer = cfgPlayer.shootSlowTime;
    } else {
      this.readyTimer = Math.max(0, this.readyTimer - dt);
      this.shootSlowTimer = Math.max(0, this.shootSlowTimer - dt);
    }
    const canFire = !this.dashing || bow.fireWhileDashing;
    if (holding && canFire) {
      // Keep the remainder so holding fire gives an exact cadence.
      while (this.fireCooldown <= 0) {
        this.onFire(this.x, this.y, this.aimX, this.aimY);
        this.fireCooldown += 1 / Math.max(stats.fireRate(), 0.01);
      }
    } else if (this.fireCooldown < 0) {
      this.fireCooldown = 0;
    }
  }
}
