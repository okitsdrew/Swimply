import raw from './sprites.json';
import { list, obj, Problems, Registry, report, str } from './registry';

// Pixel art drawn in the asset maker. Each sprite becomes a texture under its id, so a sprite named like a
// code-drawn texture ("pillar", "shade_0") replaces that art in the game, and deleting the sprite brings the code
// art back. Stored as rows of characters plus a palette, like a map's floor, so a change reads well in a git diff:
//
//   "palette": { "a": "#3a3350", "b": "#2b2638cc" },
//   "rows": ["..aa..", ".abba.", "..aa.."]
//
// "." is always see-through. A colour is "#rrggbb", or "#rrggbbaa" for one that is partly see-through.

export const SPRITE_FORMAT = 1;
export const CLEAR = '.';

export interface SpriteColor {
  // The character that stands for this colour in `rows`.
  ch: string;
  // "#rrggbb" or "#rrggbbaa".
  hex: string;
}

export interface Sprite {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: SpriteColor[];
  // width * height palette indexes, row by row; -1 is see-through.
  pixels: number[];
}

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);

// "#rrggbb(aa)" -> [r, g, b, a], each 0 to 255.
export function rgba(hex: string): [number, number, number, number] {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [n(1), n(3), n(5), hex.length === 9 ? n(7) : 255];
}

export function parseSprite(entry: unknown, i: number, problems: Problems): Sprite | null {
  const e = obj(entry);
  const id = str(e.id, '', `sprites.json sprite ${i}`, problems);
  if (!id) {
    problems.push(`sprites.json sprite ${i}: has no id, skipped`);
    return null;
  }
  const palette: SpriteColor[] = [];
  for (const [ch, hex] of Object.entries(obj(e.palette))) {
    if (ch.length !== 1 || ch === CLEAR) problems.push(`${id}: palette key "${ch}" must be one character other than "${CLEAR}"`);
    else if (!isHex(hex)) problems.push(`${id}: palette "${ch}" is ${JSON.stringify(hex)}, expected a colour like "#3a3350"`);
    else palette.push({ ch, hex: hex.toLowerCase() });
  }
  const rows = list(e.rows, `${id}.rows`, problems).map((r) => (typeof r === 'string' ? r : ''));
  const height = rows.length;
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!width || !height) {
    problems.push(`${id}: has no rows, skipped`);
    return null;
  }
  const index = new Map(palette.map((c, j) => [c.ch, j]));
  const pixels: number[] = [];
  rows.forEach((r, y) => {
    if (r.length !== width) problems.push(`${id}: row ${y} is ${r.length} long, not ${width}; padded with see-through`);
    for (let x = 0; x < width; x++) {
      const ch = r[x] ?? CLEAR;
      const j = ch === CLEAR ? -1 : index.get(ch);
      if (j === undefined) problems.push(`${id}: row ${y} uses "${ch}", which is not in the palette; drawn see-through`);
      pixels.push(j ?? -1);
    }
  });
  return { id, name: str(e.name, id, `${id}.name`, problems), width, height, palette, pixels };
}

function parseSprites(data: unknown): Sprite[] {
  const problems: Problems = [];
  const d = obj(data);
  if (typeof d.format === 'number' && d.format > SPRITE_FORMAT) {
    problems.push(`sprites.json: format ${d.format} is newer than this game knows (${SPRITE_FORMAT}), not loaded`);
    report('sprites', problems);
    return [];
  }
  const out: Sprite[] = [];
  list(d.sprites, 'sprites.json', problems).forEach((entry, i) => {
    const s = parseSprite(entry, i, problems);
    if (s) out.push(s);
  });
  report('sprites', problems);
  return out;
}

export const sprites = new Registry<Sprite>('sprites', parseSprites(raw));
