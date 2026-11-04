// What a Vestige (or anything else) can do to an enemy besides hurting it. Every enemy carries one Status; the scene
// applies effects and ticks them, and each kind of enemy only asks `held` (stand still, do nothing) and `speedMult`.
// A new effect is a new kind here, not new code in every enemy.
//   stun: held for `seconds`, and whatever attack it was making is cancelled (the scene calls the kind's interrupt)
//   freeze: held for `seconds`, and drawn frozen; an attack it was making waits and carries on after
//   slow: moves at (1 - power) of its speed for `seconds`
//   burn: takes `power` damage a second for `seconds`
export type EffectKind = 'stun' | 'freeze' | 'slow' | 'burn';
export const EFFECT_KINDS: readonly EffectKind[] = ['stun', 'freeze', 'slow', 'burn'];

export interface Effect {
  kind: EffectKind;
  seconds: number;
  power: number;
}

export class Status {
  // Seconds left on each effect, and the strength of the slow and the burn.
  stun = 0;
  freeze = 0;
  slow = 0;
  slowPower = 0;
  burn = 0;
  burnPower = 0;

  // Puts an effect on, shortened by `resist` (0 takes it all, 1 is immune). A longer or stronger one wins; they do
  // not stack.
  apply(e: Effect, resist: number): void {
    const t = e.seconds * Math.max(0, 1 - resist);
    if (t <= 0) return;
    if (e.kind === 'stun') this.stun = Math.max(this.stun, t);
    else if (e.kind === 'freeze') this.freeze = Math.max(this.freeze, t);
    else if (e.kind === 'slow') {
      this.slow = Math.max(this.slow, t);
      this.slowPower = Math.max(this.slowPower, Math.min(1, e.power));
    } else {
      this.burn = Math.max(this.burn, t);
      this.burnPower = Math.max(this.burnPower, e.power);
    }
  }

  // Runs the clocks down. Returns the burn damage due this step.
  tick(dt: number): number {
    this.stun = Math.max(0, this.stun - dt);
    this.freeze = Math.max(0, this.freeze - dt);
    this.slow = Math.max(0, this.slow - dt);
    if (this.slow <= 0) this.slowPower = 0;
    const burning = Math.min(dt, this.burn);
    this.burn = Math.max(0, this.burn - dt);
    const dmg = burning * this.burnPower;
    if (this.burn <= 0) this.burnPower = 0;
    return dmg;
  }

  // Stunned or frozen: it does nothing, and its touch and attacks do not hurt.
  get held(): boolean {
    return this.stun > 0 || this.freeze > 0;
  }

  get speedMult(): number {
    return 1 - this.slowPower;
  }

  clear(): void {
    this.stun = this.freeze = this.slow = this.slowPower = this.burn = this.burnPower = 0;
  }
}
