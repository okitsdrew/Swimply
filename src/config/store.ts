// The tunables store. Every system defines its own config section next to its code (or in src/config/) with
// `defineConfig`. A section returns a live object that systems read every frame, so dev menu edits apply at once.
// Edits are saved as overrides of the defaults, so changing a default later still reaches everything not edited.

export type Param = { min: number; max: number; step: number } | 'bool';
type Value = number | boolean;
type Values = Record<string, Value>;

export interface Section {
  name: string;
  // The dev menu groups sections by this label.
  group: string;
  values: Values;
  defaults: Values;
  meta: Record<string, Param>;
}

const STORAGE_KEY = 'swimply.config.v1';
const sections = new Map<string, Section>();
let overrides: Record<string, Values> = readOverrides();
const listeners = new Set<() => void>();

function readOverrides(): Record<string, Values> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Values>) : {};
  } catch {
    return {};
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage blocked or full: tweaks last until reload.
  }
}

export function defineConfig<T extends Values>(
  name: string,
  group: string,
  defaults: T,
  meta: { [K in keyof T]: Param },
): T {
  if (sections.has(name)) throw new Error(`Config section "${name}" is defined twice`);
  const values = { ...defaults };
  // Only keys that still exist and have the right type are applied, so old saved tweaks never break a renamed value.
  for (const [k, v] of Object.entries(overrides[name] ?? {})) {
    if (k in defaults && typeof v === typeof defaults[k]) (values as Values)[k] = v;
  }
  sections.set(name, { name, group, values, defaults, meta });
  return values;
}

export function listSections(): Section[] {
  return [...sections.values()];
}

export function setValue(section: string, key: string, value: Value): void {
  const s = sections.get(section);
  if (!s) return;
  s.values[key] = value;
  if (value === s.defaults[key]) {
    delete overrides[section]?.[key];
    if (overrides[section] && Object.keys(overrides[section]).length === 0) delete overrides[section];
  } else {
    (overrides[section] ??= {})[key] = value;
  }
  persist();
  listeners.forEach((l) => l());
}

export function isChanged(section: string, key: string): boolean {
  const s = sections.get(section);
  return !!s && s.values[key] !== s.defaults[key];
}

export function resetAll(): void {
  for (const s of sections.values()) Object.assign(s.values, s.defaults);
  overrides = {};
  persist();
  listeners.forEach((l) => l());
}

export function exportJson(): string {
  return JSON.stringify(overrides, null, 2);
}

export function importJson(text: string): void {
  const parsed = JSON.parse(text) as Record<string, Values>;
  resetAll();
  for (const [name, vals] of Object.entries(parsed)) {
    for (const [k, v] of Object.entries(vals)) setValue(name, k, v);
  }
}

// The dev menu uses this to redraw when something changes the values from outside it.
export function onConfigChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
