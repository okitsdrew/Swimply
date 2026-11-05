import { save, writeSave } from '../core/save';
import raw from './vestiges.json';
import { bool, color, list, num, obj, Problems, Registry, report, str } from './registry';

// Vestiges: the skills he reclaims. Which ones exist lives in vestiges.json; which he holds, and what sits in each
// of his slots, lives in the save. What each one does is its own code (sim/Vestiges.ts), found by its id.

export interface Vestige {
  id: string;
  name: string;
  // Its colour, for its slot and emblem glow.
  color: number;
  // Which skill ring (skill_ring_1 to _5) shows where it is aimed: 1 purple, 2 orange, 3 green, 4 yellow, 5 white.
  ring: number;
  // Which of the throne room's pedestals shows it, counting from 0.
  pedestal: number;
  // False when something already floating by him stands for it (Timo is his own Vestige's emblem).
  emblem: boolean;
}

// Each one is drawn as `vestige_<id>`: code art that a sprite of the same name replaces.
export const vestigeTexture = (id: string): string => `vestige_${id}`;

function parse(data: unknown): { slots: number; list: Vestige[] } {
  const problems: Problems = [];
  const o = obj(data);
  const slots = Math.max(1, Math.round(num(o.slots, 3, 'vestiges.json slots', problems)));
  const out = list(o.vestiges, 'vestiges.json vestiges', problems).flatMap((entry, i): Vestige[] => {
    const e = obj(entry);
    const id = str(e.id, '', `vestiges.json vestige ${i}`, problems);
    if (!id) return problems.push(`vestiges.json vestige ${i}: has no id, skipped`), [];
    return [{ id, name: str(e.name, id, `${id}.name`, problems), color: color(e.color ?? '#c58cff', `${id}.color`, problems), ring: Math.round(num(e.ring, 5, `${id}.ring`, problems)), pedestal: Math.round(num(e.pedestal, i, `${id}.pedestal`, problems)), emblem: bool(e.emblem, true, `${id}.emblem`, problems) }];
  });
  report('vestiges', problems);
  return { slots, list: out };
}

const parsed = parse(raw);
export const VESTIGE_SLOTS = parsed.slots;
export const vestiges = new Registry<Vestige>('vestiges', parsed.list);

// The Vestige in a slot, if any (an id no longer in the file counts as empty).
export function equippedIn(slot: number): Vestige | undefined {
  return vestiges.get(save.equipped[slot] ?? '');
}

export function isEquipped(id: string): boolean {
  return save.equipped.includes(id);
}

// He reclaims one: it is his for good, and it goes into the first empty slot if there is one.
export function unlockVestige(id: string): void {
  if (!vestiges.get(id)) return void console.warn(`[vestiges] unknown vestige ${JSON.stringify(id)}`);
  if (!save.vestiges.includes(id)) save.vestiges.push(id);
  if (!isEquipped(id)) {
    for (let i = 0; i < VESTIGE_SLOTS; i++) {
      if (equippedIn(i)) continue;
      equip(i, id);
      break;
    }
  }
  writeSave();
}

// Puts one he holds in a slot ('' empties it). A Vestige sits in one slot at most, so it leaves any other.
export function equip(slot: number, id: string): void {
  if (slot < 0 || slot >= VESTIGE_SLOTS || (id && !save.vestiges.includes(id))) return;
  while (save.equipped.length < VESTIGE_SLOTS) save.equipped.push('');
  if (id) save.equipped = save.equipped.map((e) => (e === id ? '' : e));
  save.equipped[slot] = id;
  writeSave();
}

// Dev aid and fresh starts: he holds none.
export function forgetVestiges(): void {
  save.vestiges = [];
  save.equipped = [];
  writeSave();
}
