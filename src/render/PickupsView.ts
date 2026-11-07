import Phaser from 'phaser';
import { pickups as cfg } from '../config/pickups';
import { render } from '../config/render';
import { toScreen } from '../core/iso';
import { pickupTexture } from '../data/pickups';
import { Pickup, Pickups } from '../sim/Pickups';
import { Tex } from './art';

interface Visual {
  orb: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

const screen = { x: 0, y: 0 };

// Draws the orbs: a small pixel orb with a soft glow in its kind's colour that breathes, bobbing where it lies
// and hopping as it drops. Reads the sim, never changes it.
export class PickupsView {
  private visuals = new Map<Pickup, Visual>();
  private time = 0;

  constructor(private scene: Phaser.Scene, private pickups: Pickups) {}

  clear(): void {
    for (const v of this.visuals.values()) {
      v.orb.destroy();
      v.glow.destroy();
    }
    this.visuals.clear();
  }

  render(dt: number): void {
    this.time += dt;
    const px = render.pixelScale;
    const live = new Set(this.pickups.list);
    for (const [p, v] of this.visuals) {
      if (live.has(p)) continue;
      v.orb.destroy();
      v.glow.destroy();
      this.visuals.delete(p);
    }
    for (const p of this.pickups.list) {
      let v = this.visuals.get(p);
      if (!v) {
        v = {
          glow: this.scene.add.image(0, 0, Tex.glow).setTint(p.kind.glow).setBlendMode(Phaser.BlendModes.ADD),
          orb: this.scene.add.image(0, 0, pickupTexture(p.kind)),
        };
        this.visuals.set(p, v);
      }
      toScreen(p.x, p.y, screen);
      const settle = Math.max(cfg.settleTime, 1e-4);
      const hop = p.age < settle && !p.flying ? Math.sin((Math.PI * p.age) / settle) * cfg.hopHeight : 0;
      const bob = (Math.sin(this.time * cfg.bobRate * Math.PI * 2 + p.phase) + 1) * 0.5 * cfg.bobHeight;
      const y = screen.y - (4 + hop + bob) * px;
      const pulse = 0.85 + 0.15 * Math.sin(this.time * cfg.bobRate * Math.PI * 2 + p.phase + 1);
      v.orb.setPosition(screen.x, y).setScale(px * cfg.orbScale * p.kind.scale).setDepth(screen.y);
      v.glow.setPosition(screen.x, y).setScale(px * cfg.glowScale * p.kind.scale * pulse).setAlpha(cfg.glowAlpha * pulse).setDepth(screen.y - 0.1);
    }
  }
}
