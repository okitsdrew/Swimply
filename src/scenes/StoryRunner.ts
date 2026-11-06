import { dialogue } from '../config/story';
import { save, writeSave } from '../core/save';
import { PoseFrame, Script, Step } from '../data/story';
import { DialogueBox } from '../render/DialogueBox';
import { GhostText } from '../render/GhostText';

// What a script can do to the scene beyond talking. The scene provides it.
export interface Stage {
  // A line starts (speaker id and face), or the script ends (null).
  onLine(speaker: string | null, face: string): void;
  // A flag step turned a save flag on.
  flag(flag: string): void;
  sound(id: string): void;
  setControl(on: boolean): void;
  eyes(open: boolean, seconds: number): void;
  pose(pose: 'asleep' | 'stand', seconds: number, frames: PoseFrame[]): void;
  moveTimo(target: string): void;
  shake(amount: number): void;
  camera(target: string, seconds: number): void;
  walk(target: string): void;
  // Still walking to where a walk step sent him.
  readonly walking: boolean;
  dash(target: string): void;
  // Still in a dash that a dash step started.
  readonly dashing: boolean;
  // A standing boss's look, her butterfly, a bubble over her, and her fading away.
  look(who: string, face: string): void;
  butterfly(on: boolean): void;
  bark(who: string, color: string, text: string, seconds: number): void;
  defeat(who: string): void;
  // Still fading away.
  readonly defeating: boolean;
  vestige(id: string): void;
}

// Plays one script (data/story.ts) step by step. The scene tells it what the player did (notify) and when F was
// pressed (skip); it drives the dialogue box, the ghostly tutorial words and, through the stage, everything else.
export class StoryRunner {
  private script: Script | null = null;
  private index = 0;
  // Seconds into the current step.
  private time = 0;
  // Things the player did since the current step began.
  private events = new Set<string>();
  // Tutorial words on screen that wait for the player to do this, or ''.
  private heldUntil = '';

  constructor(private box: DialogueBox, private ghost: GhostText, private stage: Stage) {}

  get playing(): boolean {
    return this.script !== null;
  }

  // A line is up, so F belongs to the dialogue.
  get talking(): boolean {
    return this.script?.steps[this.index]?.kind === 'say';
  }

  play(script: Script): void {
    this.script = script;
    this.index = -1;
    this.next();
  }

  // A script of bubbles, said at once without stopping (or counting as) whatever is playing.
  aside(script: Script): void {
    for (const s of script.steps) if (s.kind === 'bark') this.bark(s);
  }

  private bark(s: Extract<Step, { kind: 'bark' }>): void {
    this.stage.bark(s.speaker.id, s.speaker.color, s.text, s.seconds || dialogue.barkTime);
  }

  stop(): void {
    this.script = null;
    this.box.hide();
    this.stage.onLine(null, '');
  }

  // The player did something a step might be waiting for: "move", "teleport", "dash", "fire", "vestige".
  notify(event: string): void {
    this.events.add(event);
    if (event === this.heldUntil) {
      this.heldUntil = '';
      this.ghost.release();
    }
  }

  // Click or F: finishes typing a line, or moves on from a typed one. Lines never move on by themselves.
  skip(): void {
    const step = this.script?.steps[this.index];
    if (step?.kind !== 'say') return;
    if (!this.box.typed) this.box.finish();
    else this.next();
  }

  update(dt: number): void {
    const step = this.script?.steps[this.index];
    if (!step) return;
    this.time += dt;
    const done = step.kind === 'say' ? false
      : step.kind === 'wait' ? this.time >= step.seconds
      : step.kind === 'waitFor' ? this.events.has(step.event)
      : step.kind === 'eyes' ? !step.open || this.time >= step.seconds
      : step.kind === 'camera' ? this.time >= step.seconds
      : step.kind === 'walk' ? !this.stage.walking
      : step.kind === 'dash' ? !this.stage.dashing
      : step.kind === 'defeat' ? !this.stage.defeating
      : true;
    if (done) this.next();
  }

  private next(): void {
    const s = this.script;
    if (!s) return;
    this.index++;
    this.time = 0;
    this.events.clear();
    const step = s.steps[this.index];
    if (step?.kind !== 'say') this.box.hide();
    if (!step) {
      this.script = null;
      this.stage.onLine(null, '');
      return;
    }
    if (step.kind === 'say') {
      this.box.show(step.speaker.name, step.speaker.color, step.face, step.text, step.speaker.bubble, step.speaker.voice, step.speaker.pitch, step.speaker.lineSounds);
      this.stage.onLine(step.speaker.id, step.face);
    } else if (step.kind === 'tutorial') {
      this.heldUntil = step.until;
      this.ghost.show(step.text, step.until ? Infinity : undefined);
    }
    else if (step.kind === 'flag') {
      save.flags[step.flag] = true;
      writeSave();
      this.stage.flag(step.flag);
    } else if (step.kind === 'eyes') this.stage.eyes(step.open, step.seconds);
    else if (step.kind === 'control') this.stage.setControl(step.on);
    else if (step.kind === 'pose') this.stage.pose(step.pose, step.seconds, step.frames);
    else if (step.kind === 'timo') this.stage.moveTimo(step.target);
    else if (step.kind === 'shake') this.stage.shake(step.amount);
    else if (step.kind === 'camera') this.stage.camera(step.target, step.seconds);
    else if (step.kind === 'walk') this.stage.walk(step.target);
    else if (step.kind === 'dash') this.stage.dash(step.target);
    else if (step.kind === 'look') this.stage.look(step.who, step.face);
    else if (step.kind === 'butterfly') this.stage.butterfly(step.on);
    else if (step.kind === 'bark') this.bark(step);
    else if (step.kind === 'defeat') this.stage.defeat(step.who);
    else if (step.kind === 'vestige') this.stage.vestige(step.id);
    else if (step.kind === 'sound') this.stage.sound(step.id);
    // Steps that finish at once move on in the next update.
  }
}
