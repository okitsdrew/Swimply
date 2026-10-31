import Phaser from 'phaser';
import { player as cfgPlayer } from '../config/character';
import { camera } from '../config/feel';
import { render } from '../config/render';
import { run } from '../config/run';
import { shade } from '../config/shade';
import { sim } from '../config/sim';
import { tree } from '../config/tree';
import { werewolfMiniboss as werewolf } from '../config/werewolf';
import { Input, KeyboardMouseSource } from '../core/input';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { AreaMap, findMarker, maps } from '../data/maps';
import { addShards, maxTree, resetTree, treeComplete } from '../data/tree';
import { save, writeSave } from '../core/save';
import { DevMenu } from '../dev/DevMenu';
import { ArrowsView } from '../render/ArrowsView';
import { makeArt } from '../render/art';
import { Fx } from '../render/Fx';
import { MapView } from '../render/MapView';
import { PlayerView } from '../render/PlayerView';
import { clock, RunHud } from '../render/RunHud';
import { ShadesView } from '../render/ShadesView';
import { WerewolfView } from '../render/WerewolfView';
import { Arrows } from '../sim/Arrows';
import { Player } from '../sim/Player';
import { Run } from '../sim/Run';
import { Shades } from '../sim/Shades';
import { stats } from '../sim/stats';
import { Target } from '../sim/targets';
import { Werewolf } from '../sim/Werewolf';
import { FlowField } from '../sim/Nav';
import { MapWorld } from '../sim/World';
import { TreeSceneData } from './TreeScene';

const DEFAULT_MAP = 'mindscape';

// The page address can pick what to play, which is how the level editor's "play here" opens the game:
//   ?map=spawn        play that map
//   &at=320,640       start there (world units) instead of at the map's player start
//   &calm             no Shades appear, to walk round a map
// The map is kept in the address, so the reload after a tool saves comes back to the same map.
const params = new URLSearchParams(location.search);

// The arena: a map from src/data/maps, Shades that keep coming, death, the upgrade tree, and the next run. The sim runs on a fixed time
// step here; drawing runs once per screen frame. Switching map restarts the scene with the new map's id.
export class ArenaScene extends Phaser.Scene {
  private input2!: Input;
  private mapId = params.get('map') ?? DEFAULT_MAP;
  private map!: AreaMap;
  private world!: MapWorld;
  private nav!: FlowField;
  private mapView!: MapView;
  private player!: Player;
  private view!: PlayerView;
  private fx!: Fx;
  private arrows!: Arrows;
  private arrowsView!: ArrowsView;
  private shades!: Shades;
  private shadesView!: ShadesView;
  private wolf!: Werewolf;
  private wolfView!: WerewolfView;
  // Whether this run's werewolf has arrived yet.
  private wolfCame = false;
  private targets: Target[] = [];
  private run!: Run;
  private hud!: RunHud;
  private debug!: Phaser.GameObjects.Graphics;
  private showHitboxes = false;
  private camCenter = { x: 0, y: 0 };
  // Sim time owed to the fixed step, carried between frames.
  private acc = 0;
  private hitStop = 0;
  // Seconds since the last hit-stop began, for run.hitStopGap.
  private sinceHitStop = Infinity;
  private paused = false;
  private stepsQueued = 0;
  private aim: Vec2 | null = null;
  private treeOpen = false;

  constructor() {
    super('arena');
  }

  init(data: { map?: string }): void {
    if (data.map) this.mapId = data.map;
  }

  create(): void {
    // A missing map (renamed or deleted file) falls back to any map rather than a blank screen.
    const map = maps.get(this.mapId) ?? maps.get(DEFAULT_MAP) ?? maps.list()[0];
    if (!map) throw new Error('No maps in src/data/maps');
    this.map = map;
    this.mapId = map.id;
    if (params.get('map') !== map.id) {
      params.set('map', map.id);
      params.delete('at');
      history.replaceState(null, '', `?${params}`);
    }
    this.world = new MapWorld(map);
    this.nav = new FlowField(map, this.world);
    this.acc = 0;
    this.paused = false;
    this.stepsQueued = 0;
    this.treeOpen = false;

    makeArt(this);
    this.cameras.main.setBackgroundColor(0x000000);
    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.fx = new Fx(this);
    this.mapView = new MapView(this, map, false);
    this.debug = this.add.graphics().setDepth(1e7);

    this.player = new Player(this.world);
    this.view = new PlayerView(this, this.player, this.fx);
    this.arrows = new Arrows();
    this.arrowsView = new ArrowsView(this, this.arrows, this.fx);
    this.shades = new Shades();
    this.shadesView = new ShadesView(this, this.shades, this.fx);
    this.wolf = new Werewolf(werewolf);
    this.wolfView = new WerewolfView(this, this.wolf, this.fx);
    this.run = new Run(this.shades);
    this.run.holdSpawns = params.has('calm');
    this.hud = new RunHud(this, this.run);

    this.player.onFire = (_x, _y, dx, dy) => {
      const m = this.view.muzzle();
      this.arrows.fire(m.x, m.y, dx, dy);
      this.view.onFire();
    };
    this.player.onDashStart = () => this.view.onDashStart();
    this.player.onTeleport = (x0, y0, x1, y1, t) => this.view.onTeleport(x0, y0, x1, y1, t);
    this.player.onTeleportArrive = (x, y) => this.view.onTeleportArrive(x, y);
    this.arrows.onHit = (target, damage, ax, ay, dx, dy) => {
      // Knockback pushes away from a point just behind the hit, so along the arrow's flight.
      if (target === this.wolf) this.wolf.damage(damage);
      else this.shades.damage(target, damage, ax - dx, ay - dy);
      const s = toScreen(ax, ay);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, damage);
      this.fx.addShake(camera.shakeOnHit);
    };
    this.shades.onRisen = (s) => this.shadesView.onRisen(s);
    this.shades.onKilled = (x, y) => {
      if (this.run.state === 'fighting') {
        this.run.kills++;
        this.earn(tree.shardsPerKill);
      }
      this.shadesView.onKilled(x, y);
      this.fx.addShake(run.killShake);
      this.freeze(run.killHitStop);
    };
    this.wolf.onRisen = () => this.wolfView.onRisen();
    this.wolf.onSlam = () => this.onSlam();
    this.wolf.onLand = () => this.wolfView.onLand();
    this.wolf.onKilled = (x, y) => this.onWolfKilled(x, y);
    this.run.spawnPoint = () => this.spawnPoint();

    this.startRun();

    DevMenu.get().setActions([
      { label: 'Restart run', run: () => this.startRun() },
      { label: 'Spawn a Shade', run: () => this.run.spawn() },
      { label: 'Skip 15s', run: () => (this.run.time += 15) },
      { label: 'Spawn werewolf', run: () => this.spawnWolf() },
      { label: 'Kill werewolf', run: () => this.wolf.damage(this.wolf.hp) },
      { label: 'Kill all Shades', run: () => [...this.shades.list].forEach((s) => this.shades.kill(s)) },
      { label: 'Hold spawns', run: () => (this.run.holdSpawns = !this.run.holdSpawns) },
      { label: 'Pause', run: () => (this.paused = !this.paused) },
      { label: 'Step', run: () => { this.paused = true; this.stepsQueued++; } },
      { label: 'Open tree', run: () => this.openTree() },
      { label: '+50 shards', run: () => addShards(50) },
      { label: 'Reset tree (refund)', run: () => resetTree(true) },
      { label: 'Reset tree and shards', run: () => { resetTree(false); save.shards = 0; addShards(0); } },
      { label: 'Max tree', run: () => maxTree() },
      { label: 'Toggle hitboxes', run: () => (this.showHitboxes = !this.showHitboxes) },
      { label: `Next map (${map.name})`, run: () => this.nextMap() },
      { label: 'Asset maker', run: () => window.open('asset-maker.html', 'swimply-asset-maker') },
      { label: 'Level editor', run: () => window.open(`level-editor.html?map=${this.mapId}`, 'swimply-level-editor') },
    ]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input2.destroy();
      this.scene.stop('tree');
    });
  }

  private nextMap(): void {
    const all = maps.list();
    const next = all[(all.indexOf(this.map) + 1) % all.length];
    this.scene.restart({ map: next.id });
  }

  // The tree screen. After a death, closing it starts the next run; opened mid-run from the dev menu, the run is
  // paused under it and carries on.
  private openTree(): void {
    if (this.treeOpen) return;
    this.treeOpen = true;
    this.hud.treeOpen = true;
    const dead = this.run.state === 'dead';
    const r = this.run;
    if (!dead) this.paused = true;
    const data: TreeSceneData = {
      summary: dead ? `YOU DIED   ${clock(r.time)}, ${r.kills} kills, +${r.shards} shards` : 'MEMORIES',
      closeLabel: dead ? 'Next run' : 'Back',
      onClose: () => this.closeTree(),
    };
    this.scene.launch('tree', data);
  }

  private closeTree(): void {
    if (!this.treeOpen) return;
    this.treeOpen = false;
    this.hud.treeOpen = false;
    this.scene.stop('tree');
    // Clicks on the tree screen also reached the game's input; drop them so they don't fire an arrow.
    this.input2.endFrame();
    if (this.run.state === 'dead') this.startRun();
    else this.paused = false;
  }

  private spawnWolf(): void {
    this.wolfCame = true;
    const p = this.spawnPoint();
    this.wolf.spawn(p.x, p.y);
    this.hud.announce('THE WEREWOLF COMES');
    // Part of what reveals Time Warp on the tree.
    if (!save.flags.werewolfSeen) {
      save.flags.werewolfSeen = true;
      writeSave();
    }
  }

  private onSlam(): void {
    this.wolfView.onSlam();
  }

  // The werewolf's attacks: the dash hurts along his path as he passes and at the far end where he slams; the
  // jump hurts the landing circle.
  private checkWolfAttack(): void {
    const p = this.player;
    const w = this.wolf;
    const r = cfgPlayer.hitRadius;
    const hit = w.inDash(p.x, p.y, r) || (w.slammed && w.inSlam(p.x, p.y, r)) || (w.landed && w.inLanding(p.x, p.y, r));
    if (!hit || this.run.state !== 'fighting' || (p.safe && !werewolf.slamPiercesInvuln)) return;
    // Counted even in god mode, so his attack choice can be tested.
    w.struck = true;
    if (!sim.godMode) this.die();
  }

  // Freezes the sim briefly so a kill lands. Kills in quick succession share one freeze unless `force`.
  private freeze(seconds: number, force = false): void {
    if (seconds <= 0 || (!force && this.hitStop <= 0 && this.sinceHitStop < run.hitStopGap)) return;
    if (this.hitStop <= 0) this.sinceHitStop = 0;
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  // Banks shards for a kill, after the tree's shard bonus.
  private earn(base: number): void {
    const n = Math.round(base * stats.shardGain());
    this.run.shards += n;
    addShards(n);
  }

  private onWolfKilled(x: number, y: number): void {
    this.wolfView.onKilled(x, y);
    if (this.run.state !== 'fighting') return;
    this.earn(werewolf.shards);
    this.freeze(0.15, true);
    // Winning the Mindscape needs the full tree too. What happens next (the hub, teleport) comes later.
    if (treeComplete()) {
      save.flags.mindscapeCleared = true;
      addShards(0);
      this.hud.announce('THE MINDSCAPE IS CLEARED');
    } else {
      this.hud.announce('THE WEREWOLF FALLS');
    }
  }

  private startRun(): void {
    this.shades.clear();
    this.shadesView.clear();
    this.wolf.clear();
    this.wolfView.clear();
    this.wolfCame = false;
    this.arrows.clear();
    // Where the address says, else the map's player start marker, else the middle of the map.
    const at = params.get('at')?.split(',').map(Number);
    const start = at?.length === 2 && at.every(Number.isFinite) ? { x: at[0], y: at[1] }
      : findMarker(this.map, 'playerStart') ?? { x: this.world.width / 2, y: this.world.height / 2 };
    this.player.reset(start.x, start.y);
    this.view.setVisible(true);
    this.run.reset();
    this.hitStop = 0;
    this.acc = 0;
    const s = toScreen(this.player.x, this.player.y);
    this.camCenter = { x: s.x, y: s.y };
  }

  // A random spot inside one of the map's Shade spawn zones, or along its edge if it has none, far enough from the
  // player and clear of anything solid.
  private spawnPoint(): Vec2 {
    const m = shade.radius * 1.5;
    const w = this.world.width - m;
    const h = this.world.height - m;
    const zones = this.map.objects.filter((o) => o.asset.marker === 'shadeSpawn');
    const p = { x: 0, y: 0, radius: shade.radius };
    let best = { x: 0, y: 0 };
    let bestDist = -1;
    for (let i = 0; i < 12; i++) {
      if (zones.length) {
        const z = zones[Math.floor(Math.random() * zones.length)];
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * run.spawnZoneRadius * z.size;
        p.x = z.x + Math.cos(a) * r;
        p.y = z.y + Math.sin(a) * r;
      } else {
        const side = Math.floor(Math.random() * 4);
        const along = Math.random();
        p.x = side < 2 ? m + along * (w - m) : side === 2 ? m : w;
        p.y = side < 2 ? (side === 0 ? m : h) : m + along * (h - m);
      }
      this.world.resolve(p);
      const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
      if (d > bestDist) {
        best = { x: p.x, y: p.y };
        bestDist = d;
      }
      if (d >= run.minSpawnDistance) break;
    }
    return best;
  }

  update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, 0.25);
    const input = this.input2;
    const cam = this.cameras.main;
    input.update();
    // Checked here, not in step(), because the sim does not step while the tree pauses a run.
    if (this.treeOpen && input.justPressed('dash')) this.closeTree();
    this.mapView.render();
    this.aim = input.aim ? toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y + render.aimHeight) : null;

    // Fixed time step: real time is banked, then spent in equal steps. A kill's hit-stop and the dev pause
    // simply stop banking, so the sim freezes while drawing carries on.
    const step = 1 / Math.max(sim.stepRate, 1);
    this.sinceHitStop += frameDt;
    if (this.hitStop > 0) this.hitStop -= frameDt;
    else if (!this.paused) this.acc += frameDt * sim.timeScale;
    if (this.paused && this.stepsQueued > 0) {
      this.acc = step * this.stepsQueued;
      this.stepsQueued = 0;
    }
    let steps = 0;
    while (this.acc >= step && steps < sim.maxStepsPerFrame) {
      this.step(step);
      // A press is acted on in the first step that sees it. With no step this frame it waits for the next one.
      input.endFrame();
      this.acc -= step;
      steps++;
    }
    // Too far behind (a slow frame or a background tab): drop the backlog rather than fast-forward.
    if (this.acc >= step) this.acc = 0;
    const simDt = steps * step;

    if (this.run.state === 'fighting') this.view.update(simDt);
    this.fx.update(frameDt * (this.paused ? 0 : sim.timeScale));

    // The camera follows the player's projected position, with screen shake on top.
    const s = toScreen(this.player.x, this.player.y);
    const follow = 1 - Math.exp(-camera.followRate * frameDt);
    this.camCenter.x += (s.x - this.camCenter.x) * follow;
    this.camCenter.y += (s.y - this.camCenter.y) * follow;
    cam.scrollX = this.camCenter.x - cam.width / 2 + this.fx.shakeOffset.x;
    cam.scrollY = this.camCenter.y - cam.height / 2 + this.fx.shakeOffset.y;

    this.arrowsView.render();
    this.shadesView.render(this.player.x, this.player.y);
    this.wolfView.render(frameDt, cam.width);
    const notes = [this.showHitboxes && this.wolf.present && `WEREWOLF ${this.wolf.state.toUpperCase()}`, this.paused && 'PAUSED', this.run.holdSpawns && 'SPAWNS HELD', sim.godMode && 'GOD MODE'].filter(Boolean);
    this.hud.update(frameDt, cam.width, cam.height, notes.join('   '));
    this.drawDebug();
  }

  // One fixed step of the whole simulation, in the order things happen.
  private step(dt: number): void {
    const r = this.run;
    if (!this.treeOpen && r.state === 'dead' && r.canRestart) this.openTree();
    if (r.state === 'fighting') this.player.update(dt, this.input2, this.aim);
    r.update(dt);
    if (r.state === 'fighting' && !this.wolfCame && !r.holdSpawns && r.time >= werewolf.arriveTime) this.spawnWolf();
    this.nav.setGoal(this.player.x, this.player.y);
    this.shades.update(dt, this.world, this.nav);
    this.wolf.update(dt, this.world, this.nav, this.player);
    this.checkWolfAttack();
    this.targets.length = 0;
    this.targets.push(...this.shades.list);
    if (this.wolf.alive && !this.wolf.airborne) this.targets.push(this.wolf);
    this.arrows.update(dt, this.targets, this.world);
    if (r.state === 'fighting' && !this.player.safe && !sim.godMode) {
      const { x, y } = this.player;
      if (this.shades.touching(x, y, cfgPlayer.hitRadius) || this.wolf.touching(x, y, cfgPlayer.hitRadius) || this.world.onHurtingFloor(x, y)) this.die();
    }
  }

  private die(): void {
    this.run.die();
    this.view.setVisible(false);
    const px = render.pixelScale;
    const s = toScreen(this.player.x, this.player.y);
    this.fx.smoke(s.x, s.y - 10 * px, run.deathSmoke, 8 * px);
    this.fx.particle({ x: s.x, y: s.y - 10 * px, life: 0.3, from: 3, to: 0, tint: 0xffe0b0 });
    this.fx.addShake(run.deathShake);
  }

  // Dev aid: circles and boxes for what actually collides, drawn flat on the ground, and the map's markers.
  private drawDebug(): void {
    const g = this.debug;
    g.clear();
    if (!this.showHitboxes) return;
    const ring = (x: number, y: number, r: number, color: number) => {
      const s = toScreen(x, y);
      const e = { x: r * render.isoScale * Math.SQRT2, y: r * render.isoScale * Math.SQRT1_2 };
      g.lineStyle(1, color, 1).strokeEllipse(s.x, s.y, e.x * 2, e.y * 2);
    };
    ring(this.player.x, this.player.y, cfgPlayer.bodyRadius, 0x66ccff);
    ring(this.player.x, this.player.y, cfgPlayer.hitRadius, 0xff4466);
    for (const s of this.shades.list) {
      if (!s.alive) continue;
      ring(s.x, s.y, s.radius, 0xffcc44);
      ring(s.x, s.y, s.radius * shade.contactScale, 0xff4466);
      // Which way it is trying to walk.
      const a = toScreen(s.x, s.y);
      const b = toScreen(s.x + s.vx * 0.25, s.y + s.vy * 0.25);
      g.lineStyle(1, 0xffcc44, 1).lineBetween(a.x, a.y, b.x, b.y);
    }
    if (this.wolf.alive) {
      ring(this.wolf.x, this.wolf.y, this.wolf.radius, 0xffcc44);
      ring(this.wolf.x, this.wolf.y, this.wolf.radius * werewolf.contactScale, 0xff4466);
    }
    for (const c of this.world.circles) ring(c.x, c.y, c.radius, 0x66ffaa);
    for (const b of this.world.floorBoxes) {
      g.lineStyle(1, 0x66ffaa, 0.8).strokePoints([toScreen(b.x0, b.y0), toScreen(b.x1, b.y0), toScreen(b.x1, b.y1), toScreen(b.x0, b.y1)], true);
    }
    for (const o of this.map.objects) {
      if (!o.asset.marker) continue;
      ring(o.x, o.y, 12, 0xf2d7a6);
      if (o.asset.marker === 'shadeSpawn') ring(o.x, o.y, run.spawnZoneRadius * o.size, 0xf2d7a6);
      const s = toScreen(o.x, o.y);
      g.lineStyle(1, 0xf2d7a6, 1).lineBetween(s.x - 6, s.y, s.x + 6, s.y).lineBetween(s.x, s.y - 6, s.x, s.y + 6);
    }
    for (const a of this.arrows.pool.items) if (a.active) ring(a.x, a.y, a.hitRadius, 0xa060ff);
  }
}
