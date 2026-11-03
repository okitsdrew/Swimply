import raw from './assets.json';
import { list, num, obj, Problems, Registry, report, str } from './registry';

// One drawn piece of an asset. Offsets are in art pixels from the asset's ground point on screen, before size.
export interface AssetPart {
  texture: string;
  x: number;
  y: number;
  scale: number;
  // Which point of the texture sits on the ground point (0 to 1 across, 0 to 1 down).
  originX: number;
  originY: number;
  // Drawn flat into the floor layer under everything, instead of depth-sorted with characters.
  ground: boolean;
  // Sprite ids played in a loop at `fps` frames a second, for a part that moves (a fire). Empty for a still part.
  frames: string[];
  fps: number;
}

// A glow round an asset, and the hole it makes in a map's darkness. Offsets and radius are in art pixels from the
// ground point, like parts, so a light on a wall lamp can sit up on the lamp.
export interface Light {
  // "#rrggbb".
  color: string;
  x: number;
  y: number;
  radius: number;
  // 0 to 1: how bright the glow is.
  intensity: number;
  // 0 to 1: how much it wavers, for flames.
  flicker: number;
}

// A solid circle in world units, relative to where the asset is placed.
export interface CollisionCircle {
  x: number;
  y: number;
  radius: number;
}

// What arrows hit, apart from what blocks walking: a circle, or a box. A box's w runs along world x (down-right on
// screen, like an SE wall) and h along world y (down-left), unless it is turned: then w runs straight across the
// screen and h straight up and down it. World units, relative to where the asset is placed.
export interface HitShape {
  box: boolean;
  x: number;
  y: number;
  radius: number;
  w: number;
  h: number;
  turned: boolean;
}

// A box hit shape's four corners in world units, relative to the asset, in order round it.
export function boxCorners(h: HitShape): { x: number; y: number }[] {
  const a = h.w / 2;
  const b = h.h / 2;
  const local = [[-a, -b], [a, -b], [a, b], [-a, b]];
  const r = Math.SQRT1_2;
  // Turned: w along (1, -1) and h along (1, 1), both normalised.
  return local.map(([u, v]) => (h.turned ? { x: h.x + (u + v) * r, y: h.y + (v - u) * r } : { x: h.x + u, y: h.y + v }));
}

// Something that can be placed in a map: a prop, a wall piece, or a marker. Collision belongs to the asset, so
// every pillar in every map is solid the same way and fixing it once fixes it everywhere.
export interface Asset {
  id: string;
  name: string;
  // For grouping in the asset maker and level editor palettes.
  category: string;
  parts: AssetPart[];
  collision: CollisionCircle[];
  // What arrows hit. Empty: its collision circles.
  hit: HitShape[];
  // Markers are invisible in play and tell the game where things go: "playerStart" (where a map starts), "shadeSpawn"
  // (a zone Shades appear in) and "door" (walking into it goes to the map in its `to`).
  marker: string;
  light: Light | null;
  // A looping sound id (sounds.json), heard louder the nearer the player is to one of these (a fire's crackle).
  sound: string;
  // How much arrow damage breaks it. 0 can't be broken. Arrows hit its hit shapes, or its collision circles.
  health: number;
  // An enemy kind (ENEMY_KINDS). On an "enemy" marker it is the enemy placed there; on anything else it makes the
  // thing a spawner of that enemy, one every spawnEvery seconds, at most spawnMax alive at once.
  enemy: string;
  spawnEvery: number;
  spawnMax: number;
}

// The enemies a map can place or spawn. The Mindscape's own Shades and boss come from its run, not from these.
export const ENEMY_KINDS = ['shade', 'werewolf', 'priest'] as const;

function parseAssets(data: unknown): Asset[] {
  const problems: Problems = [];
  const out: Asset[] = [];
  list(obj(data).assets, 'assets.json', problems).forEach((entry, i) => {
    const e = obj(entry);
    const id = str(e.id, '', `assets.json asset ${i}`, problems);
    if (!id) return problems.push(`assets.json asset ${i}: has no id, skipped`);
    const parts = list(e.parts, `${id}.parts`, problems).map((p, j): AssetPart => {
      const q = obj(p);
      const w = `${id} part ${j}`;
      const texture = str(q.texture, '', `${w}.texture`, problems);
      if (!texture) problems.push(`${w}: has no texture`);
      return {
        texture,
        x: num(q.x, 0, `${w}.x`, problems),
        y: num(q.y, 0, `${w}.y`, problems),
        scale: num(q.scale, 1, `${w}.scale`, problems),
        originX: num(q.originX, 0.5, `${w}.originX`, problems),
        originY: num(q.originY, 1, `${w}.originY`, problems),
        ground: q.ground === true,
        frames: list(q.frames, `${w}.frames`, problems).filter((f): f is string => typeof f === 'string'),
        fps: num(q.fps, 8, `${w}.fps`, problems),
      };
    });
    const collision = list(e.collision, `${id}.collision`, problems).map((c, j): CollisionCircle => {
      const q = obj(c);
      const w = `${id} circle ${j}`;
      return { x: num(q.x, 0, `${w}.x`, problems), y: num(q.y, 0, `${w}.y`, problems), radius: num(q.radius, 16, `${w}.radius`, problems) };
    });
    const hit = list(e.hit, `${id}.hit`, problems).map((c, j): HitShape => {
      const q = obj(c);
      const w = `${id} hit shape ${j}`;
      return {
        box: q.box === true,
        x: num(q.x, 0, `${w}.x`, problems),
        y: num(q.y, 0, `${w}.y`, problems),
        radius: num(q.radius, 16, `${w}.radius`, problems),
        w: num(q.w, 32, `${w}.w`, problems),
        h: num(q.h, 32, `${w}.h`, problems),
        turned: q.turned === true,
      };
    });
    let light: Light | null = null;
    if (e.light !== undefined) {
      const l = obj(e.light);
      const w = `${id}.light`;
      let color = str(l.color, '#ffb840', `${w}.color`, problems).toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(color)) {
        problems.push(`${w}.color is ${JSON.stringify(color)}, expected a colour like "#ffb840"`);
        color = '#ffb840';
      }
      light = {
        color,
        x: num(l.x, 0, `${w}.x`, problems),
        y: num(l.y, 0, `${w}.y`, problems),
        radius: num(l.radius, 60, `${w}.radius`, problems),
        intensity: num(l.intensity, 0.5, `${w}.intensity`, problems),
        flicker: num(l.flicker, 0, `${w}.flicker`, problems),
      };
    }
    out.push({
      id,
      name: str(e.name, id, `${id}.name`, problems),
      category: str(e.category, 'misc', `${id}.category`, problems),
      parts,
      collision,
      hit,
      marker: str(e.marker, '', `${id}.marker`, problems),
      sound: str(e.sound, '', `${id}.sound`, problems),
      health: Math.max(0, num(e.health, 0, `${id}.health`, problems)),
      enemy: enemyKind(str(e.enemy, '', `${id}.enemy`, problems), id, problems),
      spawnEvery: Math.max(0.1, num(e.spawnEvery, 3, `${id}.spawnEvery`, problems)),
      spawnMax: Math.max(1, Math.round(num(e.spawnMax, 3, `${id}.spawnMax`, problems))),
      light,
    });
  });
  report('assets', problems);
  return out;
}

function enemyKind(kind: string, id: string, problems: Problems): string {
  if (!kind || (ENEMY_KINDS as readonly string[]).includes(kind)) return kind;
  problems.push(`${id}.enemy is ${JSON.stringify(kind)}, not one of ${ENEMY_KINDS.join(', ')}; ignored`);
  return '';
}

export const assets = new Registry<Asset>('assets', parseAssets(raw));
