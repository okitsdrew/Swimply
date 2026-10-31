import { Asset, assets } from '../data/assets';
import { Floor, floors } from '../data/floors';
import { maps } from '../data/maps';
import { Sprite, sprites } from '../data/sprites';
import { assetsText, floorsText, idsInMap, readFile, readMapFiles, saveFile, spritesText } from './files';

export type FileKind = 'sprites' | 'assets' | 'floors';

// Unsaved work is also kept in the browser, so a page reload (such as Vite reloading after a code change) loses
// nothing. Only this tool reads it; the game never does.
const DRAFT_KEY = 'swimply.assetMaker.draft';

interface Draft {
  // Each file's text when the draft was made. If the file has changed since (a git checkout, a hand edit), its
  // draft is stale and is thrown away rather than written over the newer file.
  base: Partial<Record<FileKind, string>>;
  sprites?: Sprite[];
  assets?: Asset[];
  floors?: Floor[];
}

const PATHS: Record<FileKind, string> = {
  sprites: 'src/data/sprites.json',
  assets: 'src/data/assets.json',
  floors: 'src/data/floors.json',
};

// The asset maker's working copies of the data files. Panels edit these freely; nothing reaches the repo until
// save(), which writes each changed file whole. The game's own registries are copied, never edited, so the tool
// cannot change what a running game sees.
export class Workspace {
  sprites: Sprite[] = sprites.list().map((s) => ({ ...s, palette: s.palette.map((c) => ({ ...c })), pixels: [...s.pixels] }));
  assets: Asset[] = assets.list().map((a) => ({ ...a, parts: a.parts.map((p) => ({ ...p })), collision: a.collision.map((c) => ({ ...c })) }));
  floors: Floor[] = floors.list().map((f) => ({ ...f, colors: [...f.colors] }));
  readonly dirty = new Set<FileKind>();
  // Each sprite as it is in sprites.json, so one sprite can go back to its saved look without touching the others.
  private savedSprites = new WeakMap<Sprite, Sprite>();
  private listeners = new Set<() => void>();
  private base: Record<FileKind, string>;
  // Each file's text on disk as last read or written, so a save is refused if another tool changed it meanwhile.
  private disk: Partial<Record<FileKind, string | null>> = {};
  // The ids each map file uses, kept up to date when the level editor saves a map.
  private mapIds = new Map(maps.list().map((m) => [m.id, { assets: new Set(m.objects.map((o) => o.asset.id)), floors: new Set(m.tiles.map((t) => t.id)) }]));
  private draftTimer = 0;
  // What happened to last time's unsaved work, for the save bar.
  draftNote = '';

  constructor() {
    this.rememberSavedSprites();
    this.base = { sprites: this.text('sprites'), assets: this.text('assets'), floors: this.text('floors') };
    this.restoreDraft();
    for (const kind of Object.keys(PATHS) as FileKind[]) void readFile(PATHS[kind]).then((t) => (this.disk[kind] = t));
    void this.readMaps();
    import.meta.hot?.on('swimply:data', (d: { file: string }) => {
      if (/[\\/]maps[\\/]/.test(d.file)) void this.readMaps();
    });
  }

  private async readMaps(): Promise<void> {
    try {
      const files = await readMapFiles();
      this.mapIds = new Map(Object.entries(files).map(([id, text]) => [id, idsInMap(text)]));
      this.listeners.forEach((l) => l());
    } catch {
      // Not under the dev server: nothing can be saved anyway.
    }
  }

  private text(kind: FileKind): string {
    return kind === 'sprites' ? spritesText(this.sprites) : kind === 'assets' ? assetsText(this.assets) : floorsText(this.floors);
  }

  private restoreDraft(): void {
    let draft: Draft | null = null;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
    } catch {
      // Storage blocked or the draft is damaged: start from the files.
    }
    if (!draft) return;
    const kept: FileKind[] = [];
    const stale: FileKind[] = [];
    for (const kind of ['sprites', 'assets', 'floors'] as FileKind[]) {
      const data = draft[kind];
      if (!data) continue;
      if (draft.base[kind] !== this.base[kind]) {
        stale.push(kind);
        continue;
      }
      if (kind === 'sprites') {
        const saved = new Map(this.sprites.map((x) => [x.id, this.savedSprites.get(x)!]));
        this.sprites = data as Sprite[];
        for (const x of this.sprites) if (saved.has(x.id)) this.savedSprites.set(x, saved.get(x.id)!);
      } else if (kind === 'assets') this.assets = data as Asset[];
      else this.floors = data as Floor[];
      this.dirty.add(kind);
      kept.push(kind);
    }
    if (kept.length) this.draftNote = `Brought back your unsaved ${kept.join(', ')} from before the page reloaded.`;
    if (stale.length) this.draftNote += ` Unsaved ${stale.join(', ')} from before were dropped, because the file changed since.`;
    this.writeDraft();
  }

  private writeDraft(): void {
    try {
      if (!this.dirty.size) return localStorage.removeItem(DRAFT_KEY);
      const draft: Draft = { base: {} };
      for (const kind of this.dirty) {
        draft.base[kind] = this.base[kind];
        (draft as unknown as Record<FileKind, unknown>)[kind] = this[kind];
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full or blocked: work is only lost if the page reloads before a save.
    }
  }

  private rememberSavedSprites(): void {
    for (const s of this.sprites) this.savedSprites.set(s, { ...s, palette: s.palette.map((c) => ({ ...c })), pixels: [...s.pixels] });
  }

  // The saved version of a sprite, or undefined for one made since the last save.
  savedSprite(s: Sprite): Sprite | undefined {
    return this.savedSprites.get(s);
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  // Every edit calls this, so the save bar knows what is unsaved.
  touch(kind: FileKind): void {
    this.dirty.add(kind);
    clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => this.writeDraft(), 300);
    this.listeners.forEach((l) => l());
  }

  async save(): Promise<void> {
    for (const kind of [...this.dirty]) {
      const text = this.text(kind);
      await saveFile(PATHS[kind], text, this.disk[kind]);
      this.base[kind] = text;
      this.disk[kind] = text;
      this.dirty.delete(kind);
      if (kind === 'sprites') this.rememberSavedSprites();
    }
    clearTimeout(this.draftTimer);
    this.writeDraft();
    this.listeners.forEach((l) => l());
  }

  // Forgets every unsaved change; the caller reloads the page to start again from the files.
  discard(): void {
    clearTimeout(this.draftTimer);
    this.dirty.clear();
    this.writeDraft();
  }

  // Maps point at assets and floors by id, so an id a map uses cannot be renamed or deleted from here: the map
  // would stop loading that thing. The level editor can rename or replace them across every map.
  mapsUsingAsset(id: string): string[] {
    return [...this.mapIds].filter(([, ids]) => ids.assets.has(id)).map(([m]) => m);
  }

  mapsUsingFloor(id: string): string[] {
    return [...this.mapIds].filter(([, ids]) => ids.floors.has(id)).map(([m]) => m);
  }

  sprite(id: string): Sprite | undefined {
    return this.sprites.find((s) => s.id === id);
  }
}
