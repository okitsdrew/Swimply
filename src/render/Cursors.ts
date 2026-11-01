import { render } from '../config/render';
import { rgba, sprites } from '../data/sprites';

// The mouse cursors, drawn from the `cursor` and `crosshair` sprites and handed to the browser as CSS cursors, so
// they move with no lag. `cursor` clicks at render.pointerHotX/Y; `crosshair` aims with its middle pixel.
// A missing sprite falls back to the browser's own cursor.
export type CursorKind = 'pointer' | 'crosshair';

const SPRITE: Record<CursorKind, string> = { pointer: 'cursor', crosshair: 'crosshair' };
const FALLBACK: Record<CursorKind, string> = { pointer: 'default', crosshair: 'crosshair' };
// Browsers ignore cursor pictures bigger than this.
const MAX_SIZE = 128;

const made = new Map<string, string>();

export function cursorCss(kind: CursorKind): string {
  const scale = Math.max(1, Math.round(render.cursorScale));
  const key = `${kind}@${scale}:${render.pointerHotX},${render.pointerHotY}`;
  let css = made.get(key);
  if (css === undefined) {
    css = draw(kind, scale);
    made.set(key, css);
  }
  return css;
}

function draw(kind: CursorKind, wanted: number): string {
  const sprite = sprites.get(SPRITE[kind]);
  if (!sprite) return FALLBACK[kind];
  const scale = Math.max(1, Math.min(wanted, Math.floor(MAX_SIZE / Math.max(sprite.width, sprite.height))));
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width * scale;
  canvas.height = sprite.height * scale;
  const ctx = canvas.getContext('2d')!;
  const colors = sprite.palette.map((c) => {
    const [r, g, b, a] = rgba(c.hex);
    return `rgba(${r},${g},${b},${a / 255})`;
  });
  sprite.pixels.forEach((j, i) => {
    if (j < 0) return;
    ctx.fillStyle = colors[j];
    ctx.fillRect((i % sprite.width) * scale, Math.floor(i / sprite.width) * scale, scale, scale);
  });
  const mid = Math.floor(scale / 2);
  const hot = kind === 'pointer'
    ? { x: Math.round(render.pointerHotX), y: Math.round(render.pointerHotY) }
    : { x: Math.floor(sprite.width / 2) * scale + mid, y: Math.floor(sprite.height / 2) * scale + mid };
  return `url(${canvas.toDataURL()}) ${hot.x} ${hot.y}, ${FALLBACK[kind]}`;
}
