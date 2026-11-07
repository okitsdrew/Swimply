import { save, writeSave } from '../core/save';
import raw from './hats.json';
import { list, num, obj, Problems, Registry, report, str } from './registry';

// Hats: for looks only. Which ones exist lives in hats.json; which he owns, and the one he wears, lives in the save.

export interface Hat {
  id: string;
  name: string;
  // Which of the menu's places shows it, counting from 0.
  place: number;
  // The enemy kind that drops its orb when killed ('' for none).
  droppedBy: string;
}

function parse(data: unknown): Hat[] {
  const problems: Problems = [];
  const out = list(obj(data).hats, 'hats.json hats', problems).flatMap((entry, i): Hat[] => {
    const e = obj(entry);
    const id = str(e.id, '', `hats.json hat ${i}`, problems);
    if (!id) return problems.push(`hats.json hat ${i}: has no id, skipped`), [];
    return [{ id, name: str(e.name, id, `${id}.name`, problems), place: Math.round(num(e.place, i, `${id}.place`, problems)), droppedBy: str(e.droppedBy, '', `${id}.droppedBy`, problems) }];
  });
  report('hats', problems);
  return out;
}

export const hats = new Registry<Hat>('hats', parse(raw));

// Each one is drawn from the sprite `hat_<id>`, whose bottom row sits on the top row of his head.
export const hatTexture = (id: string): string => `hat_${id}`;

// The hat he has on, if any (an id no longer in the file counts as none).
export function wornHat(): Hat | undefined {
  return hats.get(save.hat);
}

export function ownsHat(id: string): boolean {
  return save.hats.includes(id);
}

// He gets one: it is his for good, and he puts it on if he has none on.
export function gainHat(id: string): void {
  if (!hats.get(id)) return void console.warn(`[hats] unknown hat ${JSON.stringify(id)}`);
  if (!ownsHat(id)) save.hats.push(id);
  if (!wornHat()) save.hat = id;
  writeSave();
}

// Puts on one he owns ('' takes it off).
export function wearHat(id: string): void {
  if (id && !ownsHat(id)) return;
  save.hat = id;
  writeSave();
}

// Dev aid and fresh starts: he owns none.
export function forgetHats(): void {
  save.hats = [];
  save.hat = '';
  writeSave();
}
