import { tree } from '../config/tree';
import { save, writeSave } from '../core/save';
import raw from './tree.json';
import { list, num, obj, Problems, Registry, report, str } from './registry';

// The stats a tree node can raise. 'add' stats gain `per` a level (+1 damage); 'pct' stats are multiplied by
// 1 + `per` a level (0.15 is +15%, -0.15 is 15% less). sim/stats.ts applies the totals.
export const STATS = {
  damage: { kind: 'add', label: 'damage' },
  pierce: { kind: 'add', label: 'pierce' },
  arrows: { kind: 'add', label: 'arrow per shot' },
  fireRate: { kind: 'add', label: 'shots a second' },
  moveSpeed: { kind: 'add', label: 'move speed' },
  range: { kind: 'pct', label: 'arrow range' },
  shardGain: { kind: 'pct', label: 'shards' },
  runStart: { kind: 'add', label: 'seconds: runs start this far in' },
} as const;

export type StatId = keyof typeof STATS;

// One node of the upgrade tree. A node opens once any of its parents has a level (a node with no parents is the
// root). x and y place it on the tree screen, in pixels from the screen's centre.
export interface TreeNode {
  id: string;
  name: string;
  stat: StatId;
  per: number;
  // Price of each level in shards, before tree.costScale. Its length is the node's number of levels.
  costs: number[];
  parents: string[];
  // Conditions that keep the node hidden until all hold: "treeComplete" (every node without conditions is fully
  // bought) or "flag:<name>" (a save flag is set).
  requires: string[];
  x: number;
  y: number;
}

function parseTree(data: unknown): TreeNode[] {
  const problems: Problems = [];
  const out: TreeNode[] = [];
  list(obj(data).nodes, 'tree.json', problems).forEach((entry, i) => {
    const e = obj(entry);
    const where = `tree.json node ${i}`;
    const id = str(e.id, '', where, problems);
    if (!id) return problems.push(`${where}: has no id, skipped`);
    const stat = str(e.stat, '', `${id}.stat`, problems);
    if (!(stat in STATS)) return problems.push(`${id}: unknown stat "${stat}", skipped`);
    const costs = list(e.costs, `${id}.costs`, problems).map((c, j) => num(c, 1, `${id} cost ${j}`, problems));
    if (!costs.length) costs.push(1);
    out.push({
      id,
      name: str(e.name, id, where, problems),
      stat: stat as StatId,
      per: num(e.per, 0, `${id}.per`, problems),
      costs,
      parents: list(e.parents, `${id}.parents`, problems).map((p) => str(p, '', `${id} parent`, problems)).filter(Boolean),
      requires: list(e.requires, `${id}.requires`, problems).map((r) => str(r, '', `${id} requirement`, problems)).filter(Boolean),
      x: num(e.x, 0, `${id}.x`, problems),
      y: num(e.y, 0, `${id}.y`, problems),
    });
  });
  const ids = new Set(out.map((n) => n.id));
  for (const n of out) {
    for (const p of n.parents) if (!ids.has(p)) problems.push(`${n.id}: unknown parent "${p}"`);
    n.parents = n.parents.filter((p) => ids.has(p));
  }
  report('tree', problems);
  return out;
}

export const treeNodes = new Registry<TreeNode>('tree', parseTree(raw));

export const level = (n: TreeNode): number => Math.min(save.tree[n.id] ?? 0, n.costs.length);
export const maxed = (n: TreeNode): boolean => level(n) >= n.costs.length;
export const isOpen = (n: TreeNode): boolean =>
  !n.parents.length || n.parents.some((p) => { const parent = treeNodes.get(p); return !!parent && level(parent) > 0; });
export const cost = (n: TreeNode): number => Math.ceil(n.costs[level(n)] * tree.costScale);
export const canBuy = (n: TreeNode): boolean => shown(n) && isOpen(n) && !maxed(n) && save.shards >= cost(n);
// The tree counts as complete when every node without conditions is fully bought; hidden extras are optional.
export const treeComplete = (): boolean => treeNodes.list().every((n) => n.requires.length > 0 || maxed(n));

export function shown(n: TreeNode): boolean {
  return n.requires.every((r) => (r === 'treeComplete' ? treeComplete() : r.startsWith('flag:') ? !!save.flags[r.slice(5)] : false));
}

// "+15% fire rate" for `levels` levels of the node.
export function describe(n: TreeNode, levels = 1): string {
  const s = STATS[n.stat];
  const v = Math.round(n.per * levels * 100) / 100;
  if (s.kind === 'add') return `${v >= 0 ? '+' : ''}${v} ${s.label}`;
  return `${v >= 0 ? '+' : ''}${Math.round(v * 100)}% ${s.label}`;
}

// The permanent baseline is worked out from the levels bought, so it always matches the tree's current numbers.
function updateBaseline(): void {
  const b: Record<string, number> = {};
  for (const n of treeNodes.list()) b[n.stat] = (b[n.stat] ?? 0) + n.per * level(n);
  save.baseline = b;
  writeSave();
}

export function buy(n: TreeNode): boolean {
  if (!canBuy(n)) return false;
  save.shards -= cost(n);
  save.tree[n.id] = level(n) + 1;
  updateBaseline();
  return true;
}

export function addShards(amount: number): void {
  save.shards += amount;
  writeSave();
}

// Dev menu helpers.
export function resetTree(refund: boolean): void {
  if (refund) for (const n of treeNodes.list()) for (let i = 0; i < level(n); i++) save.shards += Math.ceil(n.costs[i] * tree.costScale);
  save.tree = {};
  updateBaseline();
}

export function maxTree(): void {
  for (const n of treeNodes.list()) save.tree[n.id] = n.costs.length;
  updateBaseline();
}

// Call once after the save loads, so a change to tree.json reaches an existing save.
export const refreshBaseline = updateBaseline;
