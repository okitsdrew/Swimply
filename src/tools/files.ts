import { Asset } from '../data/assets';
import { Floor } from '../data/floors';
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
    parts: a.parts.map((p) => compact({ ...p }, { x: 0, y: 0, scale: 1, originX: 0.5, originY: 1, ground: false })),
    collision: a.collision.map((c) => compact({ ...c }, { x: 0, y: 0 })),
  }, { marker: '' })));
}

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export function floorsText(list: Floor[]): string {
  return fileText({}, 'floors', list.map((f) => compact({ id: f.id, name: f.name, colors: f.colors.map(hex), blocks: f.blocks }, { blocks: false })));
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

// Asks the dev server (scripts/data-api.ts) to write the file. Only works under `npm run dev`.
export async function saveFile(file: string, text: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/__swimply/save', { method: 'POST', body: JSON.stringify({ file, text }) });
  } catch {
    throw new Error('the dev server is not running (start it with npm run dev)');
  }
  if (!res.ok) throw new Error(res.status === 404 ? 'saving only works under npm run dev' : await res.text());
}
