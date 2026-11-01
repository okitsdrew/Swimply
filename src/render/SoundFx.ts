import Phaser from 'phaser';
import { sound } from '../config/sound';
import { EffectEvent, effectSounds } from '../data/sounds';

// Sound effects for game events (sounds.json `effects` says which sound each event plays).
export class SoundFx {
  private last = new Map<string, number>();

  constructor(private scene: Phaser.Scene) {}

  play(event: EffectEvent): void {
    if (sound.mute) return;
    const now = performance.now() / 1000;
    for (const s of effectSounds(event)) {
      if (!this.scene.cache.audio.exists(s.id) || now - (this.last.get(s.id) ?? -Infinity) < sound.repeatGap) continue;
      this.last.set(s.id, now);
      const rate = 1 + (Math.random() * 2 - 1) * sound.pitchJitter;
      this.scene.sound.play(s.id, { volume: sound.volume * sound.effectsVolume * s.volume, rate });
    }
  }
}
