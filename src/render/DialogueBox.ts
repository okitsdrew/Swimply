import Phaser from 'phaser';
import { render } from '../config/render';
import { sound } from '../config/sound';
import { dialogue } from '../config/story';
import { sounds } from '../data/sounds';
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
  // Shows once a line has typed out: click or F for the next.
  private more: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Graphics;
  private bubbleWords: Phaser.GameObjects.Text;
  private text = '';
  // Letters typed so far, and seconds until the next one.
  private shown = 0;
  private wait = 0;
  private k = 1;
  private voice = '';
  private pitch = 1;
  // The speaker's line sound, playing, so the next line can cut it off, and how many line sounds have played so far,
  // to take turns.
  private lineSound?: Phaser.Sound.BaseSound;
  private lineTurn = 0;
  // Letters spoken since the last blip.
  private letters = 0;
  private open = 0;
  private inBubble = false;
  private visible = false;

  constructor(private scene: Phaser.Scene) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(DEPTH);
    this.panel = fixed(scene.add.graphics());
    this.face = fixed(scene.add.image(0, 0, '__WHITE').setOrigin(0.5));
    this.name = fixed(scene.add.text(0, 0, '', { ...font, fontSize: '13px' }));
    this.more = fixed(scene.add.text(0, 0, '▼', { ...font, fontSize: '14px', color: '#c58cff' }).setOrigin(1, 1));
    this.words = fixed(scene.add.text(0, 0, '', { ...font, fontSize: '18px', wordWrap: { width: BOX_W - FACE - PAD * 3 } }));
    this.bubble = scene.add.graphics().setDepth(DEPTH);
    this.bubbleWords = scene.add.text(0, 0, '', { ...font, fontSize: '16px', color: '#f2d7a6' }).setOrigin(0.5).setDepth(DEPTH);
    this.setAlpha(0);
  }

  // `face` is a texture key; a missing one leaves the face empty rather than showing a broken image.
  show(name: string, color: string, face: string, text: string, bubble: boolean, voice = '', pitch = 1, lineSounds: string[] = []): void {
    this.text = text;
    this.playLine(lineSounds);
    this.shown = 0;
    this.wait = 0;
    this.voice = voice;
    this.pitch = pitch;
    this.letters = dialogue.blipEvery - 1;
    // Sizes follow dialogue.scale, read as each line starts.
    const k = (this.k = dialogue.scale);
    this.name.setFontSize(13 * k);
    this.more.setFontSize(14 * k);
    this.words.setFontSize(18 * k).setWordWrapWidth((BOX_W - FACE - PAD * 3) * k);
    this.inBubble = bubble;
    this.visible = true;
    this.name.setText(name.toUpperCase()).setColor(color);
    this.words.setText('').setColor(color);
    this.bubbleWords.setText('').setColor(color);
    const hasFace = !!face && this.scene.textures.exists(face);
    this.face.setVisible(hasFace);
    if (hasFace) {
      this.face.setTexture(face);
      const scale = Math.floor(((FACE - 8) * k) / Math.max(this.face.width, this.face.height));
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

  // `heroX`/`heroY` are the hero's world position, for the bubble.
  update(dt: number, width: number, heroX: number, heroY: number): void {
    this.open = Phaser.Math.Clamp(this.open + (this.visible ? dt : -dt) * 8, 0, 1);
    if (this.visible) {
      this.wait -= dt;
      while (this.wait <= 0 && this.shown < this.text.length) {
        const ch = this.text[this.shown];
        this.wait += ch === '.' ? dialogue.dotTime : 1 / Math.max(dialogue.typeSpeed, 1);
        this.shown++;
        if (/[a-z0-9]/i.test(ch) && ++this.letters >= dialogue.blipEvery) {
          this.letters = 0;
          this.blip();
        }
      }
    }
    const typed = this.text.slice(0, this.shown);
    const boxA = this.inBubble ? 0 : this.open;
    const bubbleA = this.inBubble ? this.open : 0;

    const k = this.k;
    const [w, h, face, pad] = [BOX_W * k, BOX_H * k, FACE * k, PAD * k];
    const x = (width - w) / 2;
    const y = 16 - (1 - boxA) * 12;
    this.panel.clear();
    if (boxA > 0) {
      this.panel.fillStyle(0x0d0814, 0.85).fillRoundedRect(x, y, w, h, 8 * k);
      this.panel.lineStyle(2, 0x6a3fa0, 1).strokeRoundedRect(x, y, w, h, 8 * k);
      this.panel.fillStyle(0x1d1230, 1).fillRoundedRect(x + pad, y + (h - face) / 2, face, face, 6 * k);
    }
    this.face.setPosition(x + pad + face / 2, y + h / 2);
    this.name.setPosition(x + face + pad * 2, y + pad);
    this.words.setPosition(x + face + pad * 2, y + pad + 20 * k).setText(boxA > 0 ? typed : '');
    for (const o of [this.panel, this.face, this.name, this.words]) o.setAlpha(boxA);
    const blink = this.typed && this.visible && Math.sin(performance.now() / 180) > -0.3 ? 1 : 0;
    this.more.setPosition(x + w - pad, y + h - pad + Math.sin(performance.now() / 180) * 2).setAlpha(boxA * blink);

    const s = toScreen(heroX, heroY);
    const by = s.y - 40 * render.pixelScale;
    this.bubbleWords.setText(bubbleA > 0 ? (typed || ' ') + (blink ? ' ▼' : '  ') : '').setPosition(s.x, by).setAlpha(bubbleA);
    this.bubble.clear();
    if (bubbleA > 0) {
      const bw = Math.max(36, this.bubbleWords.width + 16);
      const bh = 28;
      this.bubble.fillStyle(0x0d0814, 0.85 * bubbleA).fillRoundedRect(s.x - bw / 2, by - bh / 2, bw, bh, 8);
      this.bubble.fillTriangle(s.x - 6, by + bh / 2, s.x + 6, by + bh / 2, s.x, by + bh / 2 + 7);
      this.bubble.lineStyle(2, 0x6a3fa0, bubbleA).strokeRoundedRect(s.x - bw / 2, by - bh / 2, bw, bh, 8);
    }
  }

  // One syllable of the speaker's voice.
  private blip(): void {
    const s = sounds.get(this.voice);
    if (!s || sound.mute || !this.scene.cache.audio.exists(s.id)) return;
    const rate = this.pitch * (1 + (Math.random() * 2 - 1) * dialogue.blipJitter);
    this.scene.sound.play(s.id, { volume: sound.volume * sound.voiceVolume * s.volume, rate });
  }

  private playLine(ids: string[]): void {
    this.lineSound?.stop();
    this.lineSound = undefined;
    if (!ids.length) return;
    const s = sounds.get(ids[this.lineTurn++ % ids.length]);
    if (!s || sound.mute || !this.scene.cache.audio.exists(s.id)) return;
    this.lineSound = this.scene.sound.add(s.id, { volume: sound.volume * sound.voiceVolume * s.volume });
    this.lineSound.once(Phaser.Sound.Events.COMPLETE, () => this.lineSound?.destroy());
    this.lineSound.play();
  }

  private setAlpha(a: number): void {
    for (const o of [this.panel, this.face, this.name, this.words, this.more, this.bubbleWords]) o.setAlpha(a);
  }
}
