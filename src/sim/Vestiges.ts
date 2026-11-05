import { player as cfgPlayer } from '../config/character';
import { doomsday } from '../config/vestiges';
import { Action, Input } from '../core/input';
import { Vec2 } from '../core/iso';
import { equippedIn, VESTIGE_SLOTS } from '../data/vestiges';
import { Player } from './Player';
import { CollisionWorld } from './World';

const SLOT_KEYS: Action[] = ['skill1', 'skill2', 'skill3'];

// Using Vestiges. Pressing a slot's key starts aiming it: a circle on the ground follows the mouse, and a click casts
// it there (right click or the same key again puts it away). What each Vestige does when cast is here, by its id.
// Only Timo's Doomsday Scenario exists so far: he throws Timo at the spot, where the ball starts to form, flies into
// it, charges, and explodes; the scene deals the blast's damage.
export class VestigeCaster {
  // The slot being aimed, or -1.
  aiming = -1;
  // Where the aimed Vestige would land, and whether it can.
  readonly target: Vec2 = { x: 0, y: 0 };
  targetOk = false;
  private spot = { x: 0, y: 0, radius: 0 };
  // Seconds left before each Vestige can be used again, by id.
  private cooldowns = new Map<string, number>();
  // Seconds until a Doomsday blast, from the throw on, or -1.
  private blastIn = -1;
  // Seconds left of Timo's throw, before he flies after him (0 when not throwing).
  private throwIn = 0;

  // The blast goes off at (x, y).
  onBlast: (x: number, y: number) => void = () => {};
  // A key or click that cannot do anything now (an empty slot, cooling down, a spot he cannot land on).
  onDeny: () => void = () => {};

  // `reachable` says whether he could walk to a spot from where he stands.
  constructor(private world: CollisionWorld, private player: Player, private reachable: (x: number, y: number) => boolean) {}

  // Throwing Timo at the spot: he holds still, and can still be hurt.
  get throwing(): boolean {
    return this.throwIn > 0;
  }

  // How far Timo has flown, 0 to 1.
  get throwProgress(): number {
    return doomsday.throwTime > 0 ? 1 - this.throwIn / doomsday.throwTime : 1;
  }

  // Charging a Doomsday blast where he landed: he holds still and cannot be hurt.
  get charging(): boolean {
    return this.blastIn >= 0 && this.throwIn <= 0 && !this.player.teleporting;
  }

  // From the throw to the blast: the ball is there.
  get blastPending(): boolean {
    return this.blastIn >= 0;
  }

  // Seconds until the blast.
  get blastLeft(): number {
    return Math.max(0, this.blastIn);
  }

  // How far the ball has grown, 0 to 1, from the throw to the blast.
  get chargeProgress(): number {
    const total = doomsday.throwTime + doomsday.travelTime + doomsday.chargeTime;
    return total > 0 ? Math.min(1, 1 - this.blastIn / total) : 1;
  }

  // Whether a Vestige is in use: being aimed, or cast and not over yet.
  active(id: string): boolean {
    if (this.aiming >= 0 && equippedIn(this.aiming)?.id === id) return true;
    return id === 'doomsday' && this.blastIn >= 0;
  }

  reset(): void {
    this.aiming = -1;
    this.blastIn = -1;
    this.throwIn = 0;
    this.cooldowns.clear();
  }

  // 0 when ready, 1 just after it was used.
  cooldownFraction(id: string): number {
    const left = this.cooldowns.get(id) ?? 0;
    return left > 0 && doomsday.cooldown > 0 ? Math.min(1, left / doomsday.cooldown) : 0;
  }

  cooldownLeft(id: string): number {
    return this.cooldowns.get(id) ?? 0;
  }

  // Runs before the player's own update, so a click that casts does not also shoot. `canAct` is false while he
  // cannot use them (dialogue, no control, dead): aiming stops, cooldowns still run.
  update(dt: number, input: Input, aim: Vec2 | null, canAct: boolean): void {
    for (const [id, t] of this.cooldowns) this.cooldowns.set(id, Math.max(0, t - dt));
    if (this.throwIn > 0) {
      this.throwIn -= dt;
      if (this.throwIn <= 0) {
        this.throwIn = 0;
        this.player.blink(this.target.x, this.target.y, doomsday.travelTime);
      }
    }
    if (this.blastIn >= 0) {
      this.blastIn = Math.max(0, this.blastIn - dt);
      if (this.charging) {
        this.player.shieldTime = Math.max(this.player.shieldTime, this.blastIn + doomsday.safeAfter);
        if (this.blastIn <= 0) {
          this.blastIn = -1;
          this.player.shieldTime = doomsday.safeAfter;
          this.onBlast(this.player.x, this.player.y);
        }
      }
    }
    if (!canAct) {
      this.aiming = -1;
      return;
    }
    for (let i = 0; i < VESTIGE_SLOTS && i < SLOT_KEYS.length; i++) {
      if (!input.justPressed(SLOT_KEYS[i])) continue;
      const v = equippedIn(i);
      if (this.aiming === i) this.aiming = -1;
      else if (!v || this.cooldownLeft(v.id) > 0 || this.player.teleporting || this.blastIn >= 0) this.onDeny();
      else this.aiming = i;
    }
    const v = this.aiming >= 0 ? equippedIn(this.aiming) : undefined;
    if (!v) {
      this.aiming = -1;
      return;
    }
    this.aimAt(aim);
    if (input.justPressed('teleport')) {
      input.consume('teleport');
      this.aiming = -1;
    } else if (input.justPressed('fire')) {
      input.consume('fire');
      if (this.targetOk) this.cast(v.id);
      else this.onDeny();
    }
  }

  // The spot under the mouse, brought within range. He must be able to stand there (off water, void, roofs and
  // anything solid) and be able to walk there from where he is; he flies straight through whatever is between.
  private aimAt(aim: Vec2 | null): void {
    const p = this.player;
    let dx = (aim?.x ?? p.x + p.aimX) - p.x;
    let dy = (aim?.y ?? p.y + p.aimY) - p.y;
    const len = Math.hypot(dx, dy);
    if (len > doomsday.range) {
      dx *= doomsday.range / len;
      dy *= doomsday.range / len;
    }
    const x = p.x + dx;
    const y = p.y + dy;
    this.target.x = x;
    this.target.y = y;
    const r = cfgPlayer.bodyRadius;
    const w = this.world;
    const inside = x > r && y > r && x < w.width - r && y < w.height - r;
    this.spot.x = x;
    this.spot.y = y;
    this.spot.radius = r;
    w.resolve(this.spot);
    const clear = Math.hypot(this.spot.x - x, this.spot.y - y) < 1;
    this.targetOk = inside && clear && !w.onBlockingFloor(x, y, r) && !w.onRoof(x, y) && this.reachable(x, y);
  }

  private cast(id: string): void {
    this.aiming = -1;
    if (id === 'doomsday') {
      this.cooldowns.set(id, doomsday.cooldown);
      this.blastIn = doomsday.throwTime + doomsday.travelTime + doomsday.chargeTime;
      this.throwIn = doomsday.throwTime;
      if (this.throwIn <= 0) this.player.blink(this.target.x, this.target.y, doomsday.travelTime);
    }
  }
}
