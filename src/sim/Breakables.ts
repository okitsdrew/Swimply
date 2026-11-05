import { breakables as cfg } from '../config/breakables';
import { Placed } from '../data/maps';

// Things in a map that arrows can break: any placed thing whose asset has health. Damage lasts for this visit only;
// the scene decides what breaking means (taking it out of the world, turning on its flag). They can burn: a burn
// deals its damage a second in ticks until it runs out, and another burn restarts it, keeping the stronger power.
export class Breakables {
  private hp = new Map<Placed, number>();
  private burns = new Map<Placed, { left: number; power: number; tick: number }>();

  onHit: (thing: Placed, damage: number) => void = () => {};
  onBroken: (thing: Placed) => void = () => {};

  clear(): void {
    this.hp.clear();
    this.burns.clear();
  }

  // What is burning now, for drawing its flames.
  burning(): IterableIterator<Placed> {
    return this.burns.keys();
  }

  burn(thing: Placed, seconds: number, power: number): void {
    if (!this.canBreak(thing) || this.health(thing) <= 0 || seconds <= 0 || power <= 0) return;
    const b = this.burns.get(thing);
    if (b) {
      b.left = Math.max(b.left, seconds);
      b.power = Math.max(b.power, power);
    } else this.burns.set(thing, { left: seconds, power, tick: 0 });
  }

  update(dt: number): void {
    for (const [thing, b] of this.burns) {
      const step = Math.min(dt, b.left);
      b.left -= dt;
      b.tick += step;
      if (b.tick >= cfg.burnTick || b.left <= 0) {
        const amount = b.power * b.tick;
        b.tick = 0;
        this.damage(thing, amount);
      }
      if (b.left <= 0 || this.health(thing) <= 0) this.burns.delete(thing);
    }
  }

  canBreak(thing: Placed): boolean {
    return thing.asset.health > 0;
  }

  // How much health it has left, 0 to its asset's health.
  health(thing: Placed): number {
    return this.hp.get(thing) ?? thing.asset.health;
  }

  damage(thing: Placed, amount: number): void {
    if (!this.canBreak(thing)) return;
    const left = this.health(thing);
    if (left <= 0) return;
    const now = Math.max(0, left - amount);
    this.hp.set(thing, now);
    this.onHit(thing, amount);
    if (now <= 0) this.onBroken(thing);
  }
}
