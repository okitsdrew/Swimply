import { Placed } from '../data/maps';

// Things in a map that arrows can break: any placed thing whose asset has health. Damage lasts for this visit only;
// the scene decides what breaking means (taking it out of the world, turning on its flag).
export class Breakables {
  private hp = new Map<Placed, number>();

  onHit: (thing: Placed, damage: number) => void = () => {};
  onBroken: (thing: Placed) => void = () => {};

  clear(): void {
    this.hp.clear();
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
