import raw from './floors.json';
import { bool, color, list, obj, Problems, Registry, report, str } from './registry';

// A kind of ground. A floor that `blocks` cannot be walked on (water, a cliff); arrows still fly over it. A floor
// that `hurts` can be walked on, but kills the player standing on it.
export interface Floor {
  id: string;
  name: string;
  // Tiles pick one of these by position, so a floor is not one flat colour.
  colors: number[];
  blocks: boolean;
  // Standing on it kills the player, unless a dash or teleport is keeping them safe (lava, fire).
  hurts: boolean;
  // A looping sound id (sounds.json), heard louder the nearer the player is to this floor. Empty for none.
  sound: string;
  // Drawn lifted to the top of the walls (render.roofHeight), as the flat roof of a building; black at ground level.
  roof: boolean;
}

function parseFloors(data: unknown): Floor[] {
  const problems: Problems = [];
  const out: Floor[] = [];
  list(obj(data).floors, 'floors.json', problems).forEach((entry, i) => {
    const e = obj(entry);
    const where = `floors.json floor ${i}`;
    const id = str(e.id, '', where, problems);
    if (!id) return problems.push(`${where}: has no id, skipped`);
    const colors = list(e.colors, `${where} (${id})`, problems).map((c, j) => color(c, `${id} colour ${j}`, problems));
    if (!colors.length) colors.push(0xff00ff);
    out.push({ id, name: str(e.name, id, where, problems), colors, blocks: bool(e.blocks, false, `${id}.blocks`, problems), hurts: bool(e.hurts, false, `${id}.hurts`, problems), sound: str(e.sound, '', `${id}.sound`, problems), roof: bool(e.roof, false, `${id}.roof`, problems) });
  });
  report('floors', problems);
  return out;
}

export const floors = new Registry<Floor>('floors', parseFloors(raw));
