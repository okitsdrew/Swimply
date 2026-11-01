import raw from './sounds.json';
import { list, num, obj, Problems, Registry, report, str } from './registry';

// Sound effects and each map's background sounds. The audio files live in src/data/sounds/; sounds.json names
// them, so code and other data refer to a sound by its id, never its file.

export interface Sound {
  id: string;
  // Where the browser loads it from.
  url: string;
  // 0 to 1, how loud this sound is next to the others.
  volume: number;
}

// Background sounds for a map: one of `sounds` (taking turns, in order) every `every` seconds, give or take `jitter`.
export interface Ambience {
  map: string;
  sounds: string[];
  every: number;
  jitter: number;
}

const files = import.meta.glob('./sounds/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function parseSounds(data: unknown): { sounds: Sound[]; ambience: Ambience[] } {
  const problems: Problems = [];
  const sounds = list(obj(data).sounds, 'sounds.json sounds', problems).flatMap((entry, i): Sound[] => {
    const e = obj(entry);
    const id = str(e.id, '', `sounds.json sound ${i}`, problems);
    if (!id) return problems.push(`sounds.json sound ${i}: has no id, skipped`), [];
    const file = str(e.file, '', `${id}.file`, problems);
    const url = files[`./sounds/${file}`];
    if (!url) return problems.push(`${id}: no file src/data/sounds/${file}, skipped`), [];
    return [{ id, url, volume: num(e.volume, 1, `${id}.volume`, problems) }];
  });
  const ids = new Set(sounds.map((s) => s.id));
  const ambience = list(obj(data).ambience, 'sounds.json ambience', problems).map((entry, i): Ambience => {
    const e = obj(entry);
    const w = `sounds.json ambience ${i}`;
    const names = list(e.sounds, `${w}.sounds`, problems).map((s) => str(s, '', `${w} sound`, problems));
    for (const n of names) if (!ids.has(n)) problems.push(`${w}: unknown sound ${JSON.stringify(n)}`);
    return { map: str(e.map, '', `${w}.map`, problems), sounds: names.filter((n) => ids.has(n)), every: num(e.every, 4, `${w}.every`, problems), jitter: num(e.jitter, 0, `${w}.jitter`, problems) };
  });
  report('sounds', problems);
  return { sounds, ambience };
}

const parsed = parseSounds(raw);
export const sounds = new Registry<Sound>('sounds', parsed.sounds);

export function ambienceFor(mapId: string): Ambience | undefined {
  return parsed.ambience.find((a) => a.map === mapId && a.sounds.length);
}
