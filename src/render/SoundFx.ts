import Phaser from 'phaser';
import { sound } from '../config/sound';
import { EffectEvent, effectSound } from '../data/sounds';

// Sound effects for game events (sounds.json `effects` says which sound each event plays).
export class SoundFx {
  private last = new Map<string, number>();

  constructor(private scene: Phaser.Scene) {}

  play(event: EffectEvent): void {
    const s = effectSound(event);
    if (!s || sound.mute || !this.scene.cache.audio.exists(s.id)) return;
    const now = performance.now() / 1000;
    if (now - (this.last.get(s.id) ?? -Infinity) < sound.repeatGap) return;
    this.last.set(s.id, now);
    const rate = 1 + (Math.random() * 2 - 1) * sound.pitchJitter;
    this.scene.sound.play(s.id, { volume: sound.volume * sound.effectsVolume * s.volume, rate });
  }
}
