import Phaser from 'phaser';
import { priest } from '../config/priest';
import { render } from '../config/render';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { Orb, Priest, Priests } from '../sim/Priests';
import { priestCastFrames, priestWalkFrames, Tex } from './art';
import { Fx } from './Fx';

interface Visual {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

interface OrbVisual {
  halo: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
}

const screen = { x: 0, y: 0 };
// The orb's colours: a white core in a gold halo, like the priest's eyes.
const HALO = 0xffc93a;
const CORE = 0xfff6d8;
// How high above the ground orbs fly, in art pixels (about chest height).
const ORB_HEIGHT = 10;

// Draws Priests, their spawn marks and their orbs. Walking swaps the two walk frames; the windup holds arms up
// (frame 11) and the cast holds frame 12 while the orb leaves; a teleport fades it out and in. An orb is a white
// core in a gold glow, or, once sprites named priest_orb_0, priest_orb_1, ... exist, those frames in the glow.
export class PriestsView {
  private visuals = new Map<Priest, Visual>();
  private orbs = new Map<Orb, OrbVisual>();
  private marks: Phaser.GameObjects.Graphics;
  private time = 0;

  constructor(private scene: Phaser.Scene, private priests: Priests, private fx: Fx) {
    this.marks = scene.add.graphics().setDepth(-5e7);
  }

  onRisen(p: Priest): void {
    toScreen(p.x, p.y, screen);
    this.fx.smoke(screen.x, screen.y - 8 * render.pixelScale, 6, 10);
  }

  onKilled(x: number, y: number): void {
    const px = render.pixelScale;
    toScreen(x, y, screen);
    const cy = screen.y - 9 * px * priest.scale;
    this.fx.smoke(screen.x, cy, Math.round(priest.deathSmoke * priest.scale), 6 * px * priest.scale);
    this.fx.particle({ x: screen.x, y: cy, life: 0.15, from: 0.6 * priest.scale, to: 0, tint: HALO, depth: screen.y + 2 });
  }

  // A small burst where the orb leaves his hands.
  onCast(o: Orb): void {
    toScreen(o.x, o.y, screen);
    this.fx.particle({ x: screen.x, y: screen.y - ORB_HEIGHT * render.pixelScale, life: 0.2, from: 1.2, to: 0, tint: HALO, depth: screen.y + 2 });
  }

  // A puff where it vanishes; another where it appears, as it fades back in.
  onTeleport(x0: number, y0: number, x1: number, y1: number): void {
    const px = render.pixelScale;
    for (const [x, y, delay] of [[x0, y0, 0], [x1, y1, priest.blinkTime]]) {
      toScreen(x, y, screen);
      const sx = screen.x;
      const sy = screen.y - 9 * px * priest.scale;
      const depth = screen.y + 2;
      this.scene.time.delayedCall(delay * 1000, () => {
        this.fx.smoke(sx, sy, 6, 5 * px * priest.scale);
        this.fx.particle({ x: sx, y: sy, life: 0.2, from: 1.2 * priest.scale, to: 0, tint: 0x8a1c1c, depth });
      });
    }
  }

  // A puff where an orb hits something or fades.
  onOrbGone(x: number, y: number): void {
    toScreen(x, y, screen);
    const cy = screen.y - ORB_HEIGHT * render.pixelScale;
    this.fx.particle({ x: screen.x, y: cy, life: 0.18, from: 1, to: 0, tint: HALO, depth: screen.y + 2 });
    this.fx.smoke(screen.x, cy, 3, 6);
  }

  render(dt: number, playerX: number, playerY: number): void {
    this.time += dt;
    const px = render.pixelScale;
    const scale = px * priest.scale;
    for (const [p, v] of this.visuals) {
      if (this.priests.list.includes(p)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      this.visuals.delete(p);
    }
    const g = this.marks;
    g.clear();
    for (const p of this.priests.list) {
      toScreen(p.x, p.y, screen);
      if (p.state === 'rising') {
        const k = Math.min(1, p.time / Math.max(priest.spawnTell, 1e-4));
        const half = ellipseHalfSize(p.radius * (2.2 - 1.2 * k));
        const core = ellipseHalfSize(p.radius * k);
        g.lineStyle(2, 0x8a1c1c, 0.4 + 0.6 * k).strokeEllipse(screen.x, screen.y, half.x * 2, half.y * 2);
        g.fillStyle(0x1a0505, 0.35 + 0.5 * k).fillEllipse(screen.x, screen.y, core.x * 2, core.y * 2);
        continue;
      }
      let v = this.visuals.get(p);
      if (!v) {
        v = {
          sprite: this.scene.add.image(0, 0, priestWalkFrames[0]).setOrigin(0.5, 1),
          shadow: this.scene.add.image(0, 0, Tex.shadow),
        };
        this.visuals.set(p, v);
      }
      const moving = Math.hypot(p.vx, p.vy) > 10;
      const frame =
        p.state === 'windup' ? priestCastFrames[0]
        : p.state === 'cast' ? priestCastFrames[1]
        : moving ? priestWalkFrames[Math.floor(this.time / Math.max(priest.walkFrameTime, 0.01)) % 2]
        : priestWalkFrames[0];
      v.sprite
        .setTexture(frame)
        .setPosition(screen.x, screen.y)
        .setScale(scale)
        .setFlipX(toScreen(playerX - p.x, playerY - p.y).x < 0)
        .setDepth(screen.y);
      v.shadow.setPosition(screen.x, screen.y).setScale(scale * 0.9, scale * 0.35).setDepth(screen.y - 1000);
      if (p.flash > 0) v.sprite.setTintFill(0xffffff);
      else v.sprite.clearTint();
      // Fading out before a teleport, and back in after it.
      const k = Math.min(1, p.time / Math.max(priest.blinkTime, 1e-3));
      const alpha = p.state === 'blinkOut' ? 1 - k : p.state === 'blinkIn' ? k : 1;
      v.sprite.setAlpha(alpha).setScale(scale * (0.6 + 0.4 * alpha), scale * (1 + 0.3 * (1 - alpha)));
      v.shadow.setAlpha(alpha);
    }

    for (const [o, v] of this.orbs) {
      if (this.priests.orbs.includes(o)) continue;
      v.halo.destroy();
      v.core.destroy();
      this.orbs.delete(o);
    }
    // The glow texture is 32 pixels across; size it to the orb's radius as seen on screen.
    const r = priest.orbRadius * render.isoScale * Math.SQRT2;
    // Drawn orb frames, if there are any (sprites priest_orb_0, priest_orb_1, ...); the code-drawn glow otherwise.
    const orbFrames: string[] = [];
    while (this.scene.textures.exists(`priest_orb_${orbFrames.length}`)) orbFrames.push(`priest_orb_${orbFrames.length}`);
    for (const o of this.priests.orbs) {
      let v = this.orbs.get(o);
      if (!v) {
        v = {
          halo: this.scene.add.image(0, 0, Tex.glow).setTint(HALO).setBlendMode(Phaser.BlendModes.ADD),
          core: orbFrames.length ? this.scene.add.image(0, 0, orbFrames[0]) : this.scene.add.image(0, 0, Tex.glow).setTint(CORE),
        };
        this.orbs.set(o, v);
      }
      toScreen(o.x, o.y, screen);
      const y = screen.y - ORB_HEIGHT * px;
      const pulse = 1 + 0.15 * Math.sin(this.time * 18);
      const fade = priest.orbLife > 0 ? Math.min(1, (priest.orbLife - o.age) / 0.25) : 1;
      v.halo.setPosition(screen.x, y).setScale((r * 4 * pulse) / 32).setAlpha(0.8 * fade).setDepth(screen.y - 0.1);
      if (orbFrames.length) {
        const f = orbFrames[Math.floor(o.age / Math.max(priest.orbFrameTime, 0.01)) % orbFrames.length];
        v.core.setTexture(f).setPosition(screen.x, y).setScale(px).setAlpha(fade).setDepth(screen.y);
      } else v.core.setPosition(screen.x, y).setScale((r * 2) / 32).setAlpha(fade).setDepth(screen.y);
    }
  }

  clear(): void {
    for (const v of this.visuals.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
    }
    for (const v of this.orbs.values()) {
      v.halo.destroy();
      v.core.destroy();
    }
    this.visuals.clear();
    this.orbs.clear();
    this.marks.clear();
  }
}
