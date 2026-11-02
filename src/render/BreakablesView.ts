import { breakables } from '../config/breakables';
import { render } from '../config/render';
import { toScreen } from '../core/iso';
import { Placed } from '../data/maps';
import { Fx } from './Fx';
import { MapView } from './MapView';

// How breaking things looks: a white flash on a hit, and smoke along the thing where it breaks. The map's own
// sprites are flashed, so it works for any asset with no extra art.
export class BreakablesView {
  private flashing = new Map<Placed, number>();

  constructor(private mapView: MapView, private fx: Fx) {}

  onHit(thing: Placed): void {
    if (breakables.flashTime <= 0) return;
    for (const s of this.mapView.spritesOf(thing)) s.setTintFill(0xffffff);
    this.flashing.set(thing, breakables.flashTime);
    this.fx.addShake(breakables.hitShake);
  }

  // Call before the thing is taken out of the map, while its sprites still show where it stood.
  onBroken(thing: Placed): void {
    this.flashing.delete(thing);
    const px = render.pixelScale;
    const circles = thing.asset.collision.length ? thing.asset.collision : [{ x: 0, y: 0, radius: 16 }];
    const each = Math.max(1, Math.round(breakables.breakSmoke / circles.length));
    for (const c of circles) {
      const s = toScreen(thing.x + c.x * thing.size, thing.y + c.y * thing.size);
      this.fx.smoke(s.x, s.y - 8 * px, each, c.radius * thing.size * render.isoScale);
    }
    this.fx.addShake(breakables.breakShake);
  }

  update(dt: number): void {
    for (const [thing, left] of this.flashing) {
      if (left - dt > 0) {
        this.flashing.set(thing, left - dt);
        continue;
      }
      this.flashing.delete(thing);
      for (const s of this.mapView.spritesOf(thing)) s.clearTint();
    }
  }

  clear(): void {
    for (const thing of this.flashing.keys()) for (const s of this.mapView.spritesOf(thing)) s.clearTint();
    this.flashing.clear();
  }
}

