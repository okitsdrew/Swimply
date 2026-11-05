import Phaser from 'phaser';
import { render } from '../config/render';
import { timo } from '../config/story';
import { doomsday, emblemLook, emblems, vestiges as cfg } from '../config/vestiges';
import { save } from '../core/save';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { equippedIn, Vestige, VESTIGE_SLOTS, vestiges, vestigeTexture } from '../data/vestiges';
import { VestigeCaster } from '../sim/Vestiges';
import { ballFrames, dropFrames, iconScale, skillRing, Tex } from './art';
import { Fx } from './Fx';
import { ui, uiText } from './ui';

const KEYS = ['Q', 'E', 'R'];
const SLOT = 56;
const GAP = 12;

interface Slot {
  // Glows in its Vestige's colour while that Vestige is in use.
  glow: Phaser.GameObjects.Image;
  box: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  shade: Phaser.GameObjects.Rectangle;
  key: Phaser.GameObjects.Text;
  time: Phaser.GameObjects.Text;
}

// Vestiges as he sees them: the emblems of the equipped ones hovering round him, the ring on the ground while one is
// aimed (in its own colour, red where he cannot), the blast, and the slots at the bottom of the screen with their
// keys and cooldowns.
export class VestigesView {
  private emblems: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; frames: string[]; emberTimer: number }[] = [];
  private aimInner: Phaser.GameObjects.Image;
  private slots: Slot[] = [];
  private age = 0;
  // The middle of the emblems' ring: it trails him and catches up.
  private ring = { x: 0, y: 0, placed: false };
  // Doomsday's ball of energy, growing and churning over him while it charges, which turns into the drop as it falls.
  private ball: Phaser.GameObjects.Image;
  private drop: Phaser.GameObjects.Image;
  private sparkTimer = 0;

  constructor(private scene: Phaser.Scene, private caster: VestigeCaster, private fx: Fx) {
    const ring = () => scene.add.image(0, 0, Tex.doorRing).setDepth(-4e7).setVisible(false);
    this.aimInner = ring();
    this.ball = scene.add.image(0, 0, ballFrames[0]).setVisible(false);
    this.drop = scene.add.image(0, 0, dropFrames[0]).setVisible(false);
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(2e7);
    for (let i = 0; i < VESTIGE_SLOTS; i++) {
      this.slots.push({
        glow: scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0).setDepth(2e7 - 1),
        box: fixed(scene.add.rectangle(0, 0, SLOT, SLOT, ui.deep, 0.8).setStrokeStyle(3, ui.mid)),
        icon: fixed(scene.add.image(0, 0, Tex.glow).setScale(4)),
        shade: fixed(scene.add.rectangle(0, 0, SLOT, SLOT, 0x000000, 0.65).setOrigin(0.5, 1)),
        key: fixed(scene.add.text(0, 0, KEYS[i] ?? '', uiText(8, { color: ui.dim })).setOrigin(0, 0)),
        time: fixed(scene.add.text(0, 0, '', uiText(16)).setOrigin(0.5)),
      });
    }
  }

  // The frame of a moving icon (`key`, then `key_1`, `key_2`...) to show now, at Timo's face speed.
  private activeFrame(key: string): string {
    const frames = [key];
    for (let n = 1; this.scene.textures.exists(`${key}_${n}`); n++) frames.push(`${key}_${n}`);
    return frames[Math.floor(this.age * timo.faceFps) % frames.length];
  }

  // An emblem's frames: the base sprite, then any `_1`, `_2`... that exist, played forward then back.
  private emblemFrames(id: string): string[] {
    const base = vestigeTexture(id);
    const out = [base];
    for (let n = 1; this.scene.textures.exists(`${base}_${n}`); n++) out.push(`${base}_${n}`);
    return out.concat(out.slice(1, -1).reverse());
  }

  // The blast at (x, y) in the world: a flash, rings and sparks out to its radii.
  blast(x: number, y: number): void {
    const s = toScreen(x, y);
    const px = render.pixelScale;
    this.fx.burst(s.x, s.y - 10 * px);
    this.fx.smoke(s.x, s.y, 14, ellipseHalfSize(doomsday.damageRadius).x * 0.6);
    this.fx.explosion(s.x, s.y, doomsday.damageRadius, doomsday.blastColor);
    for (const [r, life, alpha] of [[doomsday.damageRadius, 0.3, 1]]) {
      const half = ellipseHalfSize(r);
      const img = this.scene.add.image(s.x, s.y, skillRing(vestiges.get('doomsday')?.ring ?? 1)).setDepth(-4e7).setDisplaySize(half.x * 0.4, half.y * 0.4);
      this.scene.tweens.add({ targets: img, displayWidth: half.x * 2, displayHeight: half.y * 2, alpha: { from: alpha, to: 0 }, duration: life * 1000, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 200 + Math.random() * 300;
      this.fx.particle({ x: s.x, y: s.y - 6 * px, life: 0.3 + Math.random() * 0.3, from: 0.5, to: 0, tint: Math.random() < 0.5 ? doomsday.blastColor : 0xffffff, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 });
    }
    this.fx.addShake(doomsday.shake);
  }

  update(dt: number, heroX: number, heroY: number, heroShown: boolean, width: number, height: number): void {
    this.age += dt;
    const px = render.pixelScale;
    // The emblems, spaced evenly round him and slowly circling (Timo floats by him already, as his own).
    const k = 1 - Math.exp(-emblems.followRate * dt);
    const far = Math.hypot(heroX - this.ring.x, heroY - this.ring.y) > 1000;
    this.ring.x = !this.ring.placed || far ? heroX : this.ring.x + (heroX - this.ring.x) * k;
    this.ring.y = !this.ring.placed || far ? heroY : this.ring.y + (heroY - this.ring.y) * k;
    this.ring.placed = true;
    // Each flaps through its frames with a glow behind it and embers rising off it, all in its colour.
    const equipped: Vestige[] = [];
    for (let i = 0; i < VESTIGE_SLOTS; i++) {
      const v = equippedIn(i);
      if (v?.emblem) equipped.push(v);
    }
    while (this.emblems.length < equipped.length) {
      this.emblems.push({ img: this.scene.add.image(0, 0, Tex.glow), glow: this.scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD), frames: [], emberTimer: 0 });
    }
    this.emblems.forEach((e, i) => {
      const v = equipped[i];
      e.img.setVisible(!!v && heroShown);
      e.glow.setVisible(!!v && heroShown);
      if (!v || !heroShown) return;
      if (e.frames[0] !== vestigeTexture(v.id)) e.frames = this.emblemFrames(v.id);
      const look = emblemLook(v.id);
      const a = this.age * emblems.spin * Math.PI * 2 + (i / equipped.length) * Math.PI * 2;
      const s = toScreen(this.ring.x + Math.cos(a) * emblems.distance, this.ring.y + Math.sin(a) * emblems.distance);
      const bob = Math.sin(this.age * 3 + i * 2) * emblems.bob * px;
      const y = s.y - emblems.height * px + bob;
      const frame = e.frames[Math.floor(this.age / look.emblemFrameTime) % e.frames.length];
      e.img.setTexture(frame).setScale(px * look.emblemScale).setPosition(s.x, y).setDepth(s.y);
      const flicker = 0.85 + 0.15 * Math.sin(this.age * 9 + i);
      const boost = this.caster.active(v.id) ? emblems.activeGlow : 1;
      e.glow.setPosition(s.x, y).setDepth(s.y - 0.1).setScale((look.emblemGlow * px * look.emblemScale * boost) / 32).setTint(v.color).setAlpha(Math.min(1, look.emblemGlowAlpha * flicker * boost));
      e.emberTimer -= dt * look.emblemEmbers;
      while (e.emberTimer < 0) {
        e.emberTimer += 1;
        const life = 0.5 + Math.random() * 0.4;
        this.fx.particle({ x: s.x + (Math.random() - 0.5) * 10 * px, y: y + (Math.random() - 0.2) * 6 * px, life, from: 0.18, to: 0, tint: Math.random() < 0.6 ? v.color : 0xffe45a, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 30, depth: s.y + 1 });
      }
    });

    // From Timo's throw to the blast: the ball grows over the spot (and him, once he is in it), pulsing faster as it fills, with sparks drawn in to it, then
    // drops to the ground for the blast (no more sparks once it falls).
    const charging = this.caster.blastPending;
    this.ball.setVisible(charging);
    this.drop.setVisible(false);
    if (charging) {
      const k = this.caster.chargeProgress;
      const s = toScreen(this.caster.target.x, this.caster.target.y);
      const left = this.caster.blastLeft;
      const fall = doomsday.dropTime > 0 ? Math.max(0, 1 - left / doomsday.dropTime) : 0;
      const y = s.y - doomsday.ballHeight * px * (1 - fall * fall);
      const pulse = 1 + 0.12 * Math.sin(this.age * (10 + k * 20));
      const size = doomsday.ballSize * px * (0.2 + 0.8 * k) * pulse;
      const ballFrame = ballFrames[Math.floor(this.age / doomsday.ballFrameTime) % ballFrames.length];
      this.ball.setTexture(ballFrame).setDisplaySize(size, size).setPosition(s.x, y).setDepth(s.y + 2);
      if (fall > 0) {
        this.ball.setVisible(false);
        const frame = dropFrames[Math.floor(this.age / doomsday.dropFrameTime) % dropFrames.length];
        this.drop.setVisible(true).setTexture(frame).setPosition(s.x, y).setDepth(s.y + 3).setScale(doomsday.dropScale * px);
      }
      this.sparkTimer -= dt;
      if (this.sparkTimer <= 0 && fall === 0) {
        this.sparkTimer = 0.03;
        const a = Math.random() * Math.PI * 2;
        const r = (doomsday.ballSize * 1.5 + 20) * px;
        const life = 0.25;
        this.fx.particle({ x: s.x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.6, life, from: 0.35, to: 0.1, tint: Math.random() < 0.5 ? doomsday.blastColor : 0xffffff, vx: (-Math.cos(a) * r) / life, vy: (-Math.sin(a) * r * 0.6) / life, depth: s.y + 4 });
      }
    }

    // While aiming: the blast where it would land, in the Vestige's ring, red where he cannot.
    const c = this.caster;
    const aiming = c.aiming >= 0;
    this.aimInner.setVisible(aiming);
    if (aiming) {
      const ts = toScreen(c.target.x, c.target.y);
      this.aimInner.setTexture(c.targetOk ? skillRing(equippedIn(c.aiming)?.ring ?? 5) : Tex.doorRingClosed);
      const pulse = 0.85 + 0.15 * Math.sin(this.age * 8);
      const size = (img: Phaser.GameObjects.Image, r: number) => {
        const half = ellipseHalfSize(r);
        img.setDisplaySize(half.x * 2, half.y * 2);
      };
      size(this.aimInner, doomsday.damageRadius);
      this.aimInner.setPosition(ts.x, ts.y).setAlpha(doomsday.aimAlpha * pulse);
    }

    // The slots, bottom middle, once he holds any Vestige.
    const show = save.vestiges.length > 0;
    const x0 = width / 2 - ((VESTIGE_SLOTS - 1) * (SLOT + GAP)) / 2;
    const y = height - SLOT / 2 - 16;
    this.slots.forEach((sl, i) => {
      const v = equippedIn(i);
      const x = x0 + i * (SLOT + GAP);
      for (const o of [sl.glow, sl.box, sl.icon, sl.shade, sl.key, sl.time]) o.setVisible(show);
      if (!show) return;
      const on = !!v && c.active(v.id);
      sl.glow.setVisible(on);
      if (v && on) sl.glow.setPosition(x, y).setTint(v.color).setScale((SLOT * 2) / 32).setAlpha(0.6 + 0.25 * Math.sin(this.age * 8));
      sl.box.setPosition(x, y).setStrokeStyle(3, on && v ? v.color : ui.mid).setAlpha(v ? 1 : cfg.emptySlotAlpha);
      sl.key.setPosition(x - SLOT / 2 + 5, y - SLOT / 2 + 5).setAlpha(v ? 1 : cfg.emptySlotAlpha);
      sl.icon.setVisible(!!v);
      const cd = v ? c.cooldownFraction(v.id) : 0;
      sl.shade.setVisible(cd > 0).setPosition(x, y + SLOT / 2).setScale(1, cd);
      sl.time.setVisible(cd > 0).setPosition(x, y).setText(v && cd > 0 ? `${Math.ceil(c.cooldownLeft(v.id))}` : '');
      // While in use, a Vestige can show another icon: Doomsday shows Timo's Doomsday face (its frames, looping).
      if (v) {
        const icon = on && v.activeIcon ? this.activeFrame(v.activeIcon) : v.icon;
        sl.icon.setTexture(icon).setScale(iconScale(this.scene, icon, SLOT)).setPosition(x, y);
      }
    });
  }
}
