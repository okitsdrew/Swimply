import Phaser from 'phaser';
import { kate as cfg, kateFireballs, kateLook as look } from '../config/kate';
import { render } from '../config/render';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { vestiges, vestigeTexture } from '../data/vestiges';
import { Kate } from '../sim/Kate';
import { Kates } from '../sim/Kates';
import { KATE_PAN, kateDashFrames, kateSwingFrames, kateWalkFrames, Tex } from './art';
import { solveArm } from './armMath';
import { BossBar } from './BossBar';
import { EnemyView, ViewFrame } from './enemies';
import { FireballsView } from './FireballsView';
import { Fx } from './Fx';

const DEG = Math.PI / 180;
const screen = { x: 0, y: 0 };
const dir = { x: 0, y: 0 };
const spot = { x: 0, y: 0 };

// One pose of her hands: the grip, the left shoulder (the right one is a span further) and the shoulders' height.
interface Pose {
  gx: number;
  gy: number;
  sx: number;
  sy: number;
  span: number;
}

const key = (n: 1 | 2 | 3 | 4): Pose => {
  const [gx, gy, sx] = {
    1: [look.grip1X, look.grip1Y, look.shoulders1X],
    2: [look.grip2X, look.grip2Y, look.shoulders2X],
    3: [look.grip3X, look.grip3Y, look.shoulders3X],
    4: [look.grip4X, look.grip4Y, look.shoulders4X],
  }[n];
  return { gx, gy, sx, sy: n === 4 ? look.restShoulderY : look.shoulderY, span: look.shoulderSpan };
};

const blend = (a: Pose, b: Pose, k: number): Pose => ({
  gx: a.gx + (b.gx - a.gx) * k,
  gy: a.gy + (b.gy - a.gy) * k,
  sx: a.sx + (b.sx - a.sx) * k,
  sy: a.sy + (b.sy - a.sy) * k,
  span: a.span + (b.span - a.span) * k,
});

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

// Draws Kate: her body frames, her code-drawn arms holding the pan (turned round her, behind her when it points
// away), the swing's trail, the fire butterfly circling her (in front of her for a slap), her fireballs and the
// boss bar.
//   walk: kate_0-3 (kate_0 standing), pan over her shoulder   dash, hop: kate_dash_1-6, the pan trailing
//   windup: kate_attack_1   swing: 2, then 3 past its middle   follow: 3   recover: 4
export class KateView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private arms: Phaser.GameObjects.Graphics;
  private pan: Phaser.GameObjects.Image;
  private ground: Phaser.GameObjects.Graphics;
  private trail: Phaser.GameObjects.Graphics;
  private fly: Phaser.GameObjects.Image;
  private flyGlow: Phaser.GameObjects.Image;
  private flyFrames: string[];
  private bar: BossBar;
  private fireballs: FireballsView;
  private age = 0;
  private walkTime = 0;
  private emberTimer = 0;
  // Where the butterfly is in the world and how high (art pixels), easing to where it should be.
  private flyAt = { x: 0, y: 0, h: 0, placed: false };

  constructor(scene: Phaser.Scene, private kate: Kate, private fx: Fx) {
    this.sprite = scene.add.image(0, 0, kateWalkFrames[0]).setOrigin(0.5, 1).setVisible(false);
    this.shadow = scene.add.image(0, 0, Tex.shadow).setVisible(false);
    this.arms = scene.add.graphics();
    const pan = scene.textures.getFrame(KATE_PAN);
    this.pan = scene.add.image(0, 0, KATE_PAN).setVisible(false);
    this.pan.setData('w', pan?.width ?? 78).setData('h', pan?.height ?? 42);
    this.ground = scene.add.graphics().setDepth(-5e7 + 1);
    this.trail = scene.add.graphics();
    this.fly = scene.add.image(0, 0, vestigeTexture('flame_torrent')).setVisible(false);
    this.flyGlow = scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    const base = vestigeTexture('flame_torrent');
    const frames = [base];
    for (let n = 1; scene.textures.exists(`${base}_${n}`); n++) frames.push(`${base}_${n}`);
    this.flyFrames = frames.concat(frames.slice(1, -1).reverse());
    this.bar = new BossBar(scene, 'KATE LAMITY');
    this.fireballs = new FireballsView(scene, kate.fireballs, fx, kateFireballs);
  }

  onRisen(): void {
    toScreen(this.kate.x, this.kate.y, screen);
    this.fx.smoke(screen.x, screen.y - 10 * render.pixelScale, 16, 20);
  }

  onSwing(): void {
    if (this.kate.move === 'strike') this.fx.addShake(2);
  }

  onSlap(): void {
    this.fly.getCenter(spot);
    this.fx.burst(spot.x, spot.y);
    this.fx.addShake(3);
  }

  onKilled(x: number, y: number): void {
    const px = render.pixelScale;
    toScreen(x, y, screen);
    this.fx.smoke(screen.x, screen.y - 20 * px, cfg.deathSmoke, 16 * px);
    this.fx.particle({ x: screen.x, y: screen.y - 20 * px, life: 0.3, from: 4, to: 0, tint: 0xffe0b0, depth: screen.y + 2 });
    this.fx.addShake(cfg.deathShake);
  }

  destroy(): void {
    for (const o of [this.sprite, this.shadow, this.arms, this.pan, this.ground, this.trail, this.fly, this.flyGlow]) o.destroy();
    this.bar.destroy();
    this.fireballs.destroy();
  }

  render(dt: number, simDt: number, width: number): void {
    const k = this.kate;
    this.age += dt;
    this.fireballs.update(simDt);
    this.bar.draw(width, k.alive && k.state !== 'idle', k.hp / cfg.hp);
    const g = this.ground.clear();
    this.trail.clear();
    this.arms.clear();
    const shown = k.present && k.state !== 'rising';
    for (const o of [this.sprite, this.shadow, this.pan, this.fly, this.flyGlow]) o.setVisible(shown);
    if (!k.present) return;
    toScreen(k.x, k.y, screen);
    if (k.state === 'rising') {
      const t = Math.min(1, k.time / Math.max(cfg.spawnTell, 1e-4));
      const half = ellipseHalfSize(k.radius * (3 - 2 * t));
      const core = ellipseHalfSize(k.radius * t * 1.2);
      g.lineStyle(3, 0xff8a1a, 0.4 + 0.6 * t).strokeEllipse(screen.x, screen.y, half.x * 2, half.y * 2);
      g.fillStyle(0x1a0800, 0.4 + 0.5 * t).fillEllipse(screen.x, screen.y, core.x * 2, core.y * 2);
      return;
    }

    const px = render.pixelScale * cfg.scale;
    const swinging = k.state === 'windup' || k.state === 'swing' || k.state === 'follow' || k.state === 'recover';
    let frame = kateWalkFrames[0];
    let flip = false;
    let pose = key(4);
    let angle = cfg.restAngle;
    let turn = 0;
    if (k.state === 'walk') {
      this.walkTime += dt;
      frame = kateWalkFrames[Math.floor(this.walkTime * cfg.walkFps) % kateWalkFrames.length];
    } else if (k.state === 'strikeDash' || k.state === 'hop') {
      frame = kateDashFrames[Math.floor(k.time * cfg.dashFps) % kateDashFrames.length];
      flip = k.facing < 0;
      const f = flip ? -1 : 1;
      pose = { gx: look.dashGripX * f, gy: look.dashGripY, sx: flip ? -look.dashShoulderX - look.dashShoulderSpan : look.dashShoulderX, sy: look.dashShoulderY, span: look.dashShoulderSpan };
      angle = flip ? 180 - look.dashAngle : look.dashAngle;
    } else if (swinging) {
      angle = k.panAngle;
      turn = k.turn;
      if (k.state === 'windup') {
        frame = kateSwingFrames[0];
        const time = k.move === 'slap' ? cfg.gatherTime : cfg.windupTime;
        pose = blend(key(4), key(1), clamp01(k.time / Math.max(time * cfg.windupRaise, 1e-3)));
      } else if (k.state === 'swing') {
        // Through the middle, from the windup's hands to the middle's, then on to the follow-through's.
        const u = clamp01((k.panAngle - cfg.windAngle) / (cfg.followAngle - cfg.windAngle || 1));
        const mid = clamp01((cfg.midAngle - cfg.windAngle) / (cfg.followAngle - cfg.windAngle || 1));
        frame = u < mid ? kateSwingFrames[1] : kateSwingFrames[2];
        pose = u < mid ? blend(key(1), key(2), u / (mid || 1)) : blend(key(2), key(3), (u - mid) / (1 - mid || 1));
        this.drawTrail(k, screen.x, screen.y, px, pose);
      } else if (k.state === 'follow') {
        frame = kateSwingFrames[2];
        pose = key(3);
      } else {
        frame = kateSwingFrames[3];
        const t = clamp01(k.time / Math.max(cfg.recoverTime, 1e-3));
        pose = blend(key(3), key(4), t);
        turn = k.turn * (1 - t);
      }
    }

    const depth = screen.y;
    this.sprite.setTexture(frame).setPosition(screen.x, screen.y).setScale(px).setFlipX(flip).setDepth(depth);
    if (k.flash > 0) this.sprite.setTintFill(0xffffff);
    else this.sprite.clearTint();
    this.shadow.setPosition(screen.x, screen.y).setScale(px * 1.2, px * 0.45).setDepth(depth - 1000);

    // The pan from her grip: turned round her as a circle on the ground seen on screen, shorter toward the camera.
    const grip = { x: screen.x + pose.gx * px, y: screen.y + pose.gy * px };
    const a = (angle + turn) * DEG;
    const reach = cfg.panReach * cfg.scale;
    dir.x = Math.cos(a) * reach;
    dir.y = 0.5 * Math.sin(a) * reach;
    const len = Math.hypot(dir.x, dir.y) || 1;
    const pw = this.pan.getData('w') as number;
    const ph = this.pan.getData('h') as number;
    const along = Math.max(1, pw - look.panHandleX);
    this.pan
      .setPosition(grip.x, grip.y)
      .setOrigin(look.panHandleX / pw, look.panHandleY / ph)
      .setRotation(Math.atan2(dir.y, dir.x))
      .setScale(Math.max(0.18 * (reach / along), len / along), (reach / along) * look.panThickness)
      .setDepth(Math.sin(a) < 0 ? depth - 0.5 : depth + 0.5)
      .setAlpha(1);
    if (k.flash > 0) this.pan.setTintFill(0xffffff);
    else this.pan.clearTint();

    // Both hands on the handle, the second one further along it.
    const ux = dir.x / len;
    const uy = dir.y / len;
    const hands = [grip, { x: grip.x + ux * look.handGap * px, y: grip.y + uy * look.handGap * px }];
    const shoulders = [
      { x: screen.x + pose.sx * px, y: screen.y + pose.sy * px },
      { x: screen.x + (pose.sx + pose.span) * px, y: screen.y + pose.sy * px },
    ];
    // The nearer hand to each shoulder.
    const swap = Math.hypot(hands[0].x - shoulders[0].x, hands[0].y - shoulders[0].y) > Math.hypot(hands[1].x - shoulders[0].x, hands[1].y - shoulders[0].y);
    const arms = shoulders.map((s, i) => solveArm(s, hands[swap ? 1 - i : i], look.armLength * px));
    const ag = this.arms.setDepth(depth + 0.3);
    for (const [w, color] of [
      [(look.sleeveWidth + look.sleeveEdge * 2) * px, look.sleeveEdgeColor],
      [look.sleeveWidth * px, look.sleeveColor],
    ] as const) {
      if (w <= 0) continue;
      ag.lineStyle(w, color, 1);
      for (const arm of arms) {
        ag.beginPath();
        ag.moveTo(arm.shoulder.x, arm.shoulder.y);
        ag.lineTo(arm.elbow.x, arm.elbow.y);
        ag.lineTo(arm.hand.x, arm.hand.y);
        ag.strokePath();
      }
    }
    ag.fillStyle(look.handColor, 1);
    for (const arm of arms) ag.fillCircle(arm.hand.x, arm.hand.y, look.handSize * px);

    this.drawButterfly(k, dt);
  }

  // A pale fan behind the pan, from where the swing started to where the pan is now.
  private drawTrail(k: Kate, x: number, y: number, px: number, pose: Pose): void {
    if (look.trailAlpha <= 0) return;
    const gx = x + pose.gx * px;
    const gy = y + pose.gy * px;
    const reach = cfg.panReach * cfg.scale * 0.92;
    const t = this.trail.setDepth(y + 0.4);
    const step = cfg.followAngle < cfg.windAngle ? -6 : 6;
    t.fillStyle(0xfff0c8, look.trailAlpha * 0.45);
    t.lineStyle(1.5 * px, 0xfffae6, look.trailAlpha);
    t.beginPath();
    t.moveTo(gx, gy);
    for (let a = cfg.windAngle; step < 0 ? a >= k.panAngle : a <= k.panAngle; a += step) {
      const r = (a + k.turn) * DEG;
      t.lineTo(gx + Math.cos(r) * reach, gy + 0.5 * Math.sin(r) * reach);
    }
    t.closePath();
    t.fillPath();
    t.strokePath();
  }

  // The butterfly circles her, flapping with a glow and embers, and flies to her front for a slap.
  private drawButterfly(k: Kate, dt: number): void {
    const px = render.pixelScale;
    let tx: number;
    let ty: number;
    let th: number;
    if (k.slapping) {
      k.butterfly(spot);
      tx = spot.x;
      ty = spot.y;
      th = look.butterflyHeight * 0.55;
    } else {
      const a = this.age * look.butterflySpin * Math.PI * 2;
      tx = k.x + Math.cos(a) * look.butterflyDistance;
      ty = k.y + Math.sin(a) * look.butterflyDistance;
      th = look.butterflyHeight;
    }
    const f = this.flyAt;
    const m = f.placed ? 1 - Math.exp(-look.butterflyRate * dt) : 1;
    f.x += (tx - f.x) * m;
    f.y += (ty - f.y) * m;
    f.h += (th - f.h) * m;
    f.placed = true;
    const s = toScreen(f.x, f.y);
    const y = s.y - f.h * px * cfg.scale + Math.sin(this.age * 3) * 2 * px;
    const frame = this.flyFrames[Math.floor(this.age / look.butterflyFrameTime) % this.flyFrames.length];
    const color = vestiges.get('flame_torrent')?.color ?? 0xff9a2a;
    const boost = k.slapping ? 2 : 1;
    this.fly.setTexture(frame).setScale(px * look.butterflyScale).setPosition(s.x, y).setDepth(s.y + 0.6);
    this.flyGlow
      .setPosition(s.x, y)
      .setDepth(s.y + 0.5)
      .setTint(color)
      .setScale((look.butterflyGlow * px * look.butterflyScale * boost) / 32)
      .setAlpha(Math.min(1, look.butterflyGlowAlpha * (0.85 + 0.15 * Math.sin(this.age * 9)) * boost));
    this.emberTimer -= dt * look.butterflyEmbers * boost;
    while (this.emberTimer < 0) {
      this.emberTimer += 1;
      const life = 0.5 + Math.random() * 0.4;
      this.fx.particle({ x: s.x + (Math.random() - 0.5) * 10 * px, y: y + (Math.random() - 0.2) * 6 * px, life, from: 0.18, to: 0, tint: Math.random() < 0.6 ? color : 0xffe45a, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 30, depth: s.y + 1 });
    }
  }
}

// One KateView per Kate, made when she first appears and removed when she dies.
export class KatesView implements EnemyView<Kate> {
  private views = new Map<Kate, KateView>();

  constructor(private scene: Phaser.Scene, private kates: Kates, private fx: Fx) {}

  viewOf(k: Kate): KateView {
    let v = this.views.get(k);
    if (!v) this.views.set(k, (v = new KateView(this.scene, k, this.fx)));
    return v;
  }

  onRisen(k: Kate): void {
    this.viewOf(k).onRisen();
  }

  onKilled(x: number, y: number, k: Kate): void {
    this.viewOf(k).onKilled(x, y);
    this.views.get(k)?.destroy();
    this.views.delete(k);
  }

  render(f: ViewFrame): void {
    for (const k of this.kates.list) this.viewOf(k);
    for (const [k, v] of this.views) {
      if (this.kates.list.includes(k)) v.render(f.dt, f.simDt, f.width);
      else {
        v.destroy();
        this.views.delete(k);
      }
    }
  }

  clear(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
  }
}
