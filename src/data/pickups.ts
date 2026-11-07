import raw from './pickups.json';
import { color, list, num, obj, Problems, Registry, report, str } from './registry';

// Things enemies drop for the player to pick up, such as memory shards. Each kind says which wallet it fills and
// how it looks, so a new kind (soul shards) is a new entry in pickups.json, not new code.

// Where a pickup's value goes. "memory" is the banked memory shards the Mindscape's tree is bought with. "item" fills
// no wallet: it lies still until he walks up and presses F, and gives him the thing the orb holds.
export const WALLETS = ['memory', 'item'] as const;
export type Wallet = (typeof WALLETS)[number];

export interface PickupKind {
  id: string;
  name: string;
  wallet: Wallet;
  // What one picked up is worth, before bonuses (Memory Echo doubles memory shards).
  value: number;
  // The orb's colours: its middle, its edge, and the glow round it.
  core: number;
  rim: number;
  glow: number;
}

function parsePickups(data: unknown): PickupKind[] {
  const problems: Problems = [];
  const kinds = list(obj(data).pickups, 'pickups.json pickups', problems).flatMap((entry, i): PickupKind[] => {
    const e = obj(entry);
    const id = str(e.id, '', `pickups.json pickup ${i}`, problems);
    if (!id) return problems.push(`pickups.json pickup ${i}: has no id, skipped`), [];
    const wallet = str(e.wallet, 'memory', `${id}.wallet`, problems);
    if (!(WALLETS as readonly string[]).includes(wallet)) return problems.push(`${id}: unknown wallet "${wallet}" (known: ${WALLETS.join(', ')}), skipped`), [];
    return [{
      id,
      name: str(e.name, id, `${id}.name`, problems),
      wallet: wallet as Wallet,
      value: num(e.value, 1, `${id}.value`, problems),
      core: color(e.core ?? '#ffffff', `${id}.core`, problems),
      rim: color(e.rim ?? '#a8dcff', `${id}.rim`, problems),
      glow: color(e.glow ?? '#4aa8ff', `${id}.glow`, problems),
    }];
  });
  report('pickups', problems);
  return kinds;
}

export const pickupKinds = new Registry<PickupKind>('pickups', parsePickups(raw));

// The texture an orb of this kind is drawn with. A sprite of the same name in sprites.json replaces the code art.
export const pickupTexture = (k: PickupKind): string => `pickup_${k.id}`;
