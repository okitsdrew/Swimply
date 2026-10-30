import { Asset, assets } from '../data/assets';
import { Floor, floors } from '../data/floors';
import { maps } from '../data/maps';
import { Sprite, sprites } from '../data/sprites';
import { assetsText, floorsText, saveFile, spritesText } from './files';

export type FileKind = 'sprites' | 'assets' | 'floors';

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

  constructor() {
    this.rememberSavedSprites();
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
    this.listeners.forEach((l) => l());
  }

  async save(): Promise<void> {
    const text: Record<FileKind, () => string> = {
      sprites: () => spritesText(this.sprites),
      assets: () => assetsText(this.assets),
      floors: () => floorsText(this.floors),
    };
    for (const kind of [...this.dirty]) {
      await saveFile(PATHS[kind], text[kind]());
      this.dirty.delete(kind);
      if (kind === 'sprites') this.rememberSavedSprites();
    }
    this.listeners.forEach((l) => l());
  }

  // Maps point at assets and floors by id, so an id a map uses cannot be renamed or deleted from here: the map
  // would stop loading that thing. Reads the map files as they were when the tool opened.
  mapsUsingAsset(id: string): string[] {
    return maps.list().filter((m) => m.objects.some((o) => o.asset.id === id)).map((m) => m.id);
  }

  mapsUsingFloor(id: string): string[] {
    return maps.list().filter((m) => m.tiles.some((t) => t.id === id)).map((m) => m.id);
  }

  sprite(id: string): Sprite | undefined {
    return this.sprites.find((s) => s.id === id);
  }
}
