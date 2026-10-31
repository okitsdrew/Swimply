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

export const round = (v: number): number => Math.round(v * 10000) / 10000;

// Ids are what saved files use to point at things, so they are kept plain: letters, digits, "-" and "_".
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function uniqueId(base: string, taken: (id: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}
