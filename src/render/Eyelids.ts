import Phaser from 'phaser';

// The hero's eyelids: black from the top and bottom of the screen. Closed is a black screen; opening plays a few
// heavy blinks, as if waking up. Under the dialogue box, so words show on the black.
const WAKE: [number, number][] = [[0, 0], [0.18, 0.3], [0.3, 0.04], [0.5, 0.55], [0.62, 0.12], [0.85, 0.85], [1, 1]];
const SOFT = 40;

export class Eyelids {
  private gfx: Phaser.GameObjects.Graphics;
  // 0 shut, 1 open.
  private open = 1;
  private wake = 0;
  private wakeTime = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(2.05e7);
  }

  close(): void {
    this.open = 0;
    this.wakeTime = 0;
  }

  // Opens over `seconds` with blinks on the way.
  wakeUp(seconds: number): void {
    this.wake = 0;
    this.wakeTime = Math.max(seconds, 0.01);
  }

  update(dt: number, width: number, height: number): void {
    if (this.wakeTime > 0) {
      this.wake = Math.min(1, this.wake + dt / this.wakeTime);
      let i = 1;
      while (i < WAKE.length - 1 && WAKE[i][0] < this.wake) i++;
      const [t0, a] = WAKE[i - 1];
      const [t1, b] = WAKE[i];
      const f = Phaser.Math.Easing.Sine.InOut(Phaser.Math.Clamp((this.wake - t0) / (t1 - t0), 0, 1));
      this.open = a + (b - a) * f;
      if (this.wake >= 1) this.wakeTime = 0;
    }
    const g = this.gfx.clear();
    if (this.open >= 1) return;
    // Each lid covers half the screen when shut, with a soft edge.
    const lid = (height / 2 + SOFT) * (1 - this.open);
    g.fillStyle(0x000000, 1).fillRect(0, 0, width, lid - SOFT).fillRect(0, height - lid + SOFT, width, lid);
    for (let i = 0; i < SOFT; i += 4) {
      const a = 1 - i / SOFT;
      g.fillStyle(0x000000, a).fillRect(0, lid - SOFT + i, width, 4).fillRect(0, height - lid + SOFT - i - 4, width, 4);
    }
  }
}
