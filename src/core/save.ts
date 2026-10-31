// Persistent player progress. Versioned, so old saves are migrated as the format grows.
//
// Two kinds of data, never mixed:
//  - `baseline`, `tree`, `shards` and `flags` are permanent and live here (the character's lasting strength, what
//    he has bought, the shards he has banked, story progress).
//  - A run's own state (wave number, kills, the Shades on the map) is NOT saved. It starts fresh each run.

const SAVE_KEY = 'swimply.save';
export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
  // Permanent base stats the character keeps, by stat id.
  // Bonus per stat id, worked out from the tree each time a node is bought (see data/tree.ts).
  baseline: Record<string, number>;
  // Levels bought in the Mindscape's upgrade tree, by node id.
  tree: Record<string, number>;
  // Memory shards banked and not yet spent.
  shards: number;
  // Story and tutorial progress.
  flags: Record<string, boolean>;
}

const fresh = (): SaveData => ({ version: SAVE_VERSION, baseline: {}, tree: {}, shards: 0, flags: {} });

// migrations[n] turns a version-n save into version n+1. Add one whenever SAVE_VERSION goes up.
const migrations: Record<number, (d: SaveData) => SaveData> = {
  // Version 2 adds the upgrade tree and banked shards.
  1: (d) => ({ ...d, tree: {}, shards: 0 }),
};

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
  const shards = typeof r.shards === 'number' && Number.isFinite(r.shards) ? r.shards : 0;
  return migrate({
    version: r.version, baseline: { ...(r.baseline ?? {}) }, tree: { ...(r.tree ?? {}) }, shards, flags: { ...(r.flags ?? {}) },
  });
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
