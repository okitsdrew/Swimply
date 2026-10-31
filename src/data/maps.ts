import { Asset, assets } from './assets';
import { Floor, floors } from './floors';
import { list, num, obj, Problems, Registry, report, str } from './registry';

// Map files live in src/data/maps/<id>.json; the file name is the map's id. The floor is stored as rows of
// characters plus a legend, so a file stays small and a change to it reads well in a git diff:
//
//   "legend": { ".": "stone", "~": "water" },
//   "floor": ["....", ".~~.", "...."]
//
// The rows are the top-down view: row 0 is world y 0, character 0 is world x 0, each one tile across. On screen
// the iso projection turns this 45 degrees, so the top-left character is the diamond's top corner.

export const MAP_FORMAT = 1;

// One thing placed in a map. x and y are world units from the map's top-left corner.
export interface Placed {
  asset: Asset;
  x: number;
  y: number;
  // Scales the asset's art and collision together.
  size: number;
}

export interface AreaMap {
  id: string;
  name: string;
  tileSize: number;
  cols: number;
  rows: number;
  // The file's legend, character to floor id, so a tool that saves the map can keep the same characters.
  legend: Record<string, string>;
  // Row by row, cols * rows entries.
  tiles: Floor[];
  objects: Placed[];
  // 0 to 1: how dark the map is away from lights. 0 is no darkness at all.
  darkness: number;
}

export function tileAt(map: AreaMap, col: number, row: number): Floor | undefined {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return undefined;
  return map.tiles[row * map.cols + col];
}

// The first placed marker of a kind, such as "playerStart".
export function findMarker(map: AreaMap, marker: string): Placed | undefined {
  return map.objects.find((o) => o.asset.marker === marker);
}

// migrations[n] turns a format-n map file into format n+1. Add one whenever MAP_FORMAT goes up, so every map
// already saved keeps loading.
const migrations: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

export function parseMap(id: string, data: unknown, problems: Problems): AreaMap | null {
  let d = obj(data);
  const where = `maps/${id}.json`;
  let format = num(d.format, 0, `${where}.format`, problems);
  if (format > MAP_FORMAT) {
    problems.push(`${where}: format ${format} is newer than this game knows (${MAP_FORMAT}), not loaded`);
    return null;
  }
  while (format < MAP_FORMAT) {
    const step = migrations[format];
    if (!step) {
      problems.push(`${where}: no migration from format ${format}, not loaded`);
      return null;
    }
    d = step(d);
    format++;
  }
  if (str(d.kind, 'area', `${where}.kind`, problems) !== 'area') {
    problems.push(`${where}: only "area" maps exist, not loaded`);
    return null;
  }

  const legend = new Map<string, Floor>();
  for (const [ch, floorId] of Object.entries(obj(d.legend))) {
    const f = typeof floorId === 'string' ? floors.get(floorId) : undefined;
    if (ch.length !== 1) problems.push(`${where}: legend key "${ch}" must be one character`);
    else if (!f) problems.push(`${where}: legend "${ch}" names unknown floor ${JSON.stringify(floorId)}`);
    else legend.set(ch, f);
  }
  const legendIds = Object.fromEntries([...legend].map(([ch, f]) => [ch, f.id]));
  const fallback = legend.values().next().value ?? floors.list()[0];
  if (!fallback) {
    problems.push(`${where}: no floors defined, not loaded`);
    return null;
  }

  const rowsText = list(d.floor, `${where}.floor`, problems).map((r) => (typeof r === 'string' ? r : ''));
  const rows = rowsText.length;
  const cols = Math.max(0, ...rowsText.map((r) => r.length));
  if (!rows || !cols) {
    problems.push(`${where}: the floor has no rows, not loaded`);
    return null;
  }
  const tiles: Floor[] = [];
  rowsText.forEach((r, y) => {
    if (r.length !== cols) problems.push(`${where}: floor row ${y} is ${r.length} long, not ${cols}; padded with "${fallback.id}"`);
    for (let x = 0; x < cols; x++) {
      const ch = r[x];
      const f = ch === undefined ? fallback : legend.get(ch);
      if (!f) problems.push(`${where}: row ${y} column ${x} uses "${ch}", which is not in the legend`);
      tiles.push(f ?? fallback);
    }
  });

  const objects: Placed[] = [];
  list(d.objects, `${where}.objects`, problems).forEach((entry, i) => {
    const e = obj(entry);
    const w = `${where} object ${i}`;
    const assetId = str(e.asset, '', `${w}.asset`, problems);
    const asset = assets.get(assetId);
    if (!asset) return problems.push(`${w}: unknown asset ${JSON.stringify(assetId)}, skipped`);
    objects.push({ asset, x: num(e.x, 0, `${w}.x`, problems), y: num(e.y, 0, `${w}.y`, problems), size: num(e.size, 1, `${w}.size`, problems) });
  });

  return { id, name: str(d.name, id, `${where}.name`, problems), tileSize: num(d.tileSize, 64, `${where}.tileSize`, problems), cols, rows, legend: legendIds, tiles, objects, darkness: num(d.darkness, 0, `${where}.darkness`, problems) };
}

function loadAll(): AreaMap[] {
  const problems: Problems = [];
  const out: AreaMap[] = [];
  const files = import.meta.glob('./maps/*.json', { eager: true, import: 'default' });
  for (const [path, data] of Object.entries(files)) {
    const id = path.replace(/^.*\//, '').replace(/\.json$/, '');
    const map = parseMap(id, data, problems);
    if (map) out.push(map);
  }
  report('maps', problems);
  return out;
}

export const maps = new Registry<AreaMap>('maps', loadAll());
