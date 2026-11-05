import Phaser from 'phaser';
import { render } from '../config/render';
import { timo } from '../config/story';
import { doomsday, emblems } from '../config/vestiges';
import { toScreen } from '../core/iso';
import { assets } from '../data/assets';
import { Tex } from './art';

// Timo, floating near the hero or next to something the story points him at. He looks like the `timo` asset (its
// idle frames and shadow, so the asset maker tunes him) and, while he speaks, wears the face of his line. He is
// also Doomsday's emblem: he glows while it is in use and is thrown at the spot it was cast on.
export class TimoView {
  x = 0;
  y = 0;
  private tx = 0;
  private ty = 0;
  // Follows the hero unless the story sent him somewhere.
  private follow = true;
  private placed = false;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image;
  private glowColor = -1;
  // While thrown: how far along (0 to 1) from where he was, or -1.
  private flight = -1;
  private fromX = 0;
  private fromY = 0;
  private anim = '';
  private face = '';
  private age = Math.random() * 10;
  private shown = true;
  // The idle art's origin, in pixels from its top-left, so a face of another height lines up with it.
  private ox = 0;
  private oy = 0;

  constructor(private scene: Phaser.Scene) {
    const parts = assets.get('timo')?.parts ?? [];
    const body = parts.find((p) => !p.ground);
    const shadow = parts.find((p) => p.ground);
    const px = render.pixelScale;
    this.sprite = scene.add.sprite(0, 0, body?.texture ?? 'timo').setOrigin(body?.originX ?? 0.5, body?.originY ?? 1.5).setScale(px * (body?.scale ?? 1));
    if (shadow && scene.textures.exists(shadow.texture)) {
      this.shadow = scene.add.image(0, 0, shadow.texture).setOrigin(shadow.originX, shadow.originY).setScale(px * shadow.scale).setAlpha(0.6);
    }
    this.glow = scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.ox = this.sprite.displayOriginX;
    this.oy = this.sprite.displayOriginY;
    const frames = (body?.frames ?? []).filter((f) => scene.textures.exists(f));
    if (frames.length) {
      this.anim = `timo:${frames.join('+')}@${body?.fps ?? 8}`;
      if (!scene.anims.exists(this.anim)) scene.anims.create({ key: this.anim, frames: frames.map((k) => ({ key: k })), frameRate: Math.max(body?.fps ?? 8, 0.1), repeat: -1 });
      this.sprite.play(this.anim);
    }
  }

  // Back to floating by the hero.
  followHero(): void {
    this.follow = true;
  }

  // Floats over to beside a world point.
  goTo(x: number, y: number): void {
    this.follow = false;
    this.tx = x + timo.besideX;
    this.ty = y + timo.besideY;
  }

  // Floats to exactly this world point (leading the hero somewhere).
  lead(x: number, y: number): void {
    this.follow = false;
    this.tx = x;
    this.ty = y;
  }

  // A texture key while he is speaking, '' to go back to idling. A face with frames `<face>_1`, `_2`... plays them.
  setFace(face: string): void {
    const want = face && this.scene.textures.exists(face) ? face : '';
    if (want === this.face) return;
    this.face = want;
    const frames = [want];
    for (let n = 1; want && this.scene.textures.exists(`${want}_${n}`); n++) frames.push(`${want}_${n}`);
    if (frames.length > 1) {
      const key = `timo-face:${want}@${timo.faceFps}`;
      if (!this.scene.anims.exists(key)) this.scene.anims.create({ key, frames: frames.map((k) => ({ key: k })), frameRate: Math.max(timo.faceFps, 0.1), repeat: -1 });
      this.sprite.play(key).setDisplayOrigin(this.ox, this.oy);
    } else if (want) this.sprite.stop().setTexture(want).setDisplayOrigin(this.ox, this.oy);
    else if (this.anim) this.sprite.play(this.anim).setDisplayOrigin(this.ox, this.oy);
  }

  // A glow behind him in this colour (his Vestige in use), or -1 for none.
  setGlow(color: number): void {
    this.glowColor = color;
  }

  // Thrown at (x, y): `k` is how far he has flown, 0 to 1. He arcs and spins on the way.
  throwAt(x: number, y: number, k: number): void {
    if (this.flight < 0) {
      this.fromX = this.x;
      this.fromY = this.y;
    }
    this.flight = Math.min(1, Math.max(0, k));
    this.tx = x;
    this.ty = y;
  }

  // Back by the hero at once (out of the ball after the blast).
  popBack(heroX: number, heroY: number): void {
    this.flight = -1;
    this.follow = true;
    this.x = heroX + timo.followX;
    this.y = heroY + timo.followY;
    this.sprite.setAngle(0);
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    this.sprite.setVisible(visible);
    this.shadow?.setVisible(visible);
  }

  update(dt: number, heroX: number, heroY: number): void {
    if (this.flight >= 0) {
      this.x = this.fromX + (this.tx - this.fromX) * this.flight;
      this.y = this.fromY + (this.ty - this.fromY) * this.flight;
    } else if (this.follow) {
      this.tx = heroX + timo.followX;
      this.ty = heroY + timo.followY;
    }
    if (!this.placed) {
      this.x = this.tx;
      this.y = this.ty;
      this.placed = true;
    }
    if (this.flight < 0) {
      const k = 1 - Math.exp(-timo.moveRate * dt);
      this.x += (this.tx - this.x) * k;
      this.y += (this.ty - this.y) * k;
    }
    this.glow.setVisible(this.shown && this.glowColor >= 0);
    if (!this.shown) return;
    this.age += dt;
    const s = toScreen(this.x, this.y);
    const bob = Math.sin(this.age * timo.bobRate) * timo.bob * render.pixelScale;
    // Faces the hero, or the way he is drifting.
    const hs = toScreen(heroX, heroY);
    const lookX = Math.abs(this.tx - this.x) + Math.abs(this.ty - this.y) > 8 ? toScreen(this.tx, this.ty).x - s.x : hs.x - s.x;
    if (Math.abs(lookX) > 2) this.sprite.setFlipX(lookX < 0);
    const lift = this.flight >= 0 ? Math.sin(this.flight * Math.PI) * doomsday.throwArc * render.pixelScale : 0;
    this.sprite.setPosition(s.x, s.y + bob - lift).setDepth(s.y).setAngle(this.flight >= 0 ? this.flight * doomsday.throwSpins * 360 : 0);
    this.shadow?.setPosition(s.x, s.y).setDepth(s.y - 1000);
    if (this.glowColor >= 0) {
      const c = this.sprite.getCenter();
      this.glow.setPosition(c.x, c.y).setDepth(s.y - 0.1).setTint(this.glowColor).setScale((doomsday.timoGlow * render.pixelScale * emblems.activeGlow) / 32).setAlpha(0.5 + 0.15 * Math.sin(this.age * 9));
    }
  }
}
