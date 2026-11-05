import Phaser from 'phaser';
import { doors as cfg } from '../config/doors';
import { story } from '../config/story';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { AreaMap, Placed } from '../data/maps';
import { Tex } from './art';

interface Ring {
  img: Phaser.GameObjects.Image;
  locked: Phaser.GameObjects.Image;
  // 0 locked, 1 open, fading between.
  open: number;
}

const screen = { x: 0, y: 0 };

// A glowing ring on the ground at every door with a link: the blue `door_ring` while open, the red `door_ring_closed`
// while locked, fading from one to the other when that changes.
export class DoorsView {
  private rings = new Map<Placed, Ring>();
  private time = 0;
  // A door he can see unlocked (not one already open as the map started).
  onUnlock: () => void = () => {};

  constructor(private scene: Phaser.Scene) {}

  update(dt: number, map: AreaMap, isOpen: (o: Placed) => boolean): void {
    this.time += dt;
    const live = new Set<Placed>();
    for (const o of map.objects) {
      if (o.asset.marker !== 'door' || !o.to) continue;
      live.add(o);
      const want = isOpen(o) ? 1 : 0;
      let r = this.rings.get(o);
      if (!r) {
        r = { img: this.scene.add.image(0, 0, Tex.doorRing).setDepth(-5e7), locked: this.scene.add.image(0, 0, Tex.doorRingClosed).setDepth(-5e7), open: want };
        this.rings.set(o, r);
      } else if (want === 1 && r.open === 0) this.onUnlock();
      const step = cfg.fadeTime > 0 ? dt / cfg.fadeTime : 1;
      r.open = want ? Math.min(1, r.open + step) : Math.max(0, r.open - step);
      const half = ellipseHalfSize(story.doorRadius * o.size);
      const pulse = 1 - cfg.pulse * r.open * (0.5 + 0.5 * Math.sin(this.time * cfg.pulseSpeed * Math.PI * 2));
      toScreen(o.x, o.y, screen);
      r.img.setPosition(screen.x, screen.y).setDisplaySize(half.x * 2, half.y * 2).setAlpha(cfg.openAlpha * pulse * r.open);
      r.locked.setPosition(screen.x, screen.y).setDisplaySize(half.x * 2, half.y * 2).setAlpha(cfg.lockedAlpha * (1 - r.open));
    }
    for (const [o, r] of this.rings) {
      if (live.has(o)) continue;
      r.img.destroy();
      r.locked.destroy();
      this.rings.delete(o);
    }
  }
}
