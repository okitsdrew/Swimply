import { spawners } from '../config/spawners';
import { Vec2 } from '../core/iso';
import { AreaMap, Placed, zoneAt } from '../data/maps';
import { EnemyView, ViewFrame } from '../render/enemies';
import { DebugDraw, Enemy, EnemyGroup } from '../sim/enemies';
import { FlowField } from '../sim/Nav';
import { Target } from '../sim/targets';
import { Effect } from '../sim/status';
import { MapWorld } from '../sim/World';

// One kind of enemy as the scene knows it: its id (what an asset's `enemy` names), its sim group and its view.
export interface EnemyKind<E extends Enemy = Enemy> {
  id: string;
  group: EnemyGroup<E>;
  view: EnemyView<E>;
  // How it feels when one dies (shake, hit-stop), after the view's own death effect.
  killed?: (x: number, y: number, e: E) => void;
  // Its dev menu buttons. `spawn` replaces the usual "rise near the hero, `near` away".
  dev?: { spawnLabel: string; killLabel: string; near?: number; spawn?: () => void };
}

// Each kind only ever gets back its own enemies, so the list can hold kinds of different enemy types.
type AnyKind = EnemyKind<any>;

// Every enemy in the map, of every kind, and everything the scene does with them: placing them from the map,
// waking them, running spawners, arrows hitting them, their attacks and touch, deaths and their "killed sets" flags,
// drawing, and the dev menu. It only uses the shared shape (EnemyGroup, EnemyView), so a new kind needs no code here:
// add it to the scene's list of kinds.
export class Enemies {
  private kinds = new Map<string, AnyKind>();
  // Placed enemies still waiting for the hero: one stands there, or (kinds that cannot wait) rises when he comes near.
  private sleepers: { o: Placed; kind: AnyKind; e: Enemy | null }[] = [];
  // The placed marker each placed enemy came from, so its "killed sets" flag turns on when it dies.
  private placedOf = new Map<Enemy, Placed>();
  // Each spawner's clock and the enemies it has out, so it keeps to its max alive (its own, or its asset's).
  private spawning = new Map<Placed, { timer: number; out: Set<Enemy> }>();
  // Who each arrow target belongs to, refreshed every step.
  private owners = new Map<Target, AnyKind>();

  // A placed enemy with a "killed sets" flag died: the scene turns it on for this visit.
  onFlag: (flag: string) => void = () => {};
  // Burning hurt one, for damage numbers.
  onBurn: (e: Enemy, amount: number) => void = () => {};
  // Any enemy died, for the scene's own rules (shards in the Mindscape, winning it).
  onKilled: (kind: string, x: number, y: number, e: Enemy) => void = () => {};

  constructor(list: AnyKind[], private world: MapWorld, private nav: FlowField, private hero: Vec2) {
    for (const k of list) {
      this.kinds.set(k.id, k);
      k.group.onRisen = (e) => k.view.onRisen(e);
      k.group.onKilled = (x, y, e) => {
        this.died(e);
        k.view.onKilled(x, y, e);
        k.killed?.(x, y, e);
        this.onKilled(k.id, x, y, e);
      };
    }
  }

  group(id: string): EnemyGroup | undefined {
    return this.kinds.get(id)?.group;
  }

  // Everything gone, views too, ready for placing afresh.
  clear(): void {
    for (const k of this.kinds.values()) {
      k.group.clear();
      k.view.clear();
    }
    this.sleepers = [];
    this.spawning.clear();
    this.placedOf.clear();
  }

  // The map's own enemies: placed ones that can stand wait at their spots; the rest, and spawners, wait for him.
  place(map: AreaMap): void {
    for (const o of map.objects) {
      if (o.asset.marker !== 'enemy' || !o.asset.enemy) continue;
      const kind = this.kinds.get(o.asset.enemy);
      if (!kind) continue;
      const e = kind.group.wait?.(o.x, o.y) ?? null;
      if (e) this.placedOf.set(e, o);
      this.sleepers.push({ o, kind, e });
    }
  }

  // Wakes placed enemies the hero comes near, and runs every spawner whose zone he stands in (or, with no zone,
  // that he is near). A broken spawner is no longer in the map, so it simply stops; what it sent out stays.
  updateWorld(dt: number, map: AreaMap): void {
    const p = this.hero;
    const near = (o: Placed) => Math.hypot(o.x - p.x, o.y - p.y) < (o.aggro || spawners.aggroRadius);
    this.sleepers = this.sleepers.filter(({ o, kind, e }) => {
      if (e) {
        if (!kind.group.waiting(e)) return false;
        if (!near(o)) return true;
        kind.group.wake(e);
        return false;
      }
      if (!near(o)) return true;
      this.placedOf.set(kind.group.spawn(o.x, o.y), o);
      return false;
    });
    const here = zoneAt(map, p.x, p.y);
    for (const o of map.objects) {
      const a = o.asset;
      if (!a.enemy || a.marker === 'enemy') continue;
      const kind = this.kinds.get(a.enemy);
      if (!kind) continue;
      let st = this.spawning.get(o);
      if (!st) this.spawning.set(o, (st = { timer: 0, out: new Set() }));
      const on = o.zone ? o.zone === here : near(o);
      if (!on) {
        // Coming back in, the first one rises soon after, not a whole spawnEvery later.
        st.timer = Math.max(0, (o.every || a.spawnEvery) - spawners.firstSpawn);
        continue;
      }
      st.timer += dt;
      if (st.timer < (o.every || a.spawnEvery) || st.out.size >= (o.max || a.spawnMax)) continue;
      st.timer = 0;
      const at = this.clearSpot(o.x, o.y, spawners.spawnDistance * o.size, kind.group.bodyRadius);
      st.out.add(kind.group.spawn(at.x, at.y));
    }
  }

  // One of a kind rising about `dist` from the hero, on clear ground.
  spawnNear(id: string, dist: number): Enemy | null {
    const kind = this.kinds.get(id);
    if (!kind) return null;
    const at = this.clearSpot(this.hero.x, this.hero.y, dist, kind.group.bodyRadius);
    return kind.group.spawn(at.x, at.y);
  }

  // Nobody left: no enemy alive or still waiting, and no spawner standing in the map.
  cleared(map: AreaMap): boolean {
    if (this.sleepers.length) return false;
    for (const k of this.kinds.values()) if (k.group.list.length) return false;
    return !map.objects.some((o) => o.asset.enemy && o.asset.marker !== 'enemy');
  }

  // A fight is on: some enemy is up and about (not one still standing where it was placed, nor one rising).
  fighting(): boolean {
    for (const k of this.kinds.values()) if (k.group.list.some((e) => e.alive && !k.group.waiting(e))) return true;
    return false;
  }

  killAll(id: string): void {
    const g = this.kinds.get(id)?.group;
    if (g) [...g.list].forEach((e) => g.kill(e));
  }

  // A world enemy died: its spawner may send another, and a placed one's "killed sets" flag turns on for this visit.
  private died(e: Enemy): void {
    for (const st of this.spawning.values()) st.out.delete(e);
    const o = this.placedOf.get(e);
    if (!o) return;
    this.placedOf.delete(e);
    if (o.onBreak) this.onFlag(o.onBreak);
  }

  update(dt: number): void {
    for (const k of this.kinds.values()) {
      // Effects run down here, for every kind at once; a burn hurts through the kind's own damage.
      for (const e of [...k.group.list]) {
        const burn = e.status.tick(dt);
        if (burn > 0 && e.alive) {
          k.group.damage(e, burn, e.x, e.y);
          this.onBurn(e, burn);
        }
      }
      k.group.update(dt, this.world, this.nav, this.hero);
    }
  }

  // Every enemy of every kind, for drawing their effects.
  all(out: Enemy[]): Enemy[] {
    out.length = 0;
    for (const k of this.kinds.values()) out.push(...k.group.list);
    return out;
  }

  // Puts effects (stun, slow, burn...) on one enemy, as much as its kind lets through.
  afflict(e: Enemy, effects: readonly Effect[]): void {
    for (const k of this.kinds.values()) {
      if (!k.group.list.includes(e)) continue;
      this.applyTo(k, e, effects);
      return;
    }
  }

  // Their attacks this step. Every kind is asked, even after one hits, so each marks what it caught.
  strikes(x: number, y: number, r: number, safe: boolean): boolean {
    let hit = false;
    for (const k of this.kinds.values()) if (k.group.strikes(x, y, r, safe)) hit = true;
    return hit;
  }

  touching(x: number, y: number, r: number): boolean {
    for (const k of this.kinds.values()) if (k.group.touching(x, y, r)) return true;
    return false;
  }

  // What arrows can hit this step, every kind's.
  targets(out: Target[]): void {
    this.owners.clear();
    for (const k of this.kinds.values()) {
      const from = out.length;
      k.group.targets(out);
      for (let i = from; i < out.length; i++) this.owners.set(out[i], k);
    }
  }

  // An arrow hit one: its own kind takes the damage, pushed away from (fromX, fromY).
  damage(t: Target, amount: number, fromX: number, fromY: number): void {
    this.owners.get(t)?.group.damage(t as Enemy, amount, fromX, fromY);
  }

  // Effects on one of a kind, shortened by its ccResist. A stun that takes also stops the attack it was making.
  private applyTo(k: AnyKind, e: Enemy, effects: readonly Effect[]): void {
    for (const fx of effects) {
      e.status.apply(fx, k.group.ccResist);
      if (fx.kind === 'stun' && e.status.stun > 0) k.group.interrupt?.(e);
    }
  }

  // A blast at (x, y): everyone within `radius` takes `amount` (each kind's own hit and knockback) and `effects`, and
  // everyone within `pushRadius` (or `radius`, if bigger) is thrown outward by `push`. Calls `hit` for each one
  // damaged, for numbers and sound.
  blast(x: number, y: number, radius: number, amount: number, pushRadius: number, push: number, effects: readonly Effect[], hit: (e: Enemy) => void): void {
    for (const k of this.kinds.values()) {
      for (const e of [...k.group.list]) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - x, e.y - y) - e.radius;
        if (d < Math.max(pushRadius, radius)) k.group.push?.(e, x, y, push);
        if (d < radius) {
          this.applyTo(k, e, effects);
          k.group.damage(e, amount, x, y);
          hit(e);
        }
      }
    }
  }

  render(f: ViewFrame): void {
    for (const k of this.kinds.values()) k.view.render(f);
  }

  debug(d: DebugDraw): void {
    for (const k of this.kinds.values()) k.group.debug(d);
  }

  // Each kind's spawn and kill buttons.
  devActions(): { label: string; run: () => void }[] {
    const out: { label: string; run: () => void }[] = [];
    for (const k of this.kinds.values()) {
      const d = k.dev;
      if (!d) continue;
      out.push({ label: d.spawnLabel, run: d.spawn ?? (() => this.spawnNear(k.id, d.near ?? 400)) });
      out.push({ label: d.killLabel, run: () => this.killAll(k.id) });
    }
    return out;
  }

  // A spot about `dist` from (x, y) in a random direction where something of radius r can stand: pushed out of
  // anything solid, and not on blocking or killing floor if a few tries can help it.
  clearSpot(x: number, y: number, dist: number, r: number): Vec2 {
    const p = { x, y, radius: r };
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      p.x = x + Math.cos(a) * dist;
      p.y = y + Math.sin(a) * dist;
      this.world.resolve(p);
      if (!this.world.onBlockingFloor(p.x, p.y, r) && !this.world.onHurtingFloor(p.x, p.y)) break;
    }
    return { x: p.x, y: p.y };
  }
}
