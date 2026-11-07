import { save, writeSave } from '../core/save';
import raw from './enhancements.json';
import { list, num, obj, Problems, Registry, report, str } from './registry';
import { isEquipped, vestiges } from './vestiges';

// Skill enhancements, sold by Wobbles: each Vestige has two, and one works only while its Vestige is equipped. Which
// exist lives in enhancements.json, which he bought lives in the save. What each does is in sim/stats.ts and the
// arena's arrow hits, found by its id. Each costs 1 Perception. Perception earned is never saved: it is one for each
// of the file's `perception` flags that is on.

export interface Enhancement {
  id: string;
  // The Vestige it belongs to.
  vestige: string;
  // Which of that Vestige's two branches it sits on: 0 or 1.
  side: number;
  name: string;
  text: string;
}

function parse(data: unknown): { perception: string[]; list: Enhancement[] } {
  const problems: Problems = [];
  const o = obj(data);
  const perception = list(o.perception, 'enhancements.json perception', problems).map((f) => str(f, '', 'enhancements.json perception', problems)).filter(Boolean);
  const out = list(o.enhancements, 'enhancements.json enhancements', problems).flatMap((entry, i): Enhancement[] => {
    const e = obj(entry);
    const id = str(e.id, '', `enhancements.json enhancement ${i}`, problems);
    if (!id) return problems.push(`enhancements.json enhancement ${i}: has no id, skipped`), [];
    const vestige = str(e.vestige, '', `${id}.vestige`, problems);
    if (!vestiges.get(vestige)) return problems.push(`${id}: unknown vestige ${JSON.stringify(vestige)}, skipped`), [];
    return [{ id, vestige, side: Math.round(num(e.side, 0, `${id}.side`, problems)), name: str(e.name, id, `${id}.name`, problems), text: str(e.text, '', `${id}.text`, problems) }];
  });
  report('enhancements', problems);
  return { perception, list: out };
}

const parsed = parse(raw);
export const enhancements = new Registry<Enhancement>('enhancements', parsed.list);

// Each one's icon: code art is none, so it is drawn only from the sprite of this name.
export const enhancementTexture = (id: string): string => `enh_${id}`;

export const perceptionEarned = (): number => parsed.perception.filter((f) => save.flags[f]).length;
export const perceptionLeft = (): number => Math.max(0, perceptionEarned() - save.enhancements.length);

export const bought = (id: string): boolean => save.enhancements.includes(id);

// Bought, and its Vestige is equipped.
export function enhancementOn(id: string): boolean {
  const e = enhancements.get(id);
  return !!e && bought(id) && isEquipped(e.vestige);
}

// False if he has no Perception left, or has it already.
export function buyEnhancement(id: string): boolean {
  if (!enhancements.get(id) || bought(id) || perceptionLeft() <= 0) return false;
  save.enhancements.push(id);
  writeSave();
  return true;
}

// False if he has not bought it.
export function refundEnhancement(id: string): boolean {
  if (!bought(id)) return false;
  save.enhancements = save.enhancements.filter((x) => x !== id);
  writeSave();
  return true;
}

// Dev aid and fresh starts: he has bought none.
export function forgetEnhancements(): void {
  save.enhancements = [];
  writeSave();
}
