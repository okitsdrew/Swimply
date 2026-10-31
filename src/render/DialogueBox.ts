import Phaser from 'phaser';
import { render } from '../config/render';
import { dialogue } from '../config/story';
import { toScreen } from '../core/iso';

const BOX_W = 640;
const BOX_H = 104;
const FACE = 80;
const PAD = 12;
const DEPTH = 2.1e7;

const font = {
  fontFamily: 'monospace',
  fontStyle: 'bold',
  stroke: '#1a1020',
  strokeThickness: 3,
};

// One line of dialogue: in the box at the top middle with the speaker's face on its left, or in a small bubble over
// the hero's head for a speaker who talks that way. The words type out letter by letter.
export class DialogueBox {
  private panel: Phaser.GameObjects.Graphics;
  private face: Phaser.GameObjects.Image;
  private name: Phaser.GameObjects.Text;
  private words: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Graphics;
  private bubbleWords: Phaser.GameObjects.Text;
  private text = '';
  private shown = 0;
  private open = 0;
  private inBubble = false;
  private visible = false;

  constructor(private scene: Phaser.Scene) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(DEPTH);
    this.panel = fixed(scene.add.graphics());
    this.face = fixed(scene.add.image(0, 0, '__WHITE').setOrigin(0.5));
    this.name = fixed(scene.add.text(0, 0, '', { ...font, fontSize: '13px' }));
    this.words = fixed(scene.add.text(0, 0, '', { ...font, fontSize: '18px', wordWrap: { width: BOX_W - FACE - PAD * 3 } }));
    this.bubble = scene.add.graphics().setDepth(DEPTH);
    this.bubbleWords = scene.add.text(0, 0, '', { ...font, fontSize: '16px', color: '#f2d7a6' }).setOrigin(0.5).setDepth(DEPTH);
    this.setAlpha(0);
  }

  // `face` is a texture key; a missing one leaves the face empty rather than showing a broken image.
  show(name: string, color: string, face: string, text: string, bubble: boolean): void {
    this.text = text;
    this.shown = 0;
    this.inBubble = bubble;
    this.visible = true;
    this.name.setText(name.toUpperCase()).setColor(color);
    this.words.setText('').setColor(color);
    this.bubbleWords.setText('').setColor(color);
    const hasFace = !!face && this.scene.textures.exists(face);
    this.face.setVisible(hasFace);
    if (hasFace) {
      this.face.setTexture(face);
      const scale = Math.floor((FACE - 8) / Math.max(this.face.width, this.face.height));
      this.face.setScale(Math.max(1, scale));
    }
  }

  hide(): void {
    this.visible = false;
  }

  // Every letter is out.
  get typed(): boolean {
    return this.shown >= this.text.length;
  }

  finish(): void {
    this.shown = this.text.length;
  }

  // Seconds a fully typed line should stay before moving on.
  get readTime(): number {
    return dialogue.readTime + dialogue.readPerChar * this.text.length;
  }

  // `heroX`/`heroY` are the hero's world position, for the bubble.
  update(dt: number, width: number, heroX: number, heroY: number): void {
    this.open = Phaser.Math.Clamp(this.open + (this.visible ? dt : -dt) * 8, 0, 1);
    if (this.visible) this.shown = Math.min(this.text.length, this.shown + dialogue.typeSpeed * dt);
    const typed = this.text.slice(0, Math.floor(this.shown));
    const boxA = this.inBubble ? 0 : this.open;
    const bubbleA = this.inBubble ? this.open : 0;

    const x = (width - BOX_W) / 2;
    const y = 16 - (1 - boxA) * 12;
    this.panel.clear();
    if (boxA > 0) {
      this.panel.fillStyle(0x0d0814, 0.85).fillRoundedRect(x, y, BOX_W, BOX_H, 8);
      this.panel.lineStyle(2, 0x6a3fa0, 1).strokeRoundedRect(x, y, BOX_W, BOX_H, 8);
      this.panel.fillStyle(0x1d1230, 1).fillRoundedRect(x + PAD, y + (BOX_H - FACE) / 2, FACE, FACE, 6);
    }
    this.face.setPosition(x + PAD + FACE / 2, y + BOX_H / 2);
    this.name.setPosition(x + FACE + PAD * 2, y + PAD);
    this.words.setPosition(x + FACE + PAD * 2, y + PAD + 20).setText(boxA > 0 ? typed : '');
    for (const o of [this.panel, this.face, this.name, this.words]) o.setAlpha(boxA);

    const s = toScreen(heroX, heroY);
    const by = s.y - 40 * render.pixelScale;
    this.bubbleWords.setText(bubbleA > 0 ? typed || ' ' : '').setPosition(s.x, by).setAlpha(bubbleA);
    this.bubble.clear();
    if (bubbleA > 0) {
      const w = Math.max(36, this.bubbleWords.width + 16);
      const h = 28;
      this.bubble.fillStyle(0x0d0814, 0.85 * bubbleA).fillRoundedRect(s.x - w / 2, by - h / 2, w, h, 8);
      this.bubble.fillTriangle(s.x - 6, by + h / 2, s.x + 6, by + h / 2, s.x, by + h / 2 + 7);
      this.bubble.lineStyle(2, 0x6a3fa0, bubbleA).strokeRoundedRect(s.x - w / 2, by - h / 2, w, h, 8);
    }
  }

  private setAlpha(a: number): void {
    for (const o of [this.panel, this.face, this.name, this.words, this.bubbleWords]) o.setAlpha(a);
  }
}
