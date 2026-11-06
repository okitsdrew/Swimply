import raw from './story.json';
import { bool, list, num, obj, Problems, Registry, report, str } from './registry';
import { vestiges } from './vestiges';

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
  // Their "voice": a sound id (sounds.json) played every few letters as a line types out, and how high it is
  // (1 as recorded, 2 an octave up). Empty for silent.
  voice: string;
  pitch: number;
  // Sound ids played one at a time, taking turns, as each of their lines starts (for a speaker whose lines are only
  // dots). Empty for none.
  lineSounds: string[];
}

// One step of a script. Exactly one kind per step:
//   { "say": "timo", "text": "...", "face": "timo_happy" }  a line; the script waits until it has been read
//   { "wait": 1 }                                            a pause, in seconds
//   { "tutorial": "Space to dodge." }                        ghostly words that blow away; the script carries on
//   { "tutorial": "Right click to teleport", "until": "teleport" }
//                                                            ...that stay until the player does it (see waitFor)
//   { "waitFor": "teleport" }                                waits until the player does it: move, teleport, dash, fire, vestige
//   { "flag": "teleportTaught" }                             sets a save flag; things in the map that wait on it
//                                                            (only if / only unless) come or go at once
//   { "eyes": "closed" }                                     a black screen (his eyes shut)
//   { "eyes": "open", "time": 3 }                            opens them with a few heavy blinks; the script waits
//   { "control": false }                                     the player cannot move (true gives it back)
//   { "pose": "asleep" }                                     the hero lies on the ground
//   { "pose": "stand", "time": 3 }                           he gets up; the script carries on meanwhile
//   { "pose": "stand", "frames": [{ "frame": 0, "time": 0.5 }, { "frame": 1, "time": 1 }] }
//                                                            ...showing hero_getup_0, _1... in this order, each
//                                                            for its own time (a frame can come back, to hold a struggle)
//   { "timo": "bow_pedestal" }                               Timo floats over beside the first placed thing of
//                                                            that asset id; "hero" to follow the hero again
//   { "shake": 6 }                                           shakes the screen (an explosion nearby)
//   { "camera": "throne", "time": 1.5 }                      slides the camera to the first placed thing of that
//                                                            asset id (or a spot, "800,640"), taking `time` seconds;
//                                                            the script waits. "hero" slides back and follows him
//   { "walk": "throne" }                                     he walks up to the first placed thing of that asset id
//                                                            (or to a spot, "800,640") on his own; the script waits
//                                                            while Timo leads the way
//   { "timo": "hide" }  { "timo": "pop" }                    Timo is hidden inside him, or pops back out in a puff
//   { "look": "kate", "face": "kate_surprised" }             how a standing boss looks, without a line. A line of hers
//                                                            sets it too, to that line's face; it stays until changed
//   { "butterfly": false }                                   the fire butterfly hides in her, or (true) comes out
//   { "bark": "kate", "text": "...", "time": 2.5 }           a small bubble over her that fades by itself and stops
//                                                            nothing (`time` is optional; dialogue.barkTime otherwise)
//   { "defeat": "kate" }                                     a beaten boss fades away and is gone; the script waits
//   { "vestige": "doomsday" }                                he reclaims that Vestige: a banner, and it fills an
//                                                            empty slot
//   { "sound": "explosion_medium" }                          plays a sound (an id in sounds.json); carries on
// Timo keeps the face of his last line (through pauses and others' lines) until a line of his names another, and
// goes back to idling when the script ends. "timo_idle" is his idle look.
export type Step =
  | { kind: 'say'; speaker: Speaker; text: string; face: string }
  | { kind: 'wait'; seconds: number }
  | { kind: 'tutorial'; text: string; until: string }
  | { kind: 'waitFor'; event: string }
  | { kind: 'flag'; flag: string }
  | { kind: 'eyes'; open: boolean; seconds: number }
  | { kind: 'control'; on: boolean }
  | { kind: 'pose'; pose: 'asleep' | 'stand'; seconds: number; frames: PoseFrame[] }
  | { kind: 'timo'; target: string }
  | { kind: 'shake'; amount: number }
  | { kind: 'camera'; target: string; seconds: number }
  | { kind: 'walk'; target: string }
  | { kind: 'look'; who: string; face: string }
  | { kind: 'butterfly'; on: boolean }
  | { kind: 'bark'; speaker: Speaker; text: string; seconds: number }
  | { kind: 'defeat'; who: string }
  | { kind: 'vestige'; id: string }
  | { kind: 'sound'; id: string };

// One getting-up frame (hero_getup_<frame>) and how long it shows.
export interface PoseFrame {
  frame: number;
  seconds: number;
}

export interface Script {
  id: string;
  // Plays when this map starts...
  map: string;
  // ...while these save flags are all on...
  if: string[];
  // ...and these are all off. In the file, one flag or a list.
  unless: string[];
  steps: Step[];
}

export const WAIT_EVENTS = ['move', 'teleport', 'dash', 'fire', 'vestige'];

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
    return [{ id, name: str(e.name, id, `${id}.name`, problems), color, face: str(e.face, '', `${id}.face`, problems), bubble: bool(e.bubble, false, `${id}.bubble`, problems), voice: str(e.voice, '', `${id}.voice`, problems), pitch: num(e.pitch, 1, `${id}.pitch`, problems), lineSounds: list(e.lineSounds ?? [], `${id}.lineSounds`, problems).map((s) => str(s, '', `${id}.lineSounds`, problems)) }];
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
  if (e.tutorial !== undefined) {
    const until = str(e.until, '', `${where}.until`, problems);
    if (until && !WAIT_EVENTS.includes(until)) return problems.push(`${where}: until ${JSON.stringify(until)} is not one of ${WAIT_EVENTS.join(', ')}, skipped`), null;
    return { kind: 'tutorial', text: str(e.tutorial, '', `${where}.tutorial`, problems), until };
  }
  if (e.waitFor !== undefined) {
    const event = str(e.waitFor, '', `${where}.waitFor`, problems);
    if (!WAIT_EVENTS.includes(event)) return problems.push(`${where}: waitFor ${JSON.stringify(event)} is not one of ${WAIT_EVENTS.join(', ')}, skipped`), null;
    return { kind: 'waitFor', event };
  }
  if (e.flag !== undefined) return { kind: 'flag', flag: str(e.flag, '', `${where}.flag`, problems) };
  if (e.eyes !== undefined) {
    const eyes = str(e.eyes, '', `${where}.eyes`, problems);
    if (eyes !== 'open' && eyes !== 'closed') return problems.push(`${where}: eyes must be "open" or "closed", skipped`), null;
    return { kind: 'eyes', open: eyes === 'open', seconds: num(e.time, 3, `${where}.time`, problems) };
  }
  if (e.control !== undefined) return { kind: 'control', on: bool(e.control, true, `${where}.control`, problems) };
  if (e.pose !== undefined) {
    const pose = str(e.pose, '', `${where}.pose`, problems);
    if (pose !== 'asleep' && pose !== 'stand') return problems.push(`${where}: pose must be "asleep" or "stand", skipped`), null;
    const frames = list(e.frames, `${where}.frames`, problems).map((f, i): PoseFrame => {
      const o = obj(f);
      return { frame: Math.max(0, Math.round(num(o.frame, 0, `${where}.frames ${i}.frame`, problems))), seconds: Math.max(0, num(o.time, 0.5, `${where}.frames ${i}.time`, problems)) };
    });
    const total = frames.reduce((t, f) => t + f.seconds, 0);
    return { kind: 'pose', pose, seconds: frames.length ? total : num(e.time, 3, `${where}.time`, problems), frames };
  }
  if (e.timo !== undefined) return { kind: 'timo', target: str(e.timo, 'hero', `${where}.timo`, problems) };
  if (e.shake !== undefined) return { kind: 'shake', amount: num(e.shake, 6, `${where}.shake`, problems) };
  if (e.camera !== undefined) return { kind: 'camera', target: str(e.camera, 'hero', `${where}.camera`, problems), seconds: Math.max(0, num(e.time, 1.2, `${where}.time`, problems)) };
  if (e.walk !== undefined) return { kind: 'walk', target: str(e.walk, '', `${where}.walk`, problems) };
  if (e.vestige !== undefined) {
    const id = str(e.vestige, '', `${where}.vestige`, problems);
    if (!vestiges.get(id)) return problems.push(`${where}: unknown vestige ${JSON.stringify(id)} (see vestiges.json), skipped`), null;
    return { kind: 'vestige', id };
  }
  if (e.look !== undefined) return { kind: 'look', who: str(e.look, '', `${where}.look`, problems), face: str(e.face, '', `${where}.face`, problems) };
  if (e.butterfly !== undefined) return { kind: 'butterfly', on: bool(e.butterfly, true, `${where}.butterfly`, problems) };
  if (e.bark !== undefined) {
    const speaker = speakers.get(str(e.bark, '', `${where}.bark`, problems));
    if (!speaker) return problems.push(`${where}: unknown speaker ${JSON.stringify(e.bark)}, skipped`), null;
    return { kind: 'bark', speaker, text: str(e.text, '', `${where}.text`, problems), seconds: e.time === undefined ? 0 : Math.max(0, num(e.time, 0, `${where}.time`, problems)) };
  }
  if (e.defeat !== undefined) return { kind: 'defeat', who: str(e.defeat, '', `${where}.defeat`, problems) };
  if (e.sound !== undefined) return { kind: 'sound', id: str(e.sound, '', `${where}.sound`, problems) };
  problems.push(`${where}: not a known kind of step (say, wait, tutorial, waitFor, flag, eyes, control, pose, timo, shake, camera, walk, look, butterfly, bark, defeat, vestige, sound), skipped`);
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
    const flags = (v: unknown, w: string): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map((f) => str(f, '', w, problems)).filter(Boolean);
    return [{ id, map: str(e.map, '', `${id}.map`, problems), if: flags(e.if, `${id}.if`), unless: flags(e.unless, `${id}.unless`), steps }];
  });
  report('story', problems);
  return { speakers, scripts };
}

const parsed = parseStory(raw);
export const speakers = parsed.speakers;
export const scripts = new Registry<Script>('scripts', parsed.scripts);

// The script that should play as this map starts, if any.
export function scriptFor(mapId: string, flags: Record<string, boolean>): Script | undefined {
  return scripts.list().find((s) => s.map === mapId && s.if.every((f) => flags[f]) && !s.unless.some((f) => flags[f]));
}

// Every flag the story sets or reads, so the dev menu can rewind it.
export function storyFlags(): string[] {
  const out = new Set(['enteredMindscape', 'mindscapeCleared', 'teleport']);
  for (const s of scripts.list()) {
    for (const f of [...s.if, ...s.unless]) out.add(f);
    for (const step of s.steps) if (step.kind === 'flag') out.add(step.flag);
  }
  return [...out];
}
