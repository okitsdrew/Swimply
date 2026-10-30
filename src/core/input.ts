// Gameplay reads actions from here, never raw keys, so a gamepad source can be added later.
// The dev menu listens for its own key (the backtick), so it is not an action.

export type Action =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'fire'
  | 'dash'
  | 'teleport';

export interface InputSource {
  // Actions currently held.
  readonly held: Set<Action>;
  // Actions pressed since the last frame, so taps shorter than a frame aren't lost.
  readonly pressed: Set<Action>;
  // Actions released since the last frame.
  readonly released: Set<Action>;
  // Analog move in screen space (x right, y down), length <= 1. Null if this source has no stick.
  moveAxis(): { x: number; y: number } | null;
  // Aim point in canvas pixels, or null if this source doesn't aim with a pointer.
  aimPoint(): { x: number; y: number } | null;
  endFrame(): void;
  destroy(): void;
}

const keyBindings: Record<string, Action> = {
  KeyW: 'moveUp',
  KeyS: 'moveDown',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  Space: 'dash',
};

const mouseBindings: Record<number, Action> = {
  0: 'fire',
  2: 'teleport',
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'number');
}

export class KeyboardMouseSource implements InputSource {
  readonly held = new Set<Action>();
  readonly pressed = new Set<Action>();
  readonly released = new Set<Action>();
  private pointer: { x: number; y: number } | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.listen(window, 'keydown', (e: KeyboardEvent) => {
      const action = keyBindings[e.code];
      if (!action || isTyping(e.target)) return;
      e.preventDefault();
      if (!e.repeat) this.press(action);
    });
    this.listen(window, 'keyup', (e: KeyboardEvent) => {
      const action = keyBindings[e.code];
      if (action) this.release(action);
    });
    this.listen(canvas, 'mousedown', (e: MouseEvent) => {
      const action = mouseBindings[e.button];
      if (action) this.press(action);
    });
    this.listen(window, 'mouseup', (e: MouseEvent) => {
      const action = mouseBindings[e.button];
      if (action) this.release(action);
    });
    this.listen(window, 'mousemove', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
      };
    });
    this.listen(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    this.listen(window, 'blur', () => this.held.clear());
  }

  private listen<E extends Event>(target: EventTarget, type: string, fn: (e: E) => void): void {
    const handler = fn as EventListener;
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  private release(action: Action): void {
    if (this.held.delete(action)) this.released.add(action);
  }

  private press(action: Action): void {
    this.held.add(action);
    this.pressed.add(action);
  }

  moveAxis(): null {
    return null;
  }

  aimPoint(): { x: number; y: number } | null {
    return this.pointer;
  }

  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  destroy(): void {
    for (const fn of this.cleanup) fn();
  }
}

export class Input {
  readonly move = { x: 0, y: 0 };
  aim: { x: number; y: number } | null = null;

  constructor(private sources: InputSource[]) {}

  // Call once at the start of each frame.
  update(): void {
    let x = 0;
    let y = 0;
    if (this.isDown('moveRight')) x += 1;
    if (this.isDown('moveLeft')) x -= 1;
    if (this.isDown('moveDown')) y += 1;
    if (this.isDown('moveUp')) y -= 1;
    for (const s of this.sources) {
      const axis = s.moveAxis();
      if (axis) {
        x += axis.x;
        y += axis.y;
      }
      this.aim = s.aimPoint() ?? this.aim;
    }
    const len = Math.hypot(x, y);
    this.move.x = len > 1 ? x / len : x;
    this.move.y = len > 1 ? y / len : y;
  }

  // Call once at the end of each frame.
  endFrame(): void {
    for (const s of this.sources) s.endFrame();
  }

  isDown(action: Action): boolean {
    return this.sources.some((s) => s.held.has(action));
  }

  justPressed(action: Action): boolean {
    return this.sources.some((s) => s.pressed.has(action));
  }

  // Marks a press as handled so the player doesn't also act on it (Space interacts instead of dashing).
  consume(action: Action): void {
    for (const s of this.sources) s.pressed.delete(action);
  }

  justReleased(action: Action): boolean {
    return this.sources.some((s) => s.released.has(action));
  }

  destroy(): void {
    for (const s of this.sources) s.destroy();
  }
}
