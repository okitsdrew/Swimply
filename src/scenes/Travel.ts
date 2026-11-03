import Phaser from 'phaser';
import { player as cfgPlayer } from '../config/character';
import { story } from '../config/story';
import { Circle } from '../core/geometry';
import { Vec2 } from '../core/iso';
import { AreaMap, maps, Placed } from '../data/maps';
import { SoundFx } from '../render/SoundFx';
import { MapWorld } from '../sim/World';

// Where the player was standing when he last left each map, by map id, so coming back puts him there (back at the
// bow's pedestal after the Mindscape). Kept while the page is open, not saved.
const leftFrom = new Map<string, Vec2>();
// The map he came from, so the Mindscape knows where to send him back.
let cameFrom = '';

// Going between maps: doors he walks into, things with a link he uses (F) when next to them, the fade out, and where
// he arrives in the next map. The arena scene makes one per map.
export class Travel {
  // Fading out to another map; input is ignored meanwhile.
  leaving = false;
  // The thing next to him that interact would use.
  near: Placed | null = null;
  // Doors only take him once he has stood clear of every door since arriving, so coming back to the spot by a door
  // he left through does not send him straight out again.
  private doorsArmed = false;
  // He is leaving alive, so what he broke here can stay broken.
  onLeave: () => void = () => {};

  constructor(private scene: Phaser.Scene, private mapId: string, private calm: boolean, private world: MapWorld, private hero: Vec2, private sfx: SoundFx) {}

  // Back to a fresh start: no memory of where he left each map (the dev menu's "Story: fresh start").
  static forget(): void {
    leftFrom.clear();
    cameFrom = '';
  }

  // Fades out and goes to another map. He arrives beside the door there that leads back here; with no such door,
  // where he stood when he last left that map.
  go(to: string): void {
    if (this.leaving) return;
    const next = maps.get(to);
    if (!next) {
      console.warn(`[maps] ${this.mapId}: a link goes to unknown map ${JSON.stringify(to)}`);
      return;
    }
    this.leaving = true;
    this.onLeave();
    leftFrom.set(this.mapId, { x: this.hero.x, y: this.hero.y });
    cameFrom = this.mapId;
    // Into the Mindscape (a map Shades spawn in) from somewhere calm, or through a door from one calm map to another.
    const intoRun = next.objects.some((o) => o.asset.marker === 'shadeSpawn');
    if (this.calm) this.sfx.play(intoRun ? 'portal' : 'door');
    const cam = this.scene.cameras.main;
    cam.fadeOut(story.fadeTime * 1000);
    const back = next.objects.find((o) => o.asset.marker === 'door' && o.to === this.mapId);
    const data = back ? { map: next.id, door: { x: back.x, y: back.y } } : { map: next.id, at: leftFrom.get(next.id) };
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.scene.restart(data));
  }

  // Where to leave to after the Mindscape: the map he came from, else any map with a link here, else `fallback`.
  wayBack(fallback: string): string {
    if (cameFrom && cameFrom !== this.mapId) return cameFrom;
    return maps.list().find((m) => m.objects.some((o) => o.to === this.mapId))?.id ?? fallback;
  }

  // Doors take him as soon as he walks in. Anything else with a link waits for interact while he is next to it.
  check(map: AreaMap, interact: boolean): void {
    const p = this.hero;
    this.near = null;
    let best = Infinity;
    let inDoor = false;
    for (const o of map.objects) {
      if (!o.to) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (o.asset.marker === 'door') {
        if (d >= story.doorRadius * o.size) continue;
        if (this.doorsArmed) return this.go(o.to);
        inDoor = true;
        continue;
      }
      const reach = Math.max(0, ...o.asset.collision.map((c) => Math.hypot(c.x, c.y) + c.radius)) * o.size + story.interactRange;
      if (d < reach && d < best) {
        best = d;
        this.near = o;
      }
    }
    if (!inDoor) this.doorsArmed = true;
    if (this.near && interact) this.go(this.near.to);
  }

  // A spot beside a door where he can stand: clear of every door, inside the map, and not on blocking or killing
  // floor or inside anything solid. It tries spots in a ring round the door, the ones towards the middle of the map
  // first, then wider rings. If nothing fits, the door itself.
  besideDoor(map: AreaMap, door: Vec2): Vec2 {
    const r = cfgPlayer.bodyRadius;
    const w = this.world;
    const doors = map.objects.filter((o) => o.asset.marker === 'door');
    const inward = Math.atan2(w.height / 2 - door.y, w.width / 2 - door.x);
    const turns = [0];
    for (let i = 1; i <= 8; i++) turns.push(i, -i);
    const solid: Circle[] = [];
    for (const extra of [1, 1.5, 2, 3]) {
      for (const turn of turns) {
        const a = inward + (turn * Math.PI) / 8;
        const d = (story.doorRadius + r) * extra + 8;
        const x = door.x + Math.cos(a) * d;
        const y = door.y + Math.sin(a) * d;
        if (x < r || y < r || x > w.width - r || y > w.height - r) continue;
        if (doors.some((o) => Math.hypot(o.x - x, o.y - y) < story.doorRadius * o.size + r)) continue;
        if (w.onBlockingFloor(x, y, r) || w.onHurtingFloor(x, y)) continue;
        if (w.near(x, y, r, solid).length) continue;
        return { x, y };
      }
    }
    return { x: door.x, y: door.y };
  }
}
