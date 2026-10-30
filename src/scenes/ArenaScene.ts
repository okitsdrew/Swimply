import Phaser from 'phaser';
import { arena } from '../config/arena';
import { player as cfgPlayer } from '../config/character';
import { camera } from '../config/feel';
import { render } from '../config/render';
import { run } from '../config/run';
import { shade } from '../config/shade';
import { sim } from '../config/sim';
import { Input, KeyboardMouseSource } from '../core/input';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { DevMenu } from '../dev/DevMenu';
import { ArrowsView } from '../render/ArrowsView';
import { makeArt } from '../render/art';
import { Fx } from '../render/Fx';
import { PlayerView } from '../render/PlayerView';
import { RunHud } from '../render/RunHud';
import { ShadesView } from '../render/ShadesView';
import { Arrows } from '../sim/Arrows';
import { Player } from '../sim/Player';
import { Run } from '../sim/Run';
import { Shades } from '../sim/Shades';
import { ArenaWorld } from '../sim/World';

const COLORS = [0x17151d, 0x19161f, 0x1b1822, 0x15131a];
const PILLAR = 0x2b2638;
const PILLAR_TOP = 0x3a3350;

// Phase 2: a plain square arena with a ring of pillars, endless waves of Shades, death and restart.
// The sim runs on a fixed time step here; drawing runs once per screen frame.
export class ArenaScene extends Phaser.Scene {
  private input2!: Input;
  private world = new ArenaWorld();
  private player!: Player;
  private view!: PlayerView;
  private fx!: Fx;
  private arrows!: Arrows;
  private arrowsView!: ArrowsView;
  private shades!: Shades;
  private shadesView!: ShadesView;
  private run!: Run;
  private hud!: RunHud;
  private floor!: Phaser.GameObjects.Graphics;
  private debug!: Phaser.GameObjects.Graphics;
  private showHitboxes = false;
  private lastLayoutKey = '';
  private camCenter = { x: 0, y: 0 };
  private p = [toScreen(0, 0), toScreen(0, 0), toScreen(0, 0), toScreen(0, 0)];
  // Sim time owed to the fixed step, carried between frames.
  private acc = 0;
  private hitStop = 0;
  private paused = false;
  private stepsQueued = 0;
  private aim: Vec2 | null = null;

  constructor() {
    super('arena');
  }

  create(): void {
    makeArt(this);
    this.cameras.main.setBackgroundColor(0x0b0a10);
    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.fx = new Fx(this);
    this.floor = this.add.graphics().setDepth(-1e9);
    this.debug = this.add.graphics().setDepth(1e7);
    this.syncLayout();

    this.player = new Player(this.world);
    this.view = new PlayerView(this, this.player, this.fx);
    this.arrows = new Arrows();
    this.arrowsView = new ArrowsView(this, this.arrows, this.fx);
    this.shades = new Shades();
    this.shadesView = new ShadesView(this, this.shades, this.fx);
    this.run = new Run(this.shades);
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
    ]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
  }

  private get half(): number {
    return (arena.roomTiles * render.tileSize) / 2;
  }

  private startRun(): void {
    this.shades.clear();
    this.shadesView.clear();
    this.arrows.clear();
    this.player.reset(0, this.half * 0.5);
    this.view.setVisible(true);
    this.run.reset();
    this.hitStop = 0;
    this.acc = 0;
    const s = toScreen(this.player.x, this.player.y);
    this.camCenter = { x: s.x, y: s.y };
  }

  // A random spot along the room's edge, far enough from the player and clear of pillars.
  private spawnPoint(): Vec2 {
    const h = this.half - shade.radius * 1.5;
    const p = { x: 0, y: 0, radius: shade.radius };
    let best = { x: 0, y: 0 };
    let bestDist = -1;
    for (let i = 0; i < 12; i++) {
      const along = (Math.random() * 2 - 1) * h;
      const side = Math.floor(Math.random() * 4);
      p.x = side < 2 ? along : side === 2 ? -h : h;
      p.y = side < 2 ? (side === 0 ? -h : h) : along;
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
    this.syncLayout();
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
    this.shades.update(dt, this.player.x, this.player.y, this.world);
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

  // Rebuilds the pillars and redraws the floor when the arena's layout values change in the dev menu.
  private syncLayout(): void {
    const key = `${arena.roomTiles},${arena.pillars},${arena.pillarRing},${arena.pillarRadius},${render.tileSize},${render.isoScale}`;
    if (key === this.lastLayoutKey) return;
    this.lastLayoutKey = key;
    const w = this.world;
    w.half = this.half;
    w.pillars.length = 0;
    const n = Math.round(arena.pillars);
    for (let i = 0; i < n; i++) {
      const angle = Math.PI / 4 + (i / n) * Math.PI * 2;
      w.pillars.push({ x: Math.cos(angle) * arena.pillarRing, y: Math.sin(angle) * arena.pillarRing, radius: arena.pillarRadius });
    }
    this.drawFloor();
  }

  private drawFloor(): void {
    const t = render.tileSize;
    const tiles = Math.round(arena.roomTiles);
    const g = this.floor;
    g.clear();
    const o = -this.half;
    for (let x = 0; x < tiles; x++) {
      for (let y = 0; y < tiles; y++) {
        toScreen(o + x * t, o + y * t, this.p[0]);
        toScreen(o + (x + 1) * t, o + y * t, this.p[1]);
        toScreen(o + (x + 1) * t, o + (y + 1) * t, this.p[2]);
        toScreen(o + x * t, o + (y + 1) * t, this.p[3]);
        g.fillStyle(COLORS[(x * 7 + y * 13) % COLORS.length], 1).fillPoints(this.p, true);
      }
    }
    const h = this.half;
    g.lineStyle(3, 0x3a3350, 1).strokePoints([toScreen(-h, -h), toScreen(h, -h), toScreen(h, h), toScreen(-h, h)], true);
    // Pillars are low stumps drawn into the floor for now, so they never cover a sprite. Real art comes with the
    // asset maker.
    const lift = 8 * render.pixelScale;
    for (const pl of this.world.pillars) {
      const s = toScreen(pl.x, pl.y);
      const e = { x: pl.radius * render.isoScale * Math.SQRT2, y: pl.radius * render.isoScale * Math.SQRT1_2 };
      g.fillStyle(PILLAR, 1).fillEllipse(s.x, s.y, e.x * 2, e.y * 2);
      g.fillRect(s.x - e.x, s.y - lift, e.x * 2, lift);
      g.fillStyle(PILLAR_TOP, 1).fillEllipse(s.x, s.y - lift, e.x * 2, e.y * 2);
    }
  }

  // Dev aid: circles for what actually collides, drawn flat on the ground.
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
    }
    for (const pl of this.world.pillars) ring(pl.x, pl.y, pl.radius, 0x66ffaa);
    for (const a of this.arrows.pool.items) if (a.active) ring(a.x, a.y, a.hitRadius, 0xa060ff);
  }
}
