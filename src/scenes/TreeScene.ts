import Phaser from 'phaser';
import { save } from '../core/save';
import { buy, canBuy, cost, describe, isOpen, level, maxed, TreeNode, treeComplete, treeNodes } from '../data/tree';

export interface TreeSceneData {
  // A line about the run that just ended, shown above the tree.
  summary: string;
  // The label of the button that closes the tree.
  closeLabel: string;
  onClose: () => void;
}

const font = { fontFamily: 'monospace', fontStyle: 'bold', color: '#f2d7a6', stroke: '#1a1020', strokeThickness: 4 };
const NODE_RADIUS = 26;
// The tree sits a little above the screen's centre, to leave room for the info lines and the button below it.
const TREE_RAISE = 20;
const colors = {
  gold: 0xf2d7a6,
  ready: 0x7a46c8,
  open: 0x2a2538,
  locked: 0x15121d,
  line: 0x3a3350,
};

interface NodeView {
  node: TreeNode;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  price: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Graphics;
}

// The upgrade tree screen, laid over the arena. Click a node to spend memory shards on it; the arena decides
// when it opens and what closing it does. The nodes come from data/tree.json.
export class TreeScene extends Phaser.Scene {
  private views: NodeView[] = [];
  private lines!: Phaser.GameObjects.Graphics;
  private header!: Phaser.GameObjects.Text;
  private shards!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private hovered: TreeNode | null = null;
  private time0 = 0;
  private opts!: TreeSceneData;

  constructor() {
    super('tree');
  }

  init(data: TreeSceneData): void {
    this.opts = data;
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2 - TREE_RAISE;
    this.views = [];
    this.hovered = null;
    this.add.rectangle(0, 0, width, height, 0x07060b, 0.86).setOrigin(0).setInteractive();
    this.header = this.add.text(cx, 34, '', { ...font, fontSize: '20px', align: 'center' }).setOrigin(0.5, 0);
    this.shards = this.add.text(cx, 100, '', { ...font, fontSize: '18px', color: '#c9b6ff' }).setOrigin(0.5, 0);
    this.lines = this.add.graphics();
    this.info = this.add.text(cx, height - 160, '', { ...font, fontSize: '16px', align: 'center' }).setOrigin(0.5, 0);

    for (const node of treeNodes.list()) {
      const x = cx + node.x;
      const y = cy + node.y;
      const ring = this.add.circle(x, y, NODE_RADIUS, colors.open).setInteractive({ useHandCursor: true });
      const price = this.add.text(x, y, '', { ...font, fontSize: '15px', strokeThickness: 3 }).setOrigin(0.5);
      const label = this.add.text(x, y + NODE_RADIUS + 12, node.name, { ...font, fontSize: '13px', strokeThickness: 3 }).setOrigin(0.5, 0);
      const pips = this.add.graphics();
      ring.on('pointerover', () => (this.hovered = node));
      ring.on('pointerout', () => { if (this.hovered === node) this.hovered = null; });
      ring.on('pointerdown', () => {
        if (!buy(node)) return;
        this.tweens.add({ targets: ring, scale: { from: 1.25, to: 1 }, duration: 180, ease: 'Back.Out' });
      });
      this.views.push({ node, ring, label, price, pips });
    }

    const button = this.add.text(cx, height - 36, '', { ...font, fontSize: '20px', backgroundColor: '#2a2538', padding: { x: 14, y: 8 } })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    button.setText(`${this.opts.closeLabel}  [space]`);
    button.on('pointerover', () => button.setColor('#ffffff'));
    button.on('pointerout', () => button.setColor('#f2d7a6'));
    button.on('pointerdown', () => this.opts.onClose());
    this.refresh();
  }

  update(_t: number, delta: number): void {
    // Nodes that can be bought now breathe, so the eye finds them.
    this.time0 += delta / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(this.time0 * 5);
    // Redrawn every frame (it is only a handful of nodes), so dev menu changes to shards or the tree show at once.
    this.refresh();
    for (const v of this.views) if (canBuy(v.node)) v.ring.setStrokeStyle(2 + pulse * 2, 0xc9b6ff, 0.6 + pulse * 0.4);
  }

  private refresh(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2 - TREE_RAISE;
    const complete = treeComplete();
    this.header.setText(complete ? `${this.opts.summary}\nTHE MEMORY IS WHOLE` : this.opts.summary);
    this.shards.setText(`${save.shards} memory shards`);

    this.lines.clear();
    for (const v of this.views) {
      for (const p of v.node.parents) {
        const parent = treeNodes.get(p);
        if (!parent) continue;
        const lit = level(v.node) > 0;
        this.lines.lineStyle(lit ? 4 : 2, lit ? colors.gold : colors.line, lit ? 0.9 : 0.7);
        this.lines.lineBetween(cx + parent.x, cy + parent.y, cx + v.node.x, cy + v.node.y);
      }
    }

    for (const v of this.views) {
      const n = v.node;
      const open = isOpen(n);
      const full = maxed(n);
      const fill = full ? colors.gold : !open ? colors.locked : canBuy(n) ? colors.ready : colors.open;
      v.ring.setFillStyle(fill, 1).setStrokeStyle(2, full ? 0xffffff : open ? 0x7a6a9a : 0x2a2538, 1);
      v.price.setText(full ? '' : open ? `${cost(n)}` : '?');
      v.price.setColor(canBuy(n) ? '#ffffff' : open ? '#8a83a0' : '#4a4458');
      v.label.setAlpha(open ? 1 : 0.4);
      // One pip per level, filled for each one bought.
      const g = v.pips.clear();
      const count = n.costs.length;
      const x0 = cx + n.x - (count - 1) * 5;
      const y = cy + n.y - NODE_RADIUS - 9;
      for (let i = 0; i < count; i++) {
        if (i < level(n)) g.fillStyle(colors.gold, 1).fillCircle(x0 + i * 10, y, 3.5);
        else g.lineStyle(1.5, open ? 0x7a6a9a : 0x2a2538, 1).strokeCircle(x0 + i * 10, y, 3.5);
      }
    }

    const h = this.hovered;
    if (!h) {
      this.info.setText(complete ? 'Every memory is yours. This strength stays with you.' : 'Point at a memory to see what it gives. Click to take it.');
      return;
    }
    const lines = [`${h.name}   ${level(h)}/${h.costs.length}`, describe(h)];
    if (level(h) > 0) lines.push(`so far ${describe(h, level(h))}`);
    if (maxed(h)) lines.push('fully remembered');
    else if (!isOpen(h)) lines.push(`needs ${h.parents.map((p) => treeNodes.get(p)?.name ?? p).join(' or ')}`);
    else lines.push(`costs ${cost(h)} shards${save.shards < cost(h) ? `, you have ${save.shards}` : ''}`);
    this.info.setText(lines.join('\n'));
  }
}
