import Phaser from 'phaser';
import { dialogue } from '../config/story';

const FADE_IN = 0.5;

interface Letter {
  text: Phaser.GameObjects.Text;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  // How hard the wind catches this letter, so they do not move as one block.
  catch: number;
  phase: number;
}

// Ghostly words in the middle of the screen (tutorial prompts, "Memories restored"). They fade in, hover, then the
// wind takes them one letter at a time, left to right, and they tumble off and fade.
export class GhostText {
  private letters: Letter[] = [];
  private age = 0;
  private hold = 0;

  constructor(private scene: Phaser.Scene) {}

  // Replaces any words still showing. `hold` is seconds before the wind comes.
  show(text: string, hold = dialogue.tutorialTime): void {
    this.clear();
    this.age = 0;
    this.hold = hold;
    const style = {
      fontFamily: 'monospace',
      fontSize: '30px',
      fontStyle: 'bold',
      color: '#e4ecff',
      stroke: '#2a1f4a',
      strokeThickness: 2,
    };
    for (const ch of text) {
      const t = this.scene.add.text(0, 0, ch, style).setOrigin(0.5).setScrollFactor(0).setDepth(2.2e7).setAlpha(0);
      t.setShadow(0, 0, '#9fb6ff', 12, true, true);
      this.letters.push({ text: t, x: 0, y: 0, vx: 0, vy: 0, spin: 0, catch: 0.7 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2 });
    }
  }

  get done(): boolean {
    return this.letters.length === 0;
  }

  clear(): void {
    for (const l of this.letters) l.text.destroy();
    this.letters = [];
  }

  update(dt: number, width: number, height: number): void {
    if (!this.letters.length) return;
    this.age += dt;
    const n = this.letters.length;
    const charW = this.letters[0].text.width * 0.92;
    const left = width / 2 - ((n - 1) * charW) / 2;
    let gone = 0;
    this.letters.forEach((l, i) => {
      const blowAt = this.hold + i * dialogue.blowStagger;
      const t = this.age - blowAt;
      if (t <= 0) {
        // Fading in letter by letter, then hovering.
        l.x = left + i * charW;
        l.y = height * 0.32 + Math.sin(this.age * 2 + i * 0.5) * 3;
        const a = Phaser.Math.Clamp((this.age - (i / n) * FADE_IN) / FADE_IN, 0, 1);
        l.text.setPosition(l.x, l.y).setAlpha(a * 0.9).setRotation(0);
        return;
      }
      if (t >= dialogue.blowTime) {
        gone++;
        l.text.setAlpha(0);
        return;
      }
      // Caught by the wind: pushed right, lifted, curling and spinning.
      l.vx += dialogue.wind * l.catch * dt;
      l.vy += (Math.sin(t * 7 + l.phase) * 260 - 120) * dt;
      l.spin += (l.catch - 1) * 18 * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.text.setPosition(l.x, l.y).setRotation(l.text.rotation + l.spin * dt).setAlpha(0.9 * (1 - t / dialogue.blowTime));
    });
    if (gone === n) this.clear();
  }
}
