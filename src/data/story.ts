import raw from './story.json';
import { bool, list, num, obj, Problems, Registry, report, str } from './registry';

// The story: who speaks, and scripts (short scenes) made of steps. A script plays when its map starts and the save's
// flags allow it; its last step usually sets a flag so it does not play again. Edit story.json by hand: changing a
// line, a face or a pause needs no code.

export interface Speaker {
  id: string;
  name: string;
  // "#rrggbb", the colour of their words.
  color: string;
  // Texture shown beside their words unless a line picks another face.
  face: string;
  // Speaks in a small bubble over the hero's head instead of the box at the top.
  bubble: boolean;
}

// One step of a script. Exactly one kind per step:
//   { "say": "timo", "text": "...", "face": "timo_happy" }  a line; the script waits until it has been read
//   { "wait": 1 }                                            a pause, in seconds
//   { "tutorial": "Space to dodge." }                        ghostly words that blow away; the script carries on
//   { "waitFor": "teleport" }                                waits until the player does it: teleport, dash, fire
//   { "flag": "teleportTaught" }                             sets a save flag
export type Step =
  | { kind: 'say'; speaker: Speaker; text: string; face: string }
  | { kind: 'wait'; seconds: number }
  | { kind: 'tutorial'; text: string }
  | { kind: 'waitFor'; event: string }
  | { kind: 'flag'; flag: string };

export interface Script {
  id: string;
  // Plays when this map starts...
  map: string;
  // ...while this save flag is on (empty for always)...
  if: string;
  // ...and this one is off (empty for always).
  unless: string;
  steps: Step[];
}

export const WAIT_EVENTS = ['teleport', 'dash', 'fire'];

function parseSpeakers(data: unknown, problems: Problems): Speaker[] {
  return list(obj(data).speakers, 'story.json speakers', problems).flatMap((entry, i) => {
    const e = obj(entry);
    const id = str(e.id, '', `story.json speaker ${i}`, problems);
    if (!id) return problems.push(`story.json speaker ${i}: has no id, skipped`), [];
    let color = str(e.color, '#f2d7a6', `${id}.color`, problems).toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) {
      problems.push(`${id}.color is ${JSON.stringify(color)}, expected a colour like "#c58cff"`);
      color = '#f2d7a6';
    }
    return [{ id, name: str(e.name, id, `${id}.name`, problems), color, face: str(e.face, '', `${id}.face`, problems), bubble: bool(e.bubble, false, `${id}.bubble`, problems) }];
  });
}

function parseStep(entry: unknown, where: string, speakers: Registry<Speaker>, problems: Problems): Step | null {
  const e = obj(entry);
  if (e.say !== undefined) {
    const speaker = speakers.get(str(e.say, '', `${where}.say`, problems));
    if (!speaker) return problems.push(`${where}: unknown speaker ${JSON.stringify(e.say)}, skipped`), null;
    return { kind: 'say', speaker, text: str(e.text, '', `${where}.text`, problems), face: str(e.face, speaker.face, `${where}.face`, problems) };
  }
  if (e.wait !== undefined) return { kind: 'wait', seconds: num(e.wait, 1, `${where}.wait`, problems) };
  if (e.tutorial !== undefined) return { kind: 'tutorial', text: str(e.tutorial, '', `${where}.tutorial`, problems) };
  if (e.waitFor !== undefined) {
    const event = str(e.waitFor, '', `${where}.waitFor`, problems);
    if (!WAIT_EVENTS.includes(event)) return problems.push(`${where}: waitFor ${JSON.stringify(event)} is not one of ${WAIT_EVENTS.join(', ')}, skipped`), null;
    return { kind: 'waitFor', event };
  }
  if (e.flag !== undefined) return { kind: 'flag', flag: str(e.flag, '', `${where}.flag`, problems) };
  problems.push(`${where}: not a say, wait, tutorial, waitFor or flag step, skipped`);
  return null;
}

function parseStory(data: unknown): { speakers: Registry<Speaker>; scripts: Script[] } {
  const problems: Problems = [];
  const speakers = new Registry<Speaker>('speakers', parseSpeakers(data, problems));
  const scripts = list(obj(data).scripts, 'story.json scripts', problems).flatMap((entry, i): Script[] => {
    const e = obj(entry);
    const id = str(e.id, '', `story.json script ${i}`, problems);
    if (!id) return problems.push(`story.json script ${i}: has no id, skipped`), [];
    const steps = list(e.steps, `${id}.steps`, problems).map((s, j) => parseStep(s, `${id} step ${j}`, speakers, problems)).filter((s): s is Step => !!s);
    return [{ id, map: str(e.map, '', `${id}.map`, problems), if: str(e.if, '', `${id}.if`, problems), unless: str(e.unless, '', `${id}.unless`, problems), steps }];
  });
  report('story', problems);
  return { speakers, scripts };
}

const parsed = parseStory(raw);
export const speakers = parsed.speakers;
export const scripts = new Registry<Script>('scripts', parsed.scripts);

// The script that should play as this map starts, if any.
export function scriptFor(mapId: string, flags: Record<string, boolean>): Script | undefined {
  return scripts.list().find((s) => s.map === mapId && (!s.if || flags[s.if]) && (!s.unless || !flags[s.unless]));
}

// Every flag the story sets or reads, so the dev menu can rewind it.
export function storyFlags(): string[] {
  const out = new Set(['enteredMindscape', 'mindscapeCleared', 'teleport']);
  for (const s of scripts.list()) {
    for (const f of [s.if, s.unless]) if (f) out.add(f);
    for (const step of s.steps) if (step.kind === 'flag') out.add(step.flag);
  }
  return [...out];
}
