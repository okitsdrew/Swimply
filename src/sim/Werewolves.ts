import { WolfConfig } from '../config/werewolf';
import { Vec2 } from '../core/iso';
import { DebugDraw, EnemyGroup } from './enemies';
import { Navigator } from './Nav';
import { Target } from './targets';
import { Werewolf } from './Werewolf';
import { CollisionWorld } from './World';

// Every werewolf of one config section: the Mindscape's mini-boss, or the plain elites met in the world. Each is
// its own state machine (sim/Werewolf); this keeps the list and passes their moments on with the wolf attached.
export class Werewolves implements EnemyGroup<Werewolf> {
  readonly list: Werewolf[] = [];

  onRisen: (w: Werewolf) => void = () => {};
  onKilled: (x: number, y: number, w: Werewolf) => void = () => {};
  onAttack: (w: Werewolf) => void = () => {};
  onSlam: (w: Werewolf) => void = () => {};
  onSwipe: (w: Werewolf) => void = () => {};
  onLand: (w: Werewolf) => void = () => {};

  constructor(readonly cfg: WolfConfig) {}

  get bodyRadius(): number {
    return this.cfg.radius * this.cfg.scale;
  }

  private add(): Werewolf {
    const w = new Werewolf(this.cfg);
    w.onRisen = () => this.onRisen(w);
    w.onAttack = () => this.onAttack(w);
    w.onSlam = () => this.onSlam(w);
    w.onSwipe = () => this.onSwipe(w);
    w.onLand = () => this.onLand(w);
    w.onKilled = (x, y) => {
      this.list.splice(this.list.indexOf(w), 1);
      this.onKilled(x, y, w);
    };
    this.list.push(w);
    return w;
  }

  spawn(x: number, y: number): Werewolf {
    const w = this.add();
    w.spawn(x, y);
    return w;
  }

  wait(x: number, y: number): Werewolf {
    const w = this.add();
    w.wait(x, y);
    return w;
  }

  wake(w: Werewolf): void {
    w.wake();
  }

  waiting(w: Werewolf): boolean {
    return w.state === 'idle';
  }

  damage(w: Werewolf, amount: number): void {
    w.damage(amount);
  }

  kill(w: Werewolf): void {
    w.damage(w.hp);
  }

  clear(): void {
    for (const w of this.list) w.clear();
    this.list.length = 0;
  }

  update(dt: number, world: CollisionWorld, nav: Navigator, target: Vec2): void {
    for (const w of this.list) w.update(dt, world, nav, target);
  }

  // In the air, he is out of reach.
  targets(out: Target[]): void {
    for (const w of this.list) if (w.alive && !w.airborne) out.push(w);
  }

  // The dash hurts along his path as he passes and at the far end where he slams; the jump hurts the landing circle;
  // the swipe hurts its cone for as long as he lunges. A hit is marked on him (`struck`) even in god mode, so his
  // choice of next attack can be tested.
  strikes(x: number, y: number, r: number, safe: boolean): boolean {
    let hit = false;
    for (const w of this.list) {
      const caught = w.inDash(x, y, r) || (w.slammed && w.inSlam(x, y, r)) || (w.landed && w.inLanding(x, y, r)) || (w.state === 'swipe' && w.inSwipe(x, y, r));
      if (!caught || (safe && !w.cfg.slamPiercesInvuln)) continue;
      w.struck = true;
      hit = true;
    }
    return hit;
  }

  touching(x: number, y: number, r: number): boolean {
    return this.list.some((w) => w.touching(x, y, r));
  }

  debug(d: DebugDraw): void {
    for (const w of this.list) {
      if (!w.alive) continue;
      d.ring(w.x, w.y, w.radius, false);
      d.ring(w.x, w.y, w.radius * w.cfg.contactScale, true);
    }
  }
}
