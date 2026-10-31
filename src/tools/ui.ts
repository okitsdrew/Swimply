// Tiny DOM helpers for the tools. No framework: each panel rebuilds its own little piece of the page when its data
// changes, which is plenty fast for forms this size.

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  e.append(...kids);
  return e;
}

export function button(label: string, run: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = el('button', attrs, label);
  b.addEventListener('click', () => {
    run();
    // Drop focus so keyboard shortcuts keep working after a click.
    b.blur();
  });
  return b;
}

// A labelled row: "label [input]".
export function row(label: string, ...inputs: Node[]): HTMLElement {
  return el('div', { class: 'row' }, el('label', { text: label }), ...inputs);
}

export function numberInput(value: number, step: number, onChange: (v: number) => void, attrs: Attrs = {}): HTMLInputElement {
  const i = el('input', { type: 'number', step, value: round(value), ...attrs });
  i.addEventListener('input', () => {
    const v = parseFloat(i.value);
    if (Number.isFinite(v)) onChange(v);
  });
  return i;
}

export function textInput(value: string, onChange: (v: string) => void, attrs: Attrs = {}): HTMLInputElement {
  const i = el('input', { type: 'text', value, ...attrs });
  i.addEventListener('change', () => onChange(i.value.trim()));
  return i;
}

export function checkbox(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const i = el('input', { type: 'checkbox', checked: value });
  i.addEventListener('change', () => onChange(i.checked));
  return i;
}

export function select(options: string[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const s = el('select', {});
  if (!options.includes(value)) options = [value, ...options];
  for (const o of options) s.append(el('option', { value: o, selected: o === value, text: o || '(none)' }));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

// A text input with suggestions, for fields that are free text but usually one of a few values (category, marker).
let datalists = 0;
export function suggestInput(value: string, suggestions: string[], onChange: (v: string) => void): HTMLElement {
  const id = `dl${datalists++}`;
  const list = el('datalist', { id }, ...suggestions.map((s) => el('option', { value: s })));
  const i = textInput(value, onChange, { list: id });
  return el('span', { class: 'grow' }, i, list);
}

// A colour button that opens our own picker. The browser's built-in one opens wherever the browser likes, which on
// the right-hand panel can be off the screen; this one is kept inside the window. `onInput` runs while dragging,
// `onChange` once when the picker closes. Colours are "#rrggbb".
export function colorInput(value: string, onInput: (hex: string) => void, onChange: (hex: string) => void = () => {}): HTMLButtonElement {
  const b = el('button', { class: 'color-btn', title: value });
  b.style.background = value;
  b.addEventListener('click', () => {
    b.blur();
    openPicker(b, value, (v) => {
      value = v;
      b.style.background = v;
      b.title = v;
      onInput(v);
    }, () => onChange(value));
  });
  return b;
}

function openPicker(anchor: HTMLElement, start: string, onInput: (hex: string) => void, onClose: () => void): void {
  const W = 180;
  const H = 120;
  let [h, s, v] = toHsv(start);
  const sv = el('canvas', { width: W, height: H, class: 'cp-sv' });
  const hue = el('canvas', { width: W, height: 14, class: 'cp-hue' });
  const text = el('input', { type: 'text', value: start, spellcheck: false });
  const pop = el('div', { class: 'color-pop' }, sv, hue, text);
  document.body.append(pop);

  const draw = (): void => {
    const g = sv.getContext('2d')!;
    g.fillStyle = `hsl(${h}, 100%, 50%)`;
    g.fillRect(0, 0, W, H);
    const white = g.createLinearGradient(0, 0, W, 0);
    white.addColorStop(0, '#fff');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = white;
    g.fillRect(0, 0, W, H);
    const black = g.createLinearGradient(0, 0, 0, H);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, '#000');
    g.fillStyle = black;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = v > 0.5 ? '#000' : '#fff';
    g.beginPath();
    g.arc(s * W, (1 - v) * H, 4, 0, Math.PI * 2);
    g.stroke();
    const k = hue.getContext('2d')!;
    const rainbow = k.createLinearGradient(0, 0, W, 0);
    for (let i = 0; i <= 6; i++) rainbow.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
    k.fillStyle = rainbow;
    k.fillRect(0, 0, W, 14);
    k.fillStyle = '#fff';
    k.fillRect((h / 360) * W - 1, 0, 2, 14);
  };
  const emit = (): void => {
    const hex = fromHsv(h, s, v);
    text.value = hex;
    draw();
    onInput(hex);
  };
  const drag = (c: HTMLCanvasElement, at: (x: number, y: number) => void): void => {
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent): void => {
        const r = c.getBoundingClientRect();
        at(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height));
        emit();
      };
      move(e);
      c.addEventListener('pointermove', move);
      c.addEventListener('pointerup', () => c.removeEventListener('pointermove', move), { once: true });
    });
  };
  drag(sv, (x, y) => { s = x; v = 1 - y; });
  drag(hue, (x) => { h = x * 359.9; });
  text.addEventListener('change', () => {
    const t = text.value.trim().replace(/^#?/, '#').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(t)) return void (text.value = fromHsv(h, s, v));
    [h, s, v] = toHsv(t);
    emit();
  });

  // Below the button if it fits, else above; always inside the window.
  const a = anchor.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  const left = Math.max(4, Math.min(a.left, innerWidth - p.width - 4));
  const top = a.bottom + 4 + p.height <= innerHeight ? a.bottom + 4 : Math.max(4, a.top - p.height - 4);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  draw();

  const close = (): void => {
    pop.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    onClose();
  };
  const outside = (e: PointerEvent): void => {
    if (!pop.contains(e.target as Node)) close();
  };
  const key = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' && !(e.key === 'Enter' && e.target !== text)) return;
    e.stopPropagation();
    close();
  };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', key, true);
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function toHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? d / max : 0, max];
}

function fromHsv(h: number, s: number, v: number): string {
  const f = (k: number): number => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export const round = (v: number): number => Math.round(v * 10000) / 10000;

// Ids are what saved files use to point at things, so they are kept plain: letters, digits, "-" and "_".
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function uniqueId(base: string, taken: (id: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}
