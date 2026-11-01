import Phaser from 'phaser';
import { sound } from '../config/sound';
import { Ambience, sounds } from '../data/sounds';

// Plays a map's background sounds: the next of its list every few seconds, so the same one never plays twice in a
// row. Browsers stay silent until the first click or key press on the page.
export class AmbienceView {
  private next = 1;
  private turn = 0;

  constructor(private scene: Phaser.Scene, private ambience: Ambience | undefined) {}

  update(dt: number): void {
    const a = this.ambience;
    if (!a) return;
    this.next -= dt;
    if (this.next > 0) return;
    this.next = a.every + (Math.random() * 2 - 1) * a.jitter;
    const s = sounds.get(a.sounds[this.turn++ % a.sounds.length]);
    if (!s || sound.mute || !this.scene.cache.audio.exists(s.id)) return;
    this.scene.sound.play(s.id, { volume: sound.volume * sound.ambientVolume * s.volume });
  }
}
