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

// What plays when something happens in the game, by event: teleport, dash, fire (a bow shot), hit (an arrow hits),
// death (the hero dies), portal (going into the Mindscape), door (going through a door to another calm map), step
// (a footstep), wolfAttack (the werewolf starts his dash's or swipe's windup or leaves the ground for his
// jump), wolfSmash (his dash ends or he lands), wolfSwipe (his swipe lands), and on screens: click (a menu button), next (moving on through dialogue),
// buy (taking a memory on the tree), deny (one that can't be taken), treeOpen (the tree screen opens).
// An event names one sound id, or a list that all play together.
export const EFFECT_EVENTS = ['teleport', 'dash', 'fire', 'hit', 'death', 'portal', 'door', 'step', 'wolfAttack', 'wolfSmash', 'wolfSwipe', 'click', 'next', 'buy', 'deny', 'treeOpen', 'unlock'] as const;
export type EffectEvent = (typeof EFFECT_EVENTS)[number];

const files = import.meta.glob('./sounds/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function parseSounds(data: unknown): { sounds: Sound[]; ambience: Ambience[]; effects: Partial<Record<EffectEvent, string[]>> } {
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
  const effects: Partial<Record<EffectEvent, string[]>> = {};
  for (const [event, value] of Object.entries(obj(obj(data).effects))) {
    const w = `sounds.json effects.${event}`;
    if (!(EFFECT_EVENTS as readonly string[]).includes(event)) {
      problems.push(`sounds.json effects: unknown event "${event}" (known: ${EFFECT_EVENTS.join(', ')})`);
      continue;
    }
    const names = (Array.isArray(value) ? value : [value]).map((v) => str(v, '', w, problems));
    for (const n of names) if (!ids.has(n)) problems.push(`${w}: unknown sound ${JSON.stringify(n)}`);
    effects[event as EffectEvent] = names.filter((n) => ids.has(n));
  }
  report('sounds', problems);
  return { sounds, ambience, effects };
}

const parsed = parseSounds(raw);
export const sounds = new Registry<Sound>('sounds', parsed.sounds);

// The sounds for a game event, none if it has none.
export function effectSounds(event: EffectEvent): Sound[] {
  return (parsed.effects[event] ?? []).flatMap((id) => sounds.get(id) ?? []);
}

export function ambienceFor(mapId: string): Ambience | undefined {
  return parsed.ambience.find((a) => a.map === mapId && a.sounds.length);
}
