// One registry per kind of thing (floors, assets, later enemies and tree nodes). Saved data names entries by their
// string id, so entries can be added, renamed in the UI or changed freely: only deleting an id breaks a reference.
export class Registry<T extends { id: string }> {
  private byId = new Map<string, T>();

  constructor(readonly kind: string, entries: T[]) {
    for (const e of entries) {
      if (this.byId.has(e.id)) console.warn(`[${kind}] id "${e.id}" is defined twice; the second one wins`);
      this.byId.set(e.id, e);
    }
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  list(): T[] {
    return [...this.byId.values()];
  }
}

// Small readers for hand-written JSON. A wrong or missing field falls back to its default and is reported, so a
// typo in a data file shows up in the console instead of crashing the game.
export type Problems = string[];

export const num = (v: unknown, fallback: number, where: string, problems: Problems): number => {
  if (v === undefined) return fallback;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  problems.push(`${where}: expected a number, got ${JSON.stringify(v)}`);
  return fallback;
};

export const str = (v: unknown, fallback: string, where: string, problems: Problems): string => {
  if (v === undefined) return fallback;
  if (typeof v === 'string') return v;
  problems.push(`${where}: expected text, got ${JSON.stringify(v)}`);
  return fallback;
};

export const bool = (v: unknown, fallback: boolean, where: string, problems: Problems): boolean => {
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  problems.push(`${where}: expected true or false, got ${JSON.stringify(v)}`);
  return fallback;
};

// "#1b1822" -> 0x1b1822
export const color = (v: unknown, where: string, problems: Problems): number => {
  if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return parseInt(v.slice(1), 16);
  problems.push(`${where}: expected a colour like "#1b1822", got ${JSON.stringify(v)}`);
  return 0xff00ff;
};

export const list = (v: unknown, where: string, problems: Problems): unknown[] => {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v;
  problems.push(`${where}: expected a list`);
  return [];
};

export const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function report(kind: string, problems: Problems): void {
  if (problems.length) console.warn(`[${kind}] ${problems.length} problem(s):\n  ` + problems.join('\n  '));
}
