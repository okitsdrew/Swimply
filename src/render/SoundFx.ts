import Phaser from 'phaser';
import { sound } from '../config/sound';
import { EffectEvent, effectSounds, sounds } from '../data/sounds';

// Sound effects for game events (sounds.json `effects` says which sound each event plays).
export class SoundFx {
  private last = new Map<string, number>();

  constructor(private scene: Phaser.Scene) {}

  // One sound by its id in sounds.json (a story step), at the effects volume.
  playSound(id: string): void {
    const s = sounds.get(id);
    if (!s) return void console.warn(`[sound] unknown sound ${JSON.stringify(id)}`);
    if (sound.mute || !this.scene.cache.audio.exists(id)) return;
    this.scene.sound.play(id, { volume: sound.volume * sound.effectsVolume * s.volume });
  }

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
