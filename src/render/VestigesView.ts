import Phaser from 'phaser';
import { render } from '../config/render';
import { doomsday, vestiges as cfg } from '../config/vestiges';
import { save } from '../core/save';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { equippedIn, VESTIGE_SLOTS, vestigeTexture } from '../data/vestiges';
import { VestigeCaster } from '../sim/Vestiges';
import { Tex } from './art';
import { Fx } from './Fx';
import { ui, uiText } from './ui';

const KEYS = ['Q', 'E', 'R'];
const SLOT = 56;
const GAP = 12;

interface Slot {
  box: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  shade: Phaser.GameObjects.Rectangle;
  key: Phaser.GameObjects.Text;
  time: Phaser.GameObjects.Text;
}

// Vestiges as he sees them: the emblems of the equipped ones hovering round him, the circle on the ground while one
// is aimed, the blast, and the slots at the bottom of the screen with their keys and cooldowns.
export class VestigesView {
  private emblems: Phaser.GameObjects.Image[] = [];
  private aimInner: Phaser.GameObjects.Image;
  private aimOuter: Phaser.GameObjects.Image;
  private rangeRing: Phaser.GameObjects.Image;
  private slots: Slot[] = [];
  private age = 0;
  // Doomsday's ball of energy, gathering over him while it charges: a coloured glow round a white core.
  private ball: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private sparkTimer = 0;

  constructor(private scene: Phaser.Scene, private caster: VestigeCaster, private fx: Fx) {
    const ring = () => scene.add.image(0, 0, Tex.doorRing).setDepth(-4e7).setVisible(false);
    this.rangeRing = ring();
    this.aimOuter = ring();
    this.aimInner = ring();
    this.ball = scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.core = scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff).setVisible(false);
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(2e7);
    for (let i = 0; i < VESTIGE_SLOTS; i++) {
      this.slots.push({
        box: fixed(scene.add.rectangle(0, 0, SLOT, SLOT, ui.deep, 0.8).setStrokeStyle(3, ui.mid)),
        icon: fixed(scene.add.image(0, 0, Tex.glow).setScale(4)),
        shade: fixed(scene.add.rectangle(0, 0, SLOT, SLOT, 0x000000, 0.65).setOrigin(0.5, 1)),
        key: fixed(scene.add.text(0, 0, KEYS[i] ?? '', uiText(8, { color: ui.dim })).setOrigin(0, 0)),
        time: fixed(scene.add.text(0, 0, '', uiText(16)).setOrigin(0.5)),
      });
    }
  }

  // The blast at (x, y) in the world: a flash, rings and sparks out to its radii.
  blast(x: number, y: number): void {
    const s = toScreen(x, y);
    const px = render.pixelScale;
    this.fx.burst(s.x, s.y - 10 * px);
    this.fx.smoke(s.x, s.y, 14, ellipseHalfSize(doomsday.damageRadius).x * 0.6);
    this.fx.particle({ x: s.x, y: s.y - 6 * px, life: 0.35, from: 2, to: (ellipseHalfSize(doomsday.damageRadius).x * 2.5) / 32, alpha: 1, tint: doomsday.blastColor });
    this.fx.particle({ x: s.x, y: s.y - 6 * px, life: 0.2, from: 1, to: 6, alpha: 1, tint: 0xffffff });
    for (const [r, life, alpha] of [[doomsday.damageRadius, 0.3, 1], [doomsday.knockbackRadius, 0.45, 0.5]]) {
      const half = ellipseHalfSize(r);
      const img = this.scene.add.image(s.x, s.y, Tex.doorRing).setDepth(-4e7).setTint(doomsday.blastColor).setDisplaySize(half.x * 0.4, half.y * 0.4);
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
    const equipped: string[] = [];
    for (let i = 0; i < VESTIGE_SLOTS; i++) {
      const v = equippedIn(i);
      if (v?.emblem) equipped.push(v.id);
    }
    while (this.emblems.length < equipped.length) this.emblems.push(this.scene.add.image(0, 0, Tex.glow));
    this.emblems.forEach((img, i) => {
      const id = equipped[i];
      img.setVisible(!!id && heroShown);
      if (!id || !heroShown) return;
      const a = this.age * cfg.emblemSpin * Math.PI * 2 + (i / equipped.length) * Math.PI * 2;
      const s = toScreen(heroX + Math.cos(a) * cfg.emblemDistance, heroY + Math.sin(a) * cfg.emblemDistance);
      const bob = Math.sin(this.age * 3 + i * 2) * cfg.emblemBob * px;
      img.setTexture(vestigeTexture(id)).setScale(px * cfg.emblemScale).setPosition(s.x, s.y - cfg.emblemHeight * px + bob).setDepth(s.y);
    });

    // While Doomsday charges: the ball grows over him, pulsing faster as it fills, and sparks are drawn in to it.
    const charging = this.caster.charging;
    this.ball.setVisible(charging);
    this.core.setVisible(charging);
    if (charging) {
      const k = this.caster.chargeProgress;
      const s = toScreen(heroX, heroY);
      const y = s.y - 12 * px;
      const pulse = 1 + 0.12 * Math.sin(this.age * (10 + k * 20));
      const size = (doomsday.ballSize * px * (0.2 + 0.8 * k) * pulse) / 32;
      this.ball.setPosition(s.x, y).setDepth(s.y + 2).setScale(size * 1.6).setTint(doomsday.blastColor).setAlpha(0.9);
      this.core.setPosition(s.x, y).setDepth(s.y + 3).setScale(size * 0.6).setAlpha(0.6 + 0.4 * k);
      this.sparkTimer -= dt;
      if (this.sparkTimer <= 0) {
        this.sparkTimer = 0.03;
        const a = Math.random() * Math.PI * 2;
        const r = (doomsday.ballSize * 1.5 + 20) * px;
        const life = 0.25;
        this.fx.particle({ x: s.x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.6, life, from: 0.35, to: 0.1, tint: Math.random() < 0.5 ? doomsday.blastColor : 0xffffff, vx: (-Math.cos(a) * r) / life, vy: (-Math.sin(a) * r * 0.6) / life, depth: s.y + 4 });
      }
    }

    // While aiming: his range, the blast and the knockback where it would land, red where he cannot.
    const c = this.caster;
    const aiming = c.aiming >= 0;
    for (const img of [this.rangeRing, this.aimInner, this.aimOuter]) img.setVisible(aiming);
    if (aiming) {
      const hs = toScreen(heroX, heroY);
      const ts = toScreen(c.target.x, c.target.y);
      const tint = c.targetOk ? doomsday.okColor : doomsday.badColor;
      const pulse = 0.85 + 0.15 * Math.sin(this.age * 8);
      const size = (img: Phaser.GameObjects.Image, r: number) => {
        const half = ellipseHalfSize(r);
        img.setDisplaySize(half.x * 2, half.y * 2);
      };
      size(this.rangeRing, doomsday.range);
      this.rangeRing.setPosition(hs.x, hs.y).setTint(doomsday.okColor).setAlpha(doomsday.aimAlpha * 0.15);
      size(this.aimInner, doomsday.damageRadius);
      this.aimInner.setPosition(ts.x, ts.y).setTint(tint).setAlpha(doomsday.aimAlpha * pulse);
      size(this.aimOuter, doomsday.knockbackRadius);
      this.aimOuter.setPosition(ts.x, ts.y).setTint(tint).setAlpha(doomsday.aimAlpha * 0.4);
    }

    // The slots, bottom middle, once he holds any Vestige.
    const show = save.vestiges.length > 0;
    const x0 = width / 2 - ((VESTIGE_SLOTS - 1) * (SLOT + GAP)) / 2;
    const y = height - SLOT / 2 - 16;
    this.slots.forEach((sl, i) => {
      const v = equippedIn(i);
      const x = x0 + i * (SLOT + GAP);
      for (const o of [sl.box, sl.icon, sl.shade, sl.key, sl.time]) o.setVisible(show);
      if (!show) return;
      sl.box.setPosition(x, y).setStrokeStyle(3, c.aiming === i ? ui.lilac : ui.mid).setAlpha(v ? 1 : cfg.emptySlotAlpha);
      sl.key.setPosition(x - SLOT / 2 + 5, y - SLOT / 2 + 5).setAlpha(v ? 1 : cfg.emptySlotAlpha);
      sl.icon.setVisible(!!v);
      const cd = v ? c.cooldownFraction(v.id) : 0;
      sl.shade.setVisible(cd > 0).setPosition(x, y + SLOT / 2).setScale(1, cd);
      sl.time.setVisible(cd > 0).setPosition(x, y).setText(v && cd > 0 ? `${Math.ceil(c.cooldownLeft(v.id))}` : '');
      if (v) sl.icon.setTexture(vestigeTexture(v.id)).setScale(4).setPosition(x, y);
    });
  }
}
