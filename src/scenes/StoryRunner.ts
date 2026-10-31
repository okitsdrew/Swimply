import { save, writeSave } from '../core/save';
import { Script } from '../data/story';
import { DialogueBox } from '../render/DialogueBox';
import { GhostText } from '../render/GhostText';

// Plays one script (data/story.ts) step by step. The scene tells it what the player did (notify) and when F was
// pressed (skip); it drives the dialogue box and the ghostly tutorial words.
export class StoryRunner {
  private script: Script | null = null;
  private index = 0;
  // Seconds into the current step.
  private time = 0;
  // Things the player did since the current step began.
  private events = new Set<string>();

  constructor(private box: DialogueBox, private ghost: GhostText) {}

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
  }

  // The player did something a step might be waiting for: "teleport", "dash", "fire".
  notify(event: string): void {
    this.events.add(event);
  }

  // F: finishes typing a line, or moves on from a typed one.
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
    // A line's read time starts once it has typed out.
    if (step.kind === 'say' && !this.box.typed) this.time = 0;
    const done = step.kind === 'say' ? this.box.typed && this.time >= this.box.readTime
      : step.kind === 'wait' ? this.time >= step.seconds
      : step.kind === 'waitFor' ? this.events.has(step.event)
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
      return;
    }
    if (step.kind === 'say') this.box.show(step.speaker.name, step.speaker.color, step.face, step.text, step.speaker.bubble);
    else if (step.kind === 'tutorial') this.ghost.show(step.text);
    else if (step.kind === 'flag') {
      save.flags[step.flag] = true;
      writeSave();
    }
    // Steps that finish at once (tutorial, flag) move on in the next update.
  }
}
