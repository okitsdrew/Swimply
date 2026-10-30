import Phaser from 'phaser';
import { dash, player as cfgPlayer, teleport } from '../config/character';
import { camera, cloak, feel, heroLook } from '../config/feel';
import { render } from '../config/render';
import { ellipseHalfSize, toScreen, toWorld, Vec2 } from '../core/iso';
import { Player } from '../sim/Player';
import { ellipseArc, lerp, solveArm } from './armMath';
import { heroWalkFrames, Tex } from './art';
import { BOW_STRING, BowView } from './BowView';
import { Fx } from './Fx';

// Art measurements, in sprite pixels (multiplied by render.pixelScale).
const SHOULDER_X = 4;
const SHOULDER_Y = 12;
const CHEST_Y = 10;


const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

// Draws the hero from a Player's state: body, walking arms, the cloak, the floating bow, dash and teleport effects.
// It reads the sim and never changes it.
export class PlayerView {
  private body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private bow: BowView;
  private handGlow: Phaser.GameObjects.Image[];
  private arms: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private cloak: Phaser.GameObjects.Graphics;
  private cloakPts: Vec2[] = [];
  private cloakPrev: Vec2[] = [];
  private eyeGlow: Phaser.GameObjects.Image[];
  private bowVis = 0;
  private kick = 0;
  private afterimageTimer = 0;
  private readyPulse = 0;
  private wasCooling = false;
  private phase = 0;
  private raise = 0;
  private walk = 0;
  private armsUp = 0;
  private dustTimer = 0;
  private time = 0;
  private flashTime = 0;
  armsRate = 0.06;
  // Called on each footstep, so sound can be attached later without the view knowing about audio.
  onStep: () => void = () => {};

  constructor(scene: Phaser.Scene, private player: Player, private fx: Fx) {
    this.shadow = scene.add.image(0, 0, Tex.shadow);
    this.body = scene.add.image(0, 0, Tex.hero).setOrigin(0.5, 1);
    this.cloak = scene.add.graphics();
    this.eyeGlow = [0, 1].map(() => scene.add.image(0, 0, Tex.glow).setTint(0xa060ff).setBlendMode(Phaser.BlendModes.ADD));
    this.bow = new BowView(scene, fx);
    this.handGlow = [0, 1].map(() => scene.add.image(0, 0, Tex.glow).setTint(0xa060ff).setBlendMode(Phaser.BlendModes.ADD));
    this.arms = scene.add.graphics();
    this.ring = scene.add.graphics();
  }

  // Briefly lights the body up when hit.
  flash(): void {
    this.flashTime = feel.hitFlashTime;
  }

  private get px(): number {
    return render.pixelScale;
  }

  // A black cloak that hangs from the shoulders on a short rope, so it streams behind him as he moves and dashes.
  private updateCloak(dt: number, cx: number, cy: number, px: number): void {
    const g = this.cloak;
    g.clear();
    const eyes = this.eyeGlow;
    const n = Math.max(3, Math.round(cloak.segments));
    const seg = (cloak.length * px) / n;
    const ax = cx;
    const ay = cy - (SHOULDER_Y - 1) * px;
    if (this.cloakPts.length !== n + 1) {
      this.cloakPts = Array.from({ length: n + 1 }, (_, i) => ({ x: ax, y: ay + i * seg }));
      this.cloakPrev = this.cloakPts.map((p) => ({ ...p }));
    }
    const pts = this.cloakPts;
    const prev = this.cloakPrev;
    const damp = Math.exp(-cloak.drag * dt);
    pts[0].x = ax;
    pts[0].y = ay;
    for (let i = 1; i <= n; i++) {
      const vx = (pts[i].x - prev[i].x) * damp;
      const vy = (pts[i].y - prev[i].y) * damp;
      prev[i].x = pts[i].x;
      prev[i].y = pts[i].y;
      pts[i].x += vx;
      pts[i].y += vy + cloak.gravity * px * dt * dt * 0.5;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i <= n; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const k = seg / d;
        pts[i].x = pts[i - 1].x + dx * k;
        pts[i].y = pts[i - 1].y + dy * k;
      }
    }
    const left: Vec2[] = [];
    const right: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n, i + 1)];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      const w = ((cloak.width * px) / 2) * (0.75 + 0.6 * (i / n));
      left.push({ x: pts[i].x - (ty / len) * w, y: pts[i].y + (tx / len) * w });
      right.push({ x: pts[i].x + (ty / len) * w, y: pts[i].y - (tx / len) * w });
    }
    const depth = this.body.depth - 0.6;
    g.setDepth(depth).setAlpha(this.body.alpha);
    const poly = left.concat(right.slice().reverse());
    g.fillStyle(0x050408, 1);
    g.fillPoints(poly.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
    // A thin purple lining shows along the fold, and the hem is torn into points.
    g.lineStyle(Math.max(1, px * 0.8), 0x3a1c66, 0.9);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= n; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
    const l = left[n];
    const r = right[n];
    const tipX = pts[n].x + (pts[n].x - pts[n - 1].x) * 0.7;
    const tipY = pts[n].y + (pts[n].y - pts[n - 1].y) * 0.7;
    g.fillStyle(0x050408, 1);
    g.fillTriangle(l.x, l.y, (l.x + r.x) / 2, (l.y + r.y) / 2, (l.x + tipX) / 2 - 2 * px, (l.y + tipY) / 2);
    g.fillTriangle(r.x, r.y, (l.x + r.x) / 2, (l.y + r.y) / 2, (r.x + tipX) / 2 + 2 * px, (r.y + tipY) / 2);
    g.fillTriangle(l.x, l.y, r.x, r.y, tipX, tipY);

    // The two glowing eyes; colour and place in the hero look config.
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 6);
    eyes.forEach((e, i) => {
      e.setVisible(this.body.visible)
        .setPosition(cx + (i === 0 ? -1 : 1) * heroLook.eyeSpread * px, cy - heroLook.eyeHeight * px)
        .setTint(heroLook.eyeGlowColor)
        .setScale(px * 0.17)
        .setAlpha(cloak.eyeGlow * pulse * this.body.alpha)
        .setDepth(this.body.depth + 0.2);
    });
  }

  setVisible(visible: boolean): void {
    for (const o of [this.body, this.shadow, this.cloak, ...this.eyeGlow, this.arms, this.ring, ...this.handGlow]) o.setVisible(visible);
    this.bow.setVisible(visible);
  }

  onFire(): void {
    this.kick = feel.bowKickTime;
  }

  onDashStart(): void {
    this.afterimageTimer = 0;
  }

  // A dark purple line zips between the two points, with a puff of void at the start.
  onTeleport(fromX: number, fromY: number, toX: number, toY: number, travelTime: number, lineWidth?: number): void {
    const a = toScreen(fromX, fromY);
    const b = toScreen(toX, toY);
    const lift = 10 * this.px;
    this.fx.streak(a.x, a.y - lift, b.x, b.y - lift, travelTime > 0 ? travelTime : undefined, lineWidth);
    this.voidPuff(a.x, a.y - lift);
    this.fx.addShake(camera.shakeOnCast * 0.5);
  }

  onTeleportArrive(x: number, y: number): void {
    const a = toScreen(x, y);
    this.voidPuff(a.x, a.y - 10 * this.px);
  }

  private voidPuff(x: number, y: number): void {
    for (let i = 0; i < teleport.puffs; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.fx.particle({
        texture: Math.random() < 0.5 ? Tex.smoke : Tex.glow,
        x,
        y,
        life: 0.3 + Math.random() * 0.3,
        from: 0.5 + Math.random() * 0.5,
        to: 1.5 + Math.random(),
        alpha: 0.9,
        tint: [0x07000d, 0x2a0a4a, 0x5a1a9a][Math.floor(Math.random() * 3)],
        additive: false,
        vx: Math.cos(angle) * 50,
        vy: Math.sin(angle) * 30,
      });
    }
  }

  // Where arrows start in world space: the nocked arrow on the fully drawn string.
  muzzle(): Vec2 {
    const p = this.player;
    const px = this.px;
    const g = toScreen(p.x, p.y);
    const a = toScreen(p.x + p.aimX, p.y + p.aimY);
    const angle = Math.atan2(a.y - g.y, a.x - g.x);
    const d = (feel.bowFloatDistance - BOW_STRING * render.bowScale - feel.drawDistance) * px;
    const sx = g.x + Math.cos(angle) * d;
    const sy = g.y - CHEST_Y * px + Math.sin(angle) * d;
    return toWorld(sx, sy + render.arrowHeight);
  }

  update(dt: number): void {
    const p = this.player;
    const px = this.px;
    const f = feel;
    toScreen(p.x, p.y, screen);
    toScreen(p.x + p.aimX, p.y + p.aimY, ahead);
    const aimAngle = Math.atan2(ahead.y - screen.y, ahead.x - screen.x);
    const facingLeft = ahead.x < screen.x;

    const speed = Math.hypot(p.vx, p.vy);
    const sliding = p.sliding;
    const moving = !p.dashing && !sliding && speed > cfgPlayer.moveSpeed * 0.1;
    const prevPhase = this.phase;
    this.phase = moving ? (this.phase + (speed * dt) / f.strideLength) % 1 : 0;
    if (moving && (this.phase < prevPhase || (prevPhase < 0.5 && this.phase >= 0.5))) this.onStep();
    const bob = moving ? Math.abs(Math.sin(this.phase * Math.PI * 2)) * f.walkBob * px : 0;
    const swing = moving ? Math.sin(this.phase * Math.PI * 2) * 2.5 * px : 0;

    const frame = moving ? heroWalkFrames[Math.floor(this.phase * 4) % 4] : Tex.hero;
    this.body
      .setTexture(frame)
      .setPosition(screen.x, screen.y - bob)
      .setScale(px)
      .setFlipX(facingLeft)
      .setDepth(screen.y)
      .setAlpha(p.dashing || p.teleporting ? 0.55 : 1);
    this.flashTime = Math.max(0, this.flashTime - dt);
    if (this.flashTime > 0) this.body.setTintFill(0xffffff);
    else this.body.clearTint();
    this.shadow.setPosition(screen.x, screen.y).setScale(px * 0.9, px * 0.35).setDepth(screen.y - 1000);

    // While shooting he holds his arms up as if steering the bow with magic, and flaps them.
    const rate = p.readyTimer > 0 ? dt / Math.max(f.shootPoseTime, 1e-4) : -dt / Math.max(f.shootPoseTime, 1e-4);
    this.raise = Phaser.Math.Clamp(this.raise + rate, 0, 1);
    const t = this.raise * this.raise * (3 - 2 * this.raise);
    this.time += dt;
    this.armsUp = Phaser.Math.Clamp(this.armsUp + (p.armsUpTimer > 0 ? dt : -dt) / this.armsRate, 0, 1);
    const poseT = Math.max(t, this.armsUp * this.armsUp * (3 - 2 * this.armsUp));

    this.kick = Math.max(0, this.kick - dt);
    const kickT = f.bowKickTime > 0 ? this.kick / f.bowKickTime : 0;

    const cx = screen.x;
    const cy = screen.y - bob;
    this.updateCloak(dt, cx, cy, px);
    const bowSide = facingLeft ? -1 : 1;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);
    const bs = px * render.bowScale;

    const shoulderA = { x: cx + bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };
    const shoulderB = { x: cx - bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };

    // Walking holds the arms out to the sides (< I >) and wiggles them; standing they hang down.
    this.walk = Phaser.Math.Clamp(this.walk + (moving ? dt : -dt) / 0.1, 0, 1);
    const walkFlap = swing * (f.walkArmFlap / 2.5);
    const shootFlap = Math.sin(this.time * f.shootFlapRate) * f.walkArmFlap * px;
    const pose = (shoulder: Vec2, side: number, flapSign: number): Vec2 => {
      const rest = { x: shoulder.x + side * 1.5 * px, y: shoulder.y + 8 * px + swing * flapSign };
      const walking = {
        x: shoulder.x + side * f.walkArmSpread * px,
        y: shoulder.y + f.walkArmDrop * px + walkFlap * flapSign,
      };
      const shooting = {
        x: shoulder.x + side * f.shootArmSpread * px,
        y: shoulder.y + f.shootArmDrop * px + shootFlap * flapSign,
      };
      return lerp(lerp(rest, walking, this.walk), shooting, poseT);
    };
    const armA = solveArm(shoulderA, pose(shoulderA, bowSide, 1), f.armLength * px);
    const armB = solveArm(shoulderB, pose(shoulderB, -bowSide, -1), f.armLength * px);

    // The bow floats in front of him toward the cursor and phases in only while he shoots.
    const visRate = p.readyTimer > 0 ? dt / Math.max(f.bowPhaseInTime, 1e-4) : -dt / Math.max(f.bowPhaseOutTime, 1e-4);
    const prevVis = this.bowVis;
    this.bowVis = Phaser.Math.Clamp(this.bowVis + visRate, 0, 1);
    const dist = (f.bowFloatDistance - kickT * 3) * px;
    const bowPos = {
      x: cx + dirX * dist,
      y: cy - CHEST_Y * px + dirY * dist + Math.sin(this.time * 3) * f.bowFloatBob * px,
    };

    const g = this.arms;
    g.clear().setDepth(screen.y + 0.3).setAlpha(this.body.alpha);
    for (const [width, color] of [
      [(heroLook.sleeveWidth + heroLook.sleeveEdge) * px, heroLook.sleeveEdgeColor],
      [heroLook.sleeveWidth * px, heroLook.sleeveColor],
    ] as const) {
      if (width <= 0) continue;
      g.lineStyle(width, color, 1);
      for (const arm of [armA, armB]) {
        g.beginPath();
        g.moveTo(arm.shoulder.x, arm.shoulder.y);
        g.lineTo(arm.elbow.x, arm.elbow.y);
        g.lineTo(arm.hand.x, arm.hand.y);
        g.strokePath();
      }
    }
    g.fillStyle(heroLook.gloveColor, 1);
    g.fillCircle(armA.hand.x, armA.hand.y, heroLook.gloveSize * px);
    g.fillCircle(armB.hand.x, armB.hand.y, heroLook.gloveSize * px);

    if (sliding) this.slideDust(dt);
    this.bow.draw(
      {
        pos: bowPos,
        angle: aimAngle,
        scale: bs,
        vis: this.bowVis,
        prevVis,
        pull: p.drawProgress,
        shooting: p.readyTimer > 0,
        depthY: screen.y,
        depthOffset: dirY < 0 ? -0.5 : 0.5,
      },
      dt,
    );

    // Hands glow purple while he is shooting.
    this.handGlow.forEach((img, i) => {
      const hand = i === 0 ? armA.hand : armB.hand;
      img
        .setVisible(t > 0.01)
        .setPosition(hand.x, hand.y)
        .setTint(heroLook.handGlowColor)
        .setScale(px * (0.32 + Math.sin(this.time * 12 + i * 2) * 0.05))
        .setAlpha(t * f.handGlow)
        .setDepth(screen.y + 0.4);
    });

    if (p.dashing && dash.afterimages > 0) {
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.fx.afterimage(this.body.texture.key, screen.x, screen.y, facingLeft, px, screen.y);
        this.afterimageTimer += dash.duration / dash.afterimages;
      }
    }

    this.drawCooldownRing(dt);
  }

  // Dust kicked up at his feet while he drifts out of a teleport.
  private slideDust(dt: number): void {
    const p = this.player;
    const px = this.px;
    const v = toScreen(p.vx, p.vy);
    const len = Math.hypot(v.x, v.y) || 1;
    this.dustTimer += dt * 70;
    while (this.dustTimer >= 1) {
      this.dustTimer -= 1;
      const life = 0.25 + Math.random() * 0.25;
      this.fx.particle({
        texture: Tex.smoke,
        x: screen.x + (Math.random() - 0.5) * 8 * px,
        y: screen.y - Math.random() * 2 * px,
        life,
        from: px * 0.3,
        to: px * (0.7 + Math.random() * 0.5),
        alpha: 0.55,
        tint: Math.random() < 0.5 ? 0x4a3a66 : 0x2a1f40,
        additive: false,
        vx: (-v.x / len) * 40 + (Math.random() - 0.5) * 30,
        vy: (-v.y / len) * 20 + (Math.random() - 0.5) * 10,
        depth: screen.y - 0.5,
      });
      if (Math.random() < 0.25) {
        this.fx.particle({
          x: screen.x + (Math.random() - 0.5) * 6 * px,
          y: screen.y,
          life: 0.2,
          from: 0.25,
          to: 0.05,
          alpha: 0.9,
          tint: 0xa060ff,
          vx: (-v.x / len) * 80,
          vy: (-v.y / len) * 40,
          depth: screen.y + 0.5,
        });
      }
    }
  }

  private drawCooldownRing(dt: number): void {
    const p = this.player;
    const g = this.ring;
    g.clear();
    g.setDepth(screen.y - 999);

    const cooling = p.dashing || p.dashCooldownFraction > 0;
    if (this.wasCooling && !cooling) this.readyPulse = 0.25;
    this.wasCooling = cooling;
    this.readyPulse = Math.max(0, this.readyPulse - dt);

    const half = ellipseHalfSize(18);
    if (cooling) {
      const progress = p.dashing ? 0 : 1 - p.dashCooldownFraction;
      g.lineStyle(2, 0x2a2638, 0.8);
      ellipseArc(g, screen.x, screen.y, half.x, half.y, 1);
      g.lineStyle(2, 0xc9b6ff, 0.9);
      ellipseArc(g, screen.x, screen.y, half.x, half.y, progress);
    } else if (this.readyPulse > 0) {
      const t = this.readyPulse / 0.25;
      g.lineStyle(2, 0xffffff, t);
      ellipseArc(g, screen.x, screen.y, half.x * (1 + (1 - t) * 0.3), half.y * (1 + (1 - t) * 0.3), 1);
    }
  }
}
