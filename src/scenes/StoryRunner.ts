import { save, writeSave } from '../core/save';
import { Script } from '../data/story';
import { DialogueBox } from '../render/DialogueBox';
import { GhostText } from '../render/GhostText';

// What a script can do to the scene beyond talking. The scene provides it.
export interface Stage {
  // A line starts (speaker id and face) or the box closes (null).
  onLine(speaker: string | null, face: string): void;
  setControl(on: boolean): void;
  eyes(open: boolean, seconds: number): void;
  pose(pose: 'asleep' | 'stand', seconds: number): void;
  moveTimo(target: string): void;
  shake(amount: number): void;
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

  stop(): void {
    this.script = null;
    this.box.hide();
    this.stage.onLine(null, '');
  }

  // The player did something a step might be waiting for: "move", "teleport", "dash", "fire".
  notify(event: string): void {
    this.events.add(event);
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
    if (step?.kind !== 'say') {
      this.box.hide();
      this.stage.onLine(null, '');
    }
    if (!step) {
      this.script = null;
      return;
    }
    if (step.kind === 'say') {
      this.box.show(step.speaker.name, step.speaker.color, step.face, step.text, step.speaker.bubble, step.speaker.voice, step.speaker.pitch, step.speaker.lineSounds);
      this.stage.onLine(step.speaker.id, step.face);
    } else if (step.kind === 'tutorial') this.ghost.show(step.text);
    else if (step.kind === 'flag') {
      save.flags[step.flag] = true;
      writeSave();
    } else if (step.kind === 'eyes') this.stage.eyes(step.open, step.seconds);
    else if (step.kind === 'control') this.stage.setControl(step.on);
    else if (step.kind === 'pose') this.stage.pose(step.pose, step.seconds);
    else if (step.kind === 'timo') this.stage.moveTimo(step.target);
    else if (step.kind === 'shake') this.stage.shake(step.amount);
    // Steps that finish at once move on in the next update.
  }
}
