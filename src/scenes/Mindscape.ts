import Phaser from 'phaser';
import { pickups as cfgPickups } from '../config/pickups';
import { run as cfgRun } from '../config/run';
import { shade } from '../config/shade';
import { story } from '../config/story';
import { tree } from '../config/tree';
import { werewolfMiniboss as werewolf } from '../config/werewolf';
import { Input } from '../core/input';
import { Vec2 } from '../core/iso';
import { save, writeSave } from '../core/save';
import { AreaMap } from '../data/maps';
import { PickupKind, pickupKinds } from '../data/pickups';
import { addShards, maxTree } from '../data/tree';
import { GhostText } from '../render/GhostText';
import { clock, RunHud } from '../render/RunHud';
import { SoundFx } from '../render/SoundFx';
import { Pickups } from '../sim/Pickups';
import { Player } from '../sim/Player';
import { Run } from '../sim/Run';
import { Werewolves } from '../sim/Werewolves';
import { stats } from '../sim/stats';
import { MapWorld } from '../sim/World';
import { Enemies } from './Enemies';
import { Travel } from './Travel';
import { TreeSceneData } from './TreeScene';

// What the arena lends the Mindscape and the tree screen.
export interface ArenaParts {
  scene: Phaser.Scene;
  map: () => AreaMap;
  world: MapWorld;
  player: Player;
  run: Run;
  hud: RunHud;
  enemies: Enemies;
  pickups: Pickups;
  sfx: SoundFx;
  ghost: GhostText;
  travel: Travel;
  input: Input;
  freeze: (seconds: number, force?: boolean) => void;
  pause: (on: boolean) => void;
  startRun: () => void;
}

// The full tree whatever was bought, teleport, and his strength for good.
export function winMindscape(): void {
  Object.assign(save.flags, { enteredMindscape: true, mindscapeCleared: true, teleport: true });
  maxTree();
  addShards(0);
}

// The tree screen, laid over the arena. The sim is paused under it, so nothing goes on attacking where he fell. After
// a death in the Mindscape, closing it starts the next run; opened from the dev menu, play carries on. Every map has
// one, for the dev menu.
export class TreeScreen {
  open = false;

  constructor(private a: ArenaParts) {}

  show(): void {
    if (this.open) return;
    this.open = true;
    this.a.hud.treeOpen = true;
    this.a.sfx.play('treeOpen');
    const r = this.a.run;
    const dead = r.state === 'dead' && this.a.map().mode === 'mindscape';
    this.a.pause(true);
    const data: TreeSceneData = {
      summary: dead ? `YOU DIED   ${clock(r.time)}, ${r.kills} kills, +${r.shards} shards` : 'MEMORIES',
      closeLabel: dead ? 'Next run' : 'Back',
      onClose: () => this.close(),
    };
    this.a.scene.scene.launch('tree', data);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.a.hud.treeOpen = false;
    this.a.sfx.play('click');
    this.a.scene.scene.stop('tree');
    // Clicks on the tree screen also reached the game's input; drop them so they don't fire an arrow.
    this.a.input.endFrame();
    if (this.a.run.state === 'dead') this.a.startRun();
    // The click on Next run is still held; the bow waits until it is let go.
    this.a.player.fireBlocked = true;
    this.a.pause(false);
  }
}

// The Mindscape: the run, played in a map whose mode is "mindscape". The Run spawns Shades and this picks where (the
// map's Shade spawn zones); kills drop memory shards, the werewolf comes after a while and beating him wins it, and
// a death opens the tree. The arena makes one only for such a map.
export class Mindscape {
  // Whether this run's werewolf has arrived yet.
  private wolfCame = false;

  // `home` is where to go back to when no map leads here.
  constructor(private a: ArenaParts, private tree: TreeScreen, private boss: Werewolves, private home: string) {
    // Being in the Mindscape is what brings back his strength.
    if (!save.flags.enteredMindscape) {
      save.flags.enteredMindscape = true;
      writeSave();
    }
    a.run.spawnPoint = () => this.spawnPoint();
    a.pickups.onCollected = (kind) => this.collect(kind);
  }

  // A new run.
  reset(): void {
    this.wolfCame = false;
  }

  // Each step, after the run's clock: the tree once he has been dead long enough, the werewolf once it is time.
  update(): void {
    const r = this.a.run;
    if (!this.tree.open && r.canRestart) this.tree.show();
    if (r.state === 'fighting' && !this.wolfCame && !r.holdSpawns && r.time >= werewolf.arriveTime) this.spawnWolf();
  }

  onKilled(kind: string, x: number, y: number): void {
    if (kind === 'shade' && this.a.run.state === 'fighting') {
      this.a.run.kills++;
      this.dropShards(x, y, tree.shardsPerKill);
    }
    if (kind === 'werewolf_miniboss') this.onWolfKilled(x, y);
  }

  // The HUD's dev notes for the run.
  notes(showHitboxes: boolean): string[] {
    const wolf = this.boss.list[0];
    return [showHitboxes && wolf ? `WEREWOLF ${wolf.state.toUpperCase()}` : '', this.a.run.holdSpawns ? 'SPAWNS HELD' : ''];
  }

  spawnWolf(): void {
    this.wolfCame = true;
    const p = this.spawnPoint();
    this.boss.spawn(p.x, p.y);
    this.a.hud.announce('THE WEREWOLF COMES');
    // Part of what reveals Time Warp on the tree.
    if (!save.flags.werewolfSeen) {
      save.flags.werewolfSeen = true;
      writeSave();
    }
  }

  private onWolfKilled(x: number, y: number): void {
    if (this.a.run.state !== 'fighting') return;
    this.dropShards(x, y, werewolf.shards, true);
    this.a.freeze(0.15, true);
    // Beating him wins the Mindscape, full tree or not: the Shades fade, then he wakes back where he touched the bow.
    winMindscape();
    this.a.run.holdSpawns = true;
    this.a.enemies.killAll('shade');
    // Every orb left on the floor comes to him.
    this.a.pickups.callAll();
    this.a.ghost.show('Memories restored', Math.max(0.5, story.clearedDelay - 1));
    this.a.scene.time.delayedCall(story.clearedDelay * 1000, () => this.a.travel.go(this.a.travel.wayBack(this.home)));
  }

  // Memory shard orbs where something died. A boss's pile bursts out further.
  private dropShards(x: number, y: number, count: number, burst = false): void {
    const kind = pickupKinds.get('memory_shard');
    if (kind && count > 0) this.a.pickups.drop(kind, x, y, count, burst ? cfgPickups.burstSpeed : cfgPickups.popSpeed);
  }

  // An orb reached him: bank its worth, after the tree's bonus for memory shards.
  private collect(kind: PickupKind): void {
    if (kind.wallet !== 'memory') return;
    const n = Math.round(kind.value * stats.shardGain());
    this.a.run.shards += n;
    addShards(n);
  }

  // A random spot inside one of the map's Shade spawn zones, or along its edge if it has none, far enough from the
  // player and clear of anything solid.
  private spawnPoint(): Vec2 {
    const world = this.a.world;
    const hero = this.a.player;
    const m = shade.radius * 1.5;
    const w = world.width - m;
    const h = world.height - m;
    const zones = this.a.map().objects.filter((o) => o.asset.marker === 'shadeSpawn');
    const p = { x: 0, y: 0, radius: shade.radius };
    let best = { x: 0, y: 0 };
    let bestDist = -1;
    for (let i = 0; i < 12; i++) {
      if (zones.length) {
        const z = zones[Math.floor(Math.random() * zones.length)];
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * cfgRun.spawnZoneRadius * z.size;
        p.x = z.x + Math.cos(a) * r;
        p.y = z.y + Math.sin(a) * r;
      } else {
        const side = Math.floor(Math.random() * 4);
        const along = Math.random();
        p.x = side < 2 ? m + along * (w - m) : side === 2 ? m : w;
        p.y = side < 2 ? (side === 0 ? m : h) : m + along * (h - m);
      }
      world.resolve(p);
      const d = Math.hypot(p.x - hero.x, p.y - hero.y);
      if (d > bestDist) {
        best = { x: p.x, y: p.y };
        bestDist = d;
      }
      if (d >= cfgRun.minSpawnDistance) break;
    }
    return best;
  }
}
