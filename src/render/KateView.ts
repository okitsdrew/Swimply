import Phaser from 'phaser';
import { kate as cfg, kateFireballs, kateLook as look } from '../config/kate';
import { render } from '../config/render';
import { ellipseHalfSize, toScreen } from '../core/iso';
import { vestiges, vestigeTexture } from '../data/vestiges';
import { Kate } from '../sim/Kate';
import { Kates } from '../sim/Kates';
import { FIRESPAWN, KATE_PAN, KATE_PAN_RIM, kateDashFrames, kateSwingFrames, kateWalkFrames, Tex } from './art';
import { solveArm } from './armMath';
import { Bark } from './Bark';
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
// away), the swing's trail, the fire butterfly circling her (in front of her for a slap), her fireballs, the
// firespawns and the boss bar.
//   walk: kate_0-3 (kate_0 standing), pan over her shoulder   dash, hop: kate_dash_1-6, the pan trailing
//   windup: kate_attack_1   swing: 2, then 3 past its middle   follow: 3   recover: 4
export class KateView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private arms: Phaser.GameObjects.Graphics;
  private pan: Phaser.GameObjects.Image;
  private panRim: Phaser.GameObjects.Image;
  private ground: Phaser.GameObjects.Graphics;
  private trail: Phaser.GameObjects.Graphics;
  private fly: Phaser.GameObjects.Image;
  private flyGlow: Phaser.GameObjects.Image;
  private flyFrames: string[];
  private bar: BossBar;
  private fireballs: FireballsView;
  private barkBubble: Bark;
  // How she looks standing still (waiting, or beaten), and whether the butterfly is out of her and how grown it is.
  face = 'kate_surprised';
  butterflyOut = true;
  private flyGrow = 1;
  // How far out the pan is: put away (0) while she waits, in her hand (1) otherwise.
  private panOut = 1;
  private spawnImages: { sprite: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }[] = [];
  private age = 0;
  private walkTime = 0;
  private emberTimer = 0;
  // Where the butterfly is in the world and how high (art pixels), easing to where it should be.
  private flyAt = { x: 0, y: 0, h: 0, placed: false };

  constructor(private scene: Phaser.Scene, private kate: Kate, private fx: Fx) {
    this.sprite = scene.add.image(0, 0, kateWalkFrames[0]).setOrigin(0.5, 1).setVisible(false);
    this.shadow = scene.add.image(0, 0, Tex.shadow).setVisible(false);
    this.arms = scene.add.graphics();
    const pan = scene.textures.getFrame(KATE_PAN);
    this.pan = scene.add.image(0, 0, KATE_PAN).setVisible(false);
    this.pan.setData('w', pan?.width ?? 78).setData('h', pan?.height ?? 42);
    this.panRim = scene.add.image(0, 0, KATE_PAN_RIM).setVisible(false);
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
    this.barkBubble = new Bark(scene);
  }

  // The butterfly hides in her, or comes out, growing as it flies to its place.
  setButterfly(on: boolean): void {
    if (on && !this.butterflyOut) this.flyGrow = 0;
    this.butterflyOut = on;
  }

  bark(text: string, color: string, seconds: number): void {
    this.barkBubble.say(text, color, seconds);
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

  onLand(): void {
    const k = this.kate;
    toScreen(k.jx, k.jy, screen);
    this.fx.addShake(cfg.slamShake);
    this.fx.smoke(screen.x, screen.y, 30, cfg.slamRadius * 0.6);
    this.fx.explosion(screen.x, screen.y, cfg.slamRadius, cfg.slamColor);
  }

  onKilled(x: number, y: number): void {
    const px = render.pixelScale;
    toScreen(x, y, screen);
    this.fx.smoke(screen.x, screen.y - 20 * px, cfg.deathSmoke, 16 * px);
    this.fx.particle({ x: screen.x, y: screen.y - 20 * px, life: 0.3, from: 4, to: 0, tint: 0xffe0b0, depth: screen.y + 2 });
    this.fx.addShake(cfg.deathShake);
  }

  destroy(): void {
    for (const o of [this.sprite, this.shadow, this.arms, this.pan, this.panRim, this.ground, this.trail, this.fly, this.flyGlow]) o.destroy();
    for (const s of this.spawnImages) {
      s.sprite.destroy();
      s.shadow.destroy();
    }
    this.bar.destroy();
    this.fireballs.destroy();
    this.barkBubble.destroy();
  }

  render(dt: number, simDt: number, width: number): void {
    const k = this.kate;
    this.age += dt;
    this.fireballs.update(simDt);
    this.bar.draw(width, k.alive && k.state !== 'idle', k.hp / cfg.hp);
    const g = this.ground.clear();
    this.trail.clear();
    this.arms.clear();
    this.panRim.setVisible(false);
    this.drawWaves(g);
    this.drawFirespawns();
    toScreen(k.x, k.y, screen);
    this.barkBubble.update(dt, screen.x, screen.y - 52 * render.pixelScale * cfg.scale - 6);
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
    let frame = k.state === 'idle' || k.dying ? this.face : kateWalkFrames[0];
    let flip = false;
    let pose = key(4);
    let angle = cfg.restAngle;
    const waiting = k.state === 'idle';
    if (waiting) pose = { gx: 0, gy: 0, sx: look.idleShoulderX, sy: look.restShoulderY, span: look.idleShoulderSpan };
    this.panOut = waiting ? 0 : Math.min(1, this.panOut + dt / Math.max(look.panOutTime, 1e-3));
    this.pan.setVisible(this.panOut > 0);
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
    } else if (k.state === 'crouch' || k.state === 'jump' || k.state === 'land') {
      // The Fire Slam: crouched with the pan going up, in the air, then the pan smashed down in front.
      angle = k.panAngle;
      frame = k.state === 'land' ? kateSwingFrames[1] : kateSwingFrames[0];
      pose = k.state === 'land' ? key(2) : key(4);
    } else if (swinging) {
      angle = k.panAngle;
      turn = k.turn;
      if (k.state === 'windup') {
        frame = kateSwingFrames[0];
        const time = k.move === 'strike' ? cfg.windupTime : cfg.gatherTime;
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

    if (k.state === 'jump') {
      // Where she will land: the outline from the moment she leaves the ground, filling as she comes down.
      const t = k.jumpProgress;
      const at = toScreen(k.jx, k.jy);
      const full = ellipseHalfSize(cfg.slamRadius);
      const fill = ellipseHalfSize(cfg.slamRadius * t);
      g.fillStyle(0xff3040, 0.12 + 0.3 * t).fillEllipse(at.x, at.y, fill.x * 2, fill.y * 2);
      g.lineStyle(2, 0xff6070, 0.6 + 0.4 * t).strokeEllipse(at.x, at.y, full.x * 2, full.y * 2);
    }

    // In the air she rises along an arc; her shadow stays on the ground and shrinks.
    const lift = Math.sin(Math.PI * k.jumpProgress) * cfg.slamHeight;
    const depth = screen.y;
    const top = screen.y - lift;
    this.sprite.setTexture(frame).setPosition(screen.x, top).setScale(px).setFlipX(flip).setDepth(depth);
    // Beaten, she flickers until she starts to fade; then she only fades.
    const fade = k.deathAlpha;
    const white = k.flash > 0 || (k.dying && fade >= 1 && Math.floor(this.age * look.deathFlicker) % 2 === 0);
    if (white) this.sprite.setTintFill(0xffffff);
    else this.sprite.clearTint();
    this.sprite.setAlpha(fade);
    this.shadow.setAlpha(fade);
    this.arms.setAlpha(fade);
    const shrink = 1 - 0.5 * (lift / Math.max(cfg.slamHeight, 1));
    this.shadow.setPosition(screen.x, screen.y).setScale(px * 1.2 * shrink, px * 0.45 * shrink).setDepth(depth - 1000);

    // The pan from her grip: turned round her as a circle on the ground seen on screen (shorter toward the camera, as
    // much as panForeshorten says).
    const grip = { x: screen.x + pose.gx * px, y: top + pose.gy * px };
    const a = (angle + turn) * DEG;
    const reach = cfg.panReach * cfg.scale;
    dir.x = Math.cos(a) * reach;
    dir.y = 0.5 * Math.sin(a) * reach;
    const len = Math.hypot(dir.x, dir.y) || 1;
    // Over her arms, except while she swings it away from the camera, when it goes behind her.
    const behind = Math.sin(a) < 0 && (k.state === 'windup' || k.state === 'swing' || k.state === 'follow');
    const pw = this.pan.getData('w') as number;
    const ph = this.pan.getData('h') as number;
    const along = Math.max(1, pw - look.panHandleX);
    this.pan
      .setPosition(grip.x, grip.y)
      .setOrigin(look.panHandleX / pw, look.panHandleY / ph)
      .setRotation(Math.atan2(dir.y, dir.x))
      .setScale((reach / along) * this.panOut * (1 - look.panForeshorten * (1 - Math.max(0.18, len / reach))), (reach / along) * this.panOut * look.panThickness)
      .setDepth(behind ? depth - 0.5 : depth + 0.5)
      .setAlpha(fade);
    if (white) this.pan.setTintFill(0xffffff);
    else this.pan.clearTint();
    this.drawPanFlash(k);

    // Both hands on the handle, the second one further along it.
    const ux = dir.x / len;
    const uy = dir.y / len;
    // Her hands hold the pan's handle, or hang by her sides while she waits.
    const hands = waiting
      ? [
          { x: screen.x + (pose.sx - look.idleHandOut) * px, y: top + look.idleHandY * px },
          { x: screen.x + (pose.sx + pose.span + look.idleHandOut) * px, y: top + look.idleHandY * px },
        ]
      : [grip, { x: grip.x + ux * look.handGap * px, y: grip.y + uy * look.handGap * px }];
    const shoulders = [
      { x: screen.x + pose.sx * px, y: top + pose.sy * px },
      { x: screen.x + (pose.sx + pose.span) * px, y: top + pose.sy * px },
    ];
    // The nearer hand to each shoulder.
    const swap = Math.hypot(hands[0].x - shoulders[0].x, hands[0].y - shoulders[0].y) > Math.hypot(hands[1].x - shoulders[0].x, hands[1].y - shoulders[0].y);
    const arms = shoulders.map((s, i) => solveArm(s, hands[swap ? 1 - i : i], look.armLength * px));
    const ag = this.arms.setDepth(depth + 0.3);
    for (const [w, color] of [
      [(look.sleeveWidth + look.sleeveEdge * 2) * px, white ? 0xffffff : look.sleeveEdgeColor],
      [look.sleeveWidth * px, white ? 0xffffff : look.sleeveColor],
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
    ag.fillStyle(white ? 0xffffff : look.handColor, 1);
    for (const arm of arms) ag.fillCircle(arm.hand.x, arm.hand.y, look.handSize * px);

    this.drawButterfly(k, dt);
  }

  // Each ring of fire (placeholder art): a band of flame on the ground, each piece drawn until it meets its wall, with
  // embers rising off it.
  private drawWaves(g: Phaser.GameObjects.Graphics): void {
    const px = render.pixelScale;
    for (const w of this.kate.waves) {
      const n = w.stops.length;
      const flicker = 0.85 + 0.15 * Math.sin(this.age * 20);
      for (const [width, color, alpha] of [
        [cfg.waveWidth * 0.9, cfg.slamColor, 0.75 * flicker],
        [cfg.waveWidth * 0.4, 0xffe14a, 0.9 * flicker],
      ] as const) {
        g.lineStyle(width, color, alpha);
        for (let i = 0; i < n; i++) {
          if (w.r >= w.stops[i]) continue;
          const a0 = ((i - 0.5) / n) * Math.PI * 2;
          const a1 = ((i + 0.5) / n) * Math.PI * 2;
          const p0 = toScreen(w.x + Math.cos(a0) * w.r, w.y + Math.sin(a0) * w.r);
          const p1 = toScreen(w.x + Math.cos(a1) * w.r, w.y + Math.sin(a1) * w.r);
          g.lineBetween(p0.x, p0.y, p1.x, p1.y);
        }
      }
      for (let e = 0; e < 4; e++) {
        const i = Math.floor(Math.random() * n);
        if (w.r >= w.stops[i]) continue;
        const a = ((i + Math.random() - 0.5) / n) * Math.PI * 2;
        const p = toScreen(w.x + Math.cos(a) * w.r, w.y + Math.sin(a) * w.r);
        this.fx.particle({ texture: Tex.glow, x: p.x, y: p.y, life: 0.3 + Math.random() * 0.3, from: 0.3, to: 0, tint: Math.random() < 0.5 ? cfg.slamColor : 0xffe14a, additive: true, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 40 * px, depth: p.y + 1 });
      }
    }
  }

  // The Pan Strike's warning: the rim of the pan's head, laid exactly over the pan, flashes in the windup's last moments.
  private drawPanFlash(k: Kate): void {
    if (k.state !== 'windup' || k.move !== 'strike') return;
    const left = cfg.windupTime - k.time;
    if (left <= 0 || left >= look.panFlashTime) return;
    this.panRim
      .setVisible(true)
      .setTexture(KATE_PAN_RIM)
      .setPosition(this.pan.x, this.pan.y)
      .setOrigin(this.pan.originX, this.pan.originY)
      .setRotation(this.pan.rotation)
      .setScale(this.pan.scaleX, this.pan.scaleY)
      .setDepth(this.pan.depth + 0.01)
      .setTint(look.panFlashColor)
      .setAlpha(look.panFlashAlpha * Math.abs(Math.sin((Math.PI * look.panFlashCount * left) / look.panFlashTime)));
  }

  // The firespawns: flying in an arc to their spots, then hovering and bobbing, always turning clockwise. A hit flashes
  // one white, and a broken one goes up in smoke.
  private drawFirespawns(): void {
    const list = this.kate.firespawns;
    const px = render.pixelScale;
    while (this.spawnImages.length < list.length) {
      this.spawnImages.push({ sprite: this.scene.add.image(0, 0, FIRESPAWN), shadow: this.scene.add.image(0, 0, Tex.shadow) });
    }
    this.spawnImages.forEach((s, i) => {
      const f = list[i];
      const up = !!f && f.hp > 0;
      // Broken, or gone with her: it goes up in smoke where it was.
      if (!up && s.sprite.visible) {
        this.fx.smoke(s.shadow.x, s.shadow.y - cfg.firespawnHover * px, 16, 12 * px);
        this.fx.explosion(s.shadow.x, s.shadow.y, cfg.firespawnRadius, cfg.slamColor);
      }
      s.sprite.setVisible(up);
      s.shadow.setVisible(up);
      if (!up || !f) return;
      const p = toScreen(f.x, f.y);
      if (f.flash > 0) s.sprite.setTintFill(0xffffff);
      else s.sprite.clearTint();
      const k = clamp01(f.age / Math.max(cfg.firespawnFly, 1e-3));
      const bob = k < 1 ? 0 : Math.sin((this.age * cfg.firespawnBobRate + i / list.length) * Math.PI * 2) * cfg.firespawnBob;
      const y = p.y - Math.sin(Math.PI * k) * cfg.firespawnArc - (cfg.firespawnHover + bob) * px;
      const size = px * cfg.firespawnScale;
      s.sprite.setPosition(p.x, y).setScale(size).setRotation(this.age * cfg.firespawnSpin * Math.PI * 2).setDepth(p.y);
      s.shadow.setPosition(p.x, p.y).setScale(size * 0.8, size * 0.3).setDepth(p.y - 1000);
    });
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
    if (!this.butterflyOut) {
      this.fly.setVisible(false);
      this.flyGlow.setVisible(false);
      Object.assign(this.flyAt, { x: k.x, y: k.y, h: look.butterflyHeight * 0.55, placed: true });
      return;
    }
    this.flyGrow = Math.min(1, this.flyGrow + dt / Math.max(look.butterflyOutTime, 1e-3));
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
    this.fly.setTexture(frame).setScale(px * look.butterflyScale * this.flyGrow).setPosition(s.x, y).setDepth(s.y + 0.6).setAlpha(k.deathAlpha);
    this.flyGlow
      .setPosition(s.x, y)
      .setDepth(s.y + 0.5)
      .setTint(color)
      .setScale((look.butterflyGlow * px * look.butterflyScale * boost) / 32)
      .setAlpha(Math.min(1, look.butterflyGlowAlpha * (0.85 + 0.15 * Math.sin(this.age * 9)) * boost) * this.flyGrow * k.deathAlpha);
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

  // What the story does with her, for each one out.
  look(face: string): void {
    for (const k of this.kates.list) this.viewOf(k).face = face;
  }

  butterfly(on: boolean): void {
    for (const k of this.kates.list) this.viewOf(k).setButterfly(on);
  }

  bark(text: string, color: string, seconds: number): void {
    for (const k of this.kates.list) this.viewOf(k).bark(text, color, seconds);
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
