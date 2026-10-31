import { Asset } from '../data/assets';
import { Floor } from '../data/floors';
import { MAP_FORMAT } from '../data/maps';
import { CLEAR, Sprite, SPRITE_FORMAT } from '../data/sprites';
import { round } from './ui';

// Writes the tools' working copies back to the JSON files in src/data/, in the same hand-written style those
// files already use: defaults are left out, and short lists sit on one line. Only fields the game reads are
// written, so a field added to a file by hand must also be added to its reader in src/data/ to survive a save.

// Short arrays and objects stay on one line; longer ones get a line per item.
function oneLine(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(oneLine).join(', ')}]`;
  if (typeof v === 'object' && v !== null && Object.keys(v).length) return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${oneLine(x)}`).join(', ')} }`;
  return JSON.stringify(v);
}

function pretty(v: unknown, indent = '', expand = false): string {
  const inline = oneLine(v);
  if (typeof v !== 'object' || v === null || (!expand && indent.length + inline.length <= 100)) return inline;
  const next = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => next + pretty(x, next)).join(',\n')}\n${indent}]`;
  // A sprite's rows always stack, so the file shows the drawing.
  const lines = Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${pretty(x, next, k === 'rows')}`);
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

// Each entry gets a line per field, so a change to one field shows as one changed line in a diff.
function fileText(top: Record<string, unknown>, key: string, entries: unknown[]): string {
  const head = Object.entries(top).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`).join('');
  const body = entries.map((e) => '    ' + pretty(e, '    ', true)).join(',\n');
  return `{\n${head}  ${JSON.stringify(key)}: [${entries.length ? `\n${body}\n  ` : ''}]\n}\n`;
}

// Renames one entry's id in a data file's text (floors.json, assets.json), keeping every other field as it is. Its
// name follows if it was just the id.
export function renameInDataFile(text: string, key: string, from: string, to: string): string {
  const d = JSON.parse(text) as Record<string, unknown>;
  const list = d[key];
  if (!Array.isArray(list)) throw new Error(`the file has no "${key}" list`);
  const entries = list as Record<string, unknown>[];
  if (entries.some((e) => e.id === to)) throw new Error(`there is already one called "${to}"`);
  const e = entries.find((x) => x.id === from);
  if (!e) throw new Error(`there is no "${from}" in the file`);
  if (e.name === from) e.name = to;
  e.id = to;
  return fileText(Object.fromEntries(Object.entries(d).filter(([k]) => k !== key)), key, entries);
}

// Leaves out a field when it equals its default, so files stay as short as the hand-written ones.
function compact(o: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k in defaults && defaults[k] === v) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = typeof v === 'number' ? round(v) : v;
  }
  return out;
}

export function assetsText(list: Asset[]): string {
  return fileText({}, 'assets', list.map((a) => compact({
    id: a.id,
    name: a.name,
    category: a.category,
    marker: a.marker,
    parts: a.parts.map((p) => compact({ ...p, fps: p.frames?.length ? p.fps : 8 }, { x: 0, y: 0, scale: 1, originX: 0.5, originY: 1, ground: false, fps: 8 })),
    collision: a.collision.map((c) => compact({ ...c }, { x: 0, y: 0 })),
    light: a.light ? compact({ ...a.light }, { x: 0, y: 0, flicker: 0 }) : null,
  }, { marker: '', light: null })));
}

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export function floorsText(list: Floor[]): string {
  return fileText({}, 'floors', list.map((f) => compact({ id: f.id, name: f.name, colors: f.colors.map(hex), blocks: f.blocks, hurts: f.hurts }, { blocks: false, hurts: false })));
}

export function spritesText(list: Sprite[]): string {
  return fileText({ format: SPRITE_FORMAT }, 'sprites', list.map((s) => {
    const rows: string[] = [];
    for (let y = 0; y < s.height; y++) {
      let r = '';
      for (let x = 0; x < s.width; x++) {
        const j = s.pixels[y * s.width + x];
        r += j < 0 ? CLEAR : s.palette[j].ch;
      }
      rows.push(r);
    }
    return { id: s.id, name: s.name, palette: Object.fromEntries(s.palette.map((c) => [c.ch, c.hex])), rows };
  }));
}

// Writes a map in the style of the hand-written ones: the floor as one row of characters per line, and one line per
// placed object. A floor keeps its character from `legend` (the file's own legend) where it has one.
export interface MapFile {
  name: string;
  tileSize: number;
  cols: number;
  // cols * rows floor ids, row by row.
  tiles: string[];
  objects: { asset: string; x: number; y: number; size: number; if?: string; unless?: string; to?: string }[];
  legend: Record<string, string>;
  darkness: number;
}

// Characters for floors that have none yet: easy to tell apart in a text editor.
const FLOOR_CHARS = '.~#,:;=+*%&@^-_ox$!?abcdefghijklmnpqrstuvwyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function mapText(m: MapFile): string {
  const charOf = new Map<string, string>();
  const legend: Record<string, string> = {};
  const used = new Set(m.tiles);
  for (const [ch, id] of Object.entries(m.legend)) {
    if (used.has(id) && !charOf.has(id)) {
      charOf.set(id, ch);
      legend[ch] = id;
    }
  }
  for (const id of used) {
    if (charOf.has(id)) continue;
    const ch = [...FLOOR_CHARS].find((c) => !(c in legend))!;
    charOf.set(id, ch);
    legend[ch] = id;
  }
  const rows: string[] = [];
  for (let i = 0; i < m.tiles.length; i += m.cols) rows.push(m.tiles.slice(i, i + m.cols).map((id) => charOf.get(id)).join(''));
  const objects = m.objects.map((o) => '    ' + oneLine(compact({ asset: o.asset, x: o.x, y: o.y, size: o.size, if: o.if ?? '', unless: o.unless ?? '', to: o.to ?? '' }, { size: 1, if: '', unless: '', to: '' })));
  const legendLines = Object.entries(legend).map(([ch, id]) => `    ${JSON.stringify(ch)}: ${JSON.stringify(id)}`);
  return `{
  "format": ${MAP_FORMAT},
  "kind": "area",
  "name": ${JSON.stringify(m.name)},
  "tileSize": ${m.tileSize},${m.darkness ? `\n  "darkness": ${round(m.darkness)},` : ''}
  "legend": {
${legendLines.join(',\n')}
  },
  "floor": [
${rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}
  ],
  "objects": [${objects.length ? `\n${objects.join(',\n')}\n  ` : ''}]
}
`;
}

async function post(path: string, body: unknown): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', body: JSON.stringify(body) });
  } catch {
    throw new Error('the dev server is not running (start it with npm run dev)');
  }
  if (!res.ok) throw new Error(res.status === 404 ? 'saving only works under npm run dev' : await res.text());
}

// Asks the dev server (scripts/data-api.ts) to write the file. Only works under `npm run dev`. With `expect` (the
// text the tool last read or wrote, or null for a new file), the server refuses if someone else changed the file.
export function saveFile(file: string, text: string, expect?: string | null): Promise<void> {
  return post('/__swimply/save', { file, text, expect });
}

export function deleteFile(file: string, expect?: string): Promise<void> {
  return post('/__swimply/delete', { file, expect });
}

// Every map file's text as it is on disk now, by map id.
export async function readMapFiles(): Promise<Record<string, string>> {
  const res = await fetch('/__swimply/maps');
  if (!res.ok) throw new Error('reading maps only works under npm run dev');
  return (await res.json()) as Record<string, string>;
}

// One data file's text as it is on disk now, or null if there is none.
export async function readFile(file: string): Promise<string | null> {
  const res = await fetch(`/__swimply/read?file=${encodeURIComponent(file)}`);
  return res.ok ? res.text() : null;
}

// The asset and floor ids a map file uses, read straight from its JSON, so ids the tool's own registries do not
// know yet (made since the page opened) still count.
export function idsInMap(text: string): { assets: Set<string>; floors: Set<string> } {
  const assets = new Set<string>();
  const floors = new Set<string>();
  try {
    const d = JSON.parse(text) as { legend?: Record<string, string>; floor?: string[]; objects?: { asset?: string }[] };
    for (const o of d.objects ?? []) if (typeof o?.asset === 'string') assets.add(o.asset);
    const chars = new Set((d.floor ?? []).join(''));
    for (const [ch, id] of Object.entries(d.legend ?? {})) if (chars.has(ch)) floors.add(id);
  } catch {
    // A broken map file uses nothing we can tell.
  }
  return { assets, floors };
}
