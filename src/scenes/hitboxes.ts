import Phaser from 'phaser';
import { player as cfgPlayer } from '../config/character';
import { pickups as cfgPickups } from '../config/pickups';
import { render } from '../config/render';
import { run } from '../config/run';
import { toScreen, Vec2 } from '../core/iso';
import { boxCorners } from '../data/assets';
import { AreaMap } from '../data/maps';
import { Arrows } from '../sim/Arrows';
import { Breakables } from '../sim/Breakables';
import { MapWorld } from '../sim/World';
import { Enemies } from './Enemies';

// What the hitbox view draws from.
export interface HitboxWorld {
  hero: Vec2;
  map: AreaMap;
  world: MapWorld;
  enemies: Enemies;
  breakables: Breakables;
  arrows: Arrows;
}

// Dev aid: circles and boxes for what actually collides, drawn flat on the ground, and the map's markers.
export function drawHitboxes(g: Phaser.GameObjects.Graphics, w: HitboxWorld): void {
  const ring = (x: number, y: number, r: number, color: number) => {
    const s = toScreen(x, y);
    const e = { x: r * render.isoScale * Math.SQRT2, y: r * render.isoScale * Math.SQRT1_2 };
    g.lineStyle(1, color, 1).strokeEllipse(s.x, s.y, e.x * 2, e.y * 2);
  };
  ring(w.hero.x, w.hero.y, cfgPlayer.bodyRadius, 0x66ccff);
  ring(w.hero.x, w.hero.y, cfgPlayer.hitRadius, 0xff4466);
  if (cfgPickups.roundOnScreen) {
    const p = toScreen(w.hero.x, w.hero.y);
    g.lineStyle(1, 0x7fc8ff, 1).strokeCircle(p.x, p.y, cfgPickups.pickupRadius * render.isoScale * Math.SQRT2);
  } else ring(w.hero.x, w.hero.y, cfgPickups.pickupRadius, 0x7fc8ff);
  // Enemy bodies in yellow, what kills on touch in red.
  w.enemies.debug({
    ring: (x, y, r, hurts) => ring(x, y, r, hurts ? 0xff4466 : 0xffcc44),
    line: (x0, y0, x1, y1) => {
      const a = toScreen(x0, y0);
      const b = toScreen(x1, y1);
      g.lineStyle(1, 0xffcc44, 1).lineBetween(a.x, a.y, b.x, b.y);
    },
  });
  for (const c of w.world.circles) ring(c.x, c.y, c.radius, 0x66ffaa);
  // What arrows hit, in orange: hit shapes, and the collision circles of things that can break but have none.
  for (const o of w.map.objects) {
    const k = o.size;
    for (const h of o.asset.hit) {
      if (!h.box) ring(o.x + h.x * k, o.y + h.y * k, h.radius * k, 0xff9933);
      else g.lineStyle(1, 0xff9933, 1).strokePoints(boxCorners(h).map((c) => toScreen(o.x + c.x * k, o.y + c.y * k)), true);
    }
    if (o.asset.hit.length || !w.breakables.canBreak(o)) continue;
    for (const c of o.asset.collision) ring(o.x + c.x * k, o.y + c.y * k, c.radius * k, 0xff9933);
  }
  for (const b of w.world.floorBoxes) {
    g.lineStyle(1, 0x66ffaa, 0.8).strokePoints([toScreen(b.x0, b.y0), toScreen(b.x1, b.y0), toScreen(b.x1, b.y1), toScreen(b.x0, b.y1)], true);
  }
  for (const o of w.map.objects) {
    if (!o.asset.marker) continue;
    ring(o.x, o.y, 12, 0xf2d7a6);
    if (o.asset.marker === 'shadeSpawn') ring(o.x, o.y, run.spawnZoneRadius * o.size, 0xf2d7a6);
    const s = toScreen(o.x, o.y);
    g.lineStyle(1, 0xf2d7a6, 1).lineBetween(s.x - 6, s.y, s.x + 6, s.y).lineBetween(s.x, s.y - 6, s.x, s.y + 6);
  }
  for (const a of w.arrows.pool.items) if (a.active) ring(a.x, a.y, a.hitRadius, 0xa060ff);
}
