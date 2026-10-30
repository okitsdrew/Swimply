import Phaser from 'phaser';
import { player as cfgPlayer } from '../config/character';
import { camera } from '../config/feel';
import { render } from '../config/render';
import { Circle, pushOut } from '../core/geometry';
import { Input, KeyboardMouseSource } from '../core/input';
import { toScreen, toWorld } from '../core/iso';
import { DevMenu } from '../dev/DevMenu';
import { ArrowsView } from '../render/ArrowsView';
import { makeArt } from '../render/art';
import { DummiesView } from '../render/DummiesView';
import { Fx } from '../render/Fx';
import { PlayerView } from '../render/PlayerView';
import { Arrows } from '../sim/Arrows';
import { Dummies } from '../sim/Dummies';
import { Player } from '../sim/Player';

// The room is a square of this many tiles; the player cannot leave it.
const ROOM_TILES = 24;
const COLORS = [0x17151d, 0x19161f, 0x1b1822, 0x15131a];

// Phase 1: the character alone in an empty room with a ring of training dummies, to feel movement, dash,
// teleport and the bow. Replaced by the real arena in phase 2.
export class ArenaScene extends Phaser.Scene {
  private input2!: Input;
  private player!: Player;
  private view!: PlayerView;
  private fx!: Fx;
  private arrows!: Arrows;
  private arrowsView!: ArrowsView;
  private dummies!: Dummies;
  private dummiesView!: DummiesView;
  private floor!: Phaser.GameObjects.Graphics;
  private debug!: Phaser.GameObjects.Graphics;
  private showHitboxes = false;
  private lastFloorKey = '';
  private camCenter = { x: 0, y: 0 };
  private p = [toScreen(0, 0), toScreen(0, 0), toScreen(0, 0), toScreen(0, 0)];
  private obstacles: Circle[] = [];

  constructor() {
    super('arena');
  }

  private get half(): number {
    return (ROOM_TILES * render.tileSize) / 2;
  }

  create(): void {
    makeArt(this);
    this.cameras.main.setBackgroundColor(0x0b0a10);
    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.fx = new Fx(this);
    this.floor = this.add.graphics().setDepth(-1e9);
    this.debug = this.add.graphics().setDepth(1e7);

    this.player = new Player();
    this.view = new PlayerView(this, this.player, this.fx);
    this.arrows = new Arrows();
    this.arrowsView = new ArrowsView(this, this.arrows, this.fx);
    this.dummies = new Dummies();
    this.dummiesView = new DummiesView(this, this.dummies);

    this.player.onFire = (_x, _y, dx, dy) => {
      const m = this.view.muzzle();
      this.arrows.fire(m.x, m.y, dx, dy);
      this.view.onFire();
    };
    this.player.onDashStart = () => this.view.onDashStart();
    this.player.onTeleport = (x0, y0, x1, y1, t) => this.view.onTeleport(x0, y0, x1, y1, t);
    this.player.onTeleportArrive = (x, y) => this.view.onTeleportArrive(x, y);
    this.arrows.onHit = (target, damage, ax, ay) => {
      this.dummies.damage(target, damage);
      const s = toScreen(ax, ay);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, damage);
      this.fx.addShake(camera.shakeOnHit);
    };
    this.dummies.onDestroyed = (x, y) => {
      const s = toScreen(x, y);
      this.fx.smoke(s.x, s.y - 10, 8, 16);
    };

    this.dummies.spawnRing(0, 0);
    this.player.x = 0;
    this.player.y = this.half * 0.5;
    const s = toScreen(this.player.x, this.player.y);
    this.camCenter = { x: s.x, y: s.y };

    DevMenu.get().setActions([
      { label: 'Respawn dummies', run: () => { this.dummies.clear(); this.dummies.spawnRing(0, 0); } },
      { label: 'Clear dummies', run: () => this.dummies.clear() },
      { label: 'Toggle hitboxes', run: () => (this.showHitboxes = !this.showHitboxes) },
      { label: 'Reset position', run: () => { this.player.x = 0; this.player.y = this.half * 0.5; } },
    ]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    const cam = this.cameras.main;
    const input = this.input2;
    input.update();

    const aim = input.aim ? toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y + render.aimHeight) : null;
    this.player.obstacles = this.obstacles;
    this.player.update(dt, input, aim);
    const body = { x: this.player.x, y: this.player.y, radius: cfgPlayer.bodyRadius };
    pushOut(body, this.obstacles);
    const h = this.half - body.radius;
    this.player.x = Phaser.Math.Clamp(body.x, -h, h);
    this.player.y = Phaser.Math.Clamp(body.y, -h, h);

    this.dummies.update(dt);
    this.arrows.update(dt, this.dummies.list, this.obstacles);
    this.view.update(dt);
    this.fx.update(dt);

    // The camera follows the player's projected position, with screen shake on top.
    const s = toScreen(this.player.x, this.player.y);
    const follow = 1 - Math.exp(-camera.followRate * dt);
    this.camCenter.x += (s.x - this.camCenter.x) * follow;
    this.camCenter.y += (s.y - this.camCenter.y) * follow;
    cam.scrollX = this.camCenter.x - cam.width / 2 + this.fx.shakeOffset.x;
    cam.scrollY = this.camCenter.y - cam.height / 2 + this.fx.shakeOffset.y;

    this.arrowsView.render();
    this.dummiesView.render();
    this.drawFloor();
    this.drawDebug();
    input.endFrame();
  }

  private drawFloor(): void {
    const t = render.tileSize;
    const key = `${t},${render.isoScale}`;
    if (key === this.lastFloorKey) return;
    this.lastFloorKey = key;
    const g = this.floor;
    g.clear();
    const o = -this.half;
    for (let x = 0; x < ROOM_TILES; x++) {
      for (let y = 0; y < ROOM_TILES; y++) {
        toScreen(o + x * t, o + y * t, this.p[0]);
        toScreen(o + (x + 1) * t, o + y * t, this.p[1]);
        toScreen(o + (x + 1) * t, o + (y + 1) * t, this.p[2]);
        toScreen(o + x * t, o + (y + 1) * t, this.p[3]);
        g.fillStyle(COLORS[(x * 7 + y * 13) % COLORS.length], 1).fillPoints(this.p, true);
      }
    }
    const h = this.half;
    g.lineStyle(3, 0x3a3350, 1).strokePoints([toScreen(-h, -h), toScreen(h, -h), toScreen(h, h), toScreen(-h, h)], true);
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
    for (const d of this.dummies.list) if (d.alive) ring(d.x, d.y, d.radius, 0xffcc44);
    for (const a of this.arrows.pool.items) if (a.active) ring(a.x, a.y, a.hitRadius, 0xa060ff);
  }
}
