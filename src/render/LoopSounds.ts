import Phaser from 'phaser';
import { sound } from '../config/sound';
import { AreaMap } from '../data/maps';
import { sounds } from '../data/sounds';

// Looping sounds that come from places: every placed thing and floor tile with a `sound` (fires, burning floor).
// Each sound loops once for the whole map, as loud as its nearest source allows, fading to nothing at
// sound.loopRange, so ten fires do not make ten times the noise.
export class LoopSounds {
  private sources = new Map<string, { x: number; y: number }[]>();
  private playing = new Map<string, Phaser.Sound.BaseSound>();

  constructor(private scene: Phaser.Scene, map: AreaMap) {
    const add = (id: string, x: number, y: number) => {
      if (!id || !sounds.has(id)) return;
      const list = this.sources.get(id) ?? [];
      list.push({ x, y });
      this.sources.set(id, list);
    };
    for (const o of map.objects) add(o.asset.sound, o.x, o.y);
    const t = map.tileSize;
    map.tiles.forEach((f, i) => add(f.sound, ((i % map.cols) + 0.5) * t, (Math.floor(i / map.cols) + 0.5) * t));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const s of this.playing.values()) s.destroy();
      this.playing.clear();
    });
  }

  update(x: number, y: number): void {
    for (const [id, points] of this.sources) {
      let near = Infinity;
      for (const p of points) near = Math.min(near, (p.x - x) ** 2 + (p.y - y) ** 2);
      const k = Math.max(0, 1 - Math.sqrt(near) / sound.loopRange);
      const volume = sound.mute ? 0 : sound.volume * sound.loopVolume * (sounds.get(id)?.volume ?? 1) * k * k;
      let s = this.playing.get(id);
      if (!s && volume > 0 && this.scene.cache.audio.exists(id)) {
        s = this.scene.sound.add(id, { loop: true, volume: 0 });
        s.play();
        this.playing.set(id, s);
      }
      (s as Phaser.Sound.WebAudioSound | undefined)?.setVolume(volume);
    }
  }
}
