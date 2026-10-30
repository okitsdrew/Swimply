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
  // Markers are invisible in play and tell the game where things go: "playerStart" now, spawn zones later.
  marker: string;
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
      };
    });
    const collision = list(e.collision, `${id}.collision`, problems).map((c, j): CollisionCircle => {
      const q = obj(c);
      const w = `${id} circle ${j}`;
      return { x: num(q.x, 0, `${w}.x`, problems), y: num(q.y, 0, `${w}.y`, problems), radius: num(q.radius, 16, `${w}.radius`, problems) };
    });
    out.push({
      id,
      name: str(e.name, id, `${id}.name`, problems),
      category: str(e.category, 'misc', `${id}.category`, problems),
      parts,
      collision,
      marker: str(e.marker, '', `${id}.marker`, problems),
    });
  });
  report('assets', problems);
  return out;
}

export const assets = new Registry<Asset>('assets', parseAssets(raw));
