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

// Something that can be placed in a map: a prop, a wall piece, or a marker. Collision belongs to the asset, so
// every pillar in every map is solid the same way and fixing it once fixes it everywhere.
export interface Asset {
  id: string;
  name: string;
  // For grouping in the asset maker and level editor palettes.
  category: string;
  parts: AssetPart[];
  collision: CollisionCircle[];
  // Markers are invisible in play and tell the game where things go: "playerStart" (where a run starts) and "shadeSpawn" (a zone Shades appear in).
  marker: string;
  light: Light | null;
}

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
      marker: str(e.marker, '', `${id}.marker`, problems),
      light,
    });
  });
  report('assets', problems);
  return out;
}

export const assets = new Registry<Asset>('assets', parseAssets(raw));
