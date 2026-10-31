import Phaser from 'phaser';
import { player as cfgPlayer } from '../config/character';
import { camera } from '../config/feel';
import { render } from '../config/render';
import { run } from '../config/run';
import { shade } from '../config/shade';
import { sim } from '../config/sim';
import { Input, KeyboardMouseSource } from '../core/input';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { AreaMap, findMarker, maps } from '../data/maps';
import { DevMenu } from '../dev/DevMenu';
import { ArrowsView } from '../render/ArrowsView';
import { makeArt } from '../render/art';
import { Fx } from '../render/Fx';
import { MapView } from '../render/MapView';
import { PlayerView } from '../render/PlayerView';
import { RunHud } from '../render/RunHud';
import { ShadesView } from '../render/ShadesView';
import { Arrows } from '../sim/Arrows';
import { Player } from '../sim/Player';
import { Run } from '../sim/Run';
import { Shades } from '../sim/Shades';
import { FlowField } from '../sim/Nav';
import { MapWorld } from '../sim/World';

const DEFAULT_MAP = 'arena';

// The page address can pick what to play, which is how the level editor's "play here" opens the game:
//   ?map=water-test   play that map
//   &at=320,640       start there (world units) instead of at the map's player start
//   &calm             waves held from the start, to walk round a map
// The map is kept in the address, so the reload after a tool saves comes back to the same map.
const params = new URLSearchParams(location.search);

// The arena: a map from src/data/maps, endless waves of Shades, death and restart. The sim runs on a fixed time
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
  private run!: Run;
  private hud!: RunHud;
  private debug!: Phaser.GameObjects.Graphics;
  private showHitboxes = false;
  private camCenter = { x: 0, y: 0 };
  // Sim time owed to the fixed step, carried between frames.
  private acc = 0;
  private hitStop = 0;
  private paused = false;
  private stepsQueued = 0;
  private aim: Vec2 | null = null;

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

    makeArt(this);
    this.cameras.main.setBackgroundColor(0x0b0a10);
    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.fx = new Fx(this);
    this.mapView = new MapView(this, map);
    this.debug = this.add.graphics().setDepth(1e7);

    this.player = new Player(this.world);
    this.view = new PlayerView(this, this.player, this.fx);
    this.arrows = new Arrows();
    this.arrowsView = new ArrowsView(this, this.arrows, this.fx);
    this.shades = new Shades();
    this.shadesView = new ShadesView(this, this.shades, this.fx);
    this.run = new Run(this.shades);
    this.run.holdWaves = params.has('calm');
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
      this.shades.damage(target, damage, ax - dx, ay - dy);
      const s = toScreen(ax, ay);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, damage);
      this.fx.addShake(camera.shakeOnHit);
    };
    this.shades.onRisen = (s) => this.shadesView.onRisen(s);
    this.shades.onKilled = (x, y) => {
      if (this.run.state === 'fighting') this.run.kills++;
      this.shadesView.onKilled(x, y);
      this.fx.addShake(run.killShake);
      this.hitStop = Math.max(this.hitStop, run.killHitStop);
    };
    this.run.spawnPoint = () => this.spawnPoint();
    this.run.onWave = (n) => this.hud.announce(`WAVE ${n}`);

    this.startRun();

    DevMenu.get().setActions([
      { label: 'Restart run', run: () => this.startRun() },
      { label: 'Next wave', run: () => this.run.nextWave() },
      { label: 'Spawn a Shade', run: () => { const p = this.spawnPoint(); this.shades.spawn(p.x, p.y); } },
      { label: 'Kill all Shades', run: () => [...this.shades.list].forEach((s) => this.shades.kill(s)) },
      { label: 'Hold waves', run: () => (this.run.holdWaves = !this.run.holdWaves) },
      { label: 'Pause', run: () => (this.paused = !this.paused) },
      { label: 'Step', run: () => { this.paused = true; this.stepsQueued++; } },
      { label: 'Toggle hitboxes', run: () => (this.showHitboxes = !this.showHitboxes) },
      { label: `Next map (${map.name})`, run: () => this.nextMap() },
      { label: 'Asset maker', run: () => window.open('asset-maker.html', 'swimply-asset-maker') },
      { label: 'Level editor', run: () => window.open(`level-editor.html?map=${this.mapId}`, 'swimply-level-editor') },
    ]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
  }

  private nextMap(): void {
    const all = maps.list();
    const next = all[(all.indexOf(this.map) + 1) % all.length];
    this.scene.restart({ map: next.id });
  }

  private startRun(): void {
    this.shades.clear();
    this.shadesView.clear();
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
    this.mapView.render();
    this.aim = input.aim ? toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y + render.aimHeight) : null;

    // Fixed time step: real time is banked, then spent in equal steps. A kill's hit-stop and the dev pause
    // simply stop banking, so the sim freezes while drawing carries on.
    const step = 1 / Math.max(sim.stepRate, 1);
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
    const notes = [this.paused && 'PAUSED', this.run.holdWaves && 'WAVES HELD', sim.godMode && 'GOD MODE'].filter(Boolean);
    this.hud.update(frameDt, cam.width, cam.height, notes.join('   '));
    this.drawDebug();
  }

  // One fixed step of the whole simulation, in the order things happen.
  private step(dt: number): void {
    const r = this.run;
    if (r.state === 'dead' && r.canRestart && (this.input2.justPressed('fire') || this.input2.justPressed('dash'))) {
      this.startRun();
      return;
    }
    if (r.state === 'fighting') this.player.update(dt, this.input2, this.aim);
    r.update(dt);
    this.nav.setGoal(this.player.x, this.player.y);
    this.shades.update(dt, this.world, this.nav);
    this.arrows.update(dt, this.shades.list, this.world);
    if (r.state === 'fighting' && !this.player.safe && !sim.godMode) {
      if (this.shades.touching(this.player.x, this.player.y, cfgPlayer.hitRadius)) this.die();
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
