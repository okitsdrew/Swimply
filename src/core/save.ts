// Persistent player progress. Versioned, so old saves are migrated as the format grows.
//
// Two kinds of data, never mixed:
//  - `baseline` and `flags` are permanent and live here (the character's lasting strength, story progress).
//  - A run's own state (health, wave number, gold this run) is NOT saved. It starts fresh each run.

const SAVE_KEY = 'swimply.save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  // Permanent base stats the character keeps, by stat id.
  baseline: Record<string, number>;
  // Story and tutorial progress.
  flags: Record<string, boolean>;
}

const fresh = (): SaveData => ({ version: SAVE_VERSION, baseline: {}, flags: {} });

// migrations[n] turns a version-n save into version n+1. Add one whenever SAVE_VERSION goes up.
const migrations: Record<number, (d: SaveData) => SaveData> = {};

function migrate(d: SaveData): SaveData {
  let out = d;
  while (out.version < SAVE_VERSION) {
    const step = migrations[out.version];
    if (!step) return fresh();
    out = { ...step(out), version: out.version + 1 };
  }
  return out;
}

function sanitize(raw: unknown): SaveData {
  const r = (raw ?? {}) as Partial<SaveData>;
  if (typeof r.version !== 'number' || r.version > SAVE_VERSION) return fresh();
  return migrate({ version: r.version, baseline: { ...(r.baseline ?? {}) }, flags: { ...(r.flags ?? {}) } });
}

export const save: SaveData = fresh();

export function loadSave(): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) Object.assign(save, sanitize(JSON.parse(raw)));
  } catch {
    // Corrupt save: keep the fresh one and leave the stored string alone until the next write.
  }
}

let timer: number | undefined;

// Writes soon, so bursts of changes cost one write.
export function writeSave(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(writeSaveNow, 300);
}

export function writeSaveNow(): void {
  window.clearTimeout(timer);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage blocked or full.
  }
}

export function resetSave(): void {
  Object.assign(save, fresh());
  writeSaveNow();
}

export function exportSave(): string {
  return JSON.stringify(save, null, 2);
}

export function importSave(text: string): void {
  Object.assign(save, sanitize(JSON.parse(text)));
  writeSaveNow();
}
