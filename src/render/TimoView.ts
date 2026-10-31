import Phaser from 'phaser';
import { render } from '../config/render';
import { timo } from '../config/story';
import { toScreen } from '../core/iso';
import { assets } from '../data/assets';

// Timo, floating near the hero or next to something the story points him at. He looks like the `timo` asset (its
// idle frames and shadow, so the asset maker tunes him) and, while he speaks, wears the face of his line.
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

  // A texture key while he is speaking, '' to go back to idling.
  setFace(face: string): void {
    const want = face && this.scene.textures.exists(face) ? face : '';
    if (want === this.face) return;
    this.face = want;
    if (want) this.sprite.stop().setTexture(want).setDisplayOrigin(this.ox, this.oy);
    else if (this.anim) this.sprite.play(this.anim).setDisplayOrigin(this.ox, this.oy);
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    this.sprite.setVisible(visible);
    this.shadow?.setVisible(visible);
  }

  update(dt: number, heroX: number, heroY: number): void {
    if (this.follow) {
      this.tx = heroX + timo.followX;
      this.ty = heroY + timo.followY;
    }
    if (!this.placed) {
      this.x = this.tx;
      this.y = this.ty;
      this.placed = true;
    }
    const k = 1 - Math.exp(-timo.moveRate * dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    if (!this.shown) return;
    this.age += dt;
    const s = toScreen(this.x, this.y);
    const bob = Math.sin(this.age * timo.bobRate) * timo.bob * render.pixelScale;
    // Faces the hero, or the way he is drifting.
    const hs = toScreen(heroX, heroY);
    const lookX = Math.abs(this.tx - this.x) + Math.abs(this.ty - this.y) > 8 ? toScreen(this.tx, this.ty).x - s.x : hs.x - s.x;
    if (Math.abs(lookX) > 2) this.sprite.setFlipX(lookX < 0);
    this.sprite.setPosition(s.x, s.y + bob).setDepth(s.y);
    this.shadow?.setPosition(s.x, s.y).setDepth(s.y - 1000);
  }
}
