import Phaser from 'phaser';
import { toScreen } from '../core/iso';
import { save } from '../core/save';
import { bought, buyEnhancement, enhancements, enhancementTexture, perceptionEarned, perceptionLeft, refundEnhancement } from '../data/enhancements';
import { maps } from '../data/maps';
import { isEquipped, vestiges } from '../data/vestiges';
import { iconScale } from '../render/art';
import { cursorCss } from '../render/Cursors';
import { PedestalsView } from '../render/PedestalsView';
import { SoundFx } from '../render/SoundFx';
import { ui, uiText } from '../render/ui';

const NODE = 60;
const LEAF = 44;
// How far a Vestige's enhancements sit outward from its node, and apart to each side.
const OUT = 92;
const APART = 36;
// How far the ring's widest pedestals sit from the middle.
const RING = 384;
const GOLD = 0xf7c83a;

// Wobbles' shop, laid out like the throne room: each Vestige's node sits where its pedestal is, and its two
// enhancements branch off it, away from the middle. Left click buys, right click refunds. The arena opens it when a
// story step says so and closes it with Tab or F.
export class ShopScene extends Phaser.Scene {
  private leaves: { box: Phaser.GameObjects.Rectangle; id: string }[] = [];
  private hovered = '';
  private count!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private sfx!: SoundFx;

  constructor() {
    super('shop');
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height * 0.525;
    this.sfx = new SoundFx(this);
    this.leaves = [];
    this.hovered = '';
    this.add.rectangle(0, 0, width, height, 0x0a0612, 0.92).setOrigin(0).setInteractive();
    this.add.text(cx, 30, 'WOBBLES', uiText(16)).setOrigin(0.5, 0);
    this.count = this.add.text(cx, 62, '', uiText(8, { color: '#f7c83a' })).setOrigin(0.5, 0);
    this.info = this.add.text(cx, cy, '', uiText(8, { align: 'center', lineSpacing: 10, wordWrap: { width: 420 } })).setOrigin(0.5);
    this.add.text(cx, height - 40, 'TAB or F to close', uiText(8, { color: ui.dim })).setOrigin(0.5);

    const throne = maps.list().find((m) => m.objects.some((o) => o.asset.id === 'throne'));
    const middle = throne?.objects.find((o) => o.asset.id === 'throne');
    if (!throne || !middle) return console.warn('[shop] no map with a throne, so no pedestals to lay out by');
    const ring = PedestalsView.order(throne).map((o) => toScreen(o.x - middle.x, o.y - middle.y));
    const scale = RING / Math.max(1, ...ring.map((p) => Math.abs(p.x)));
    const lines = this.add.graphics();
    ring.forEach((p, place) => {
      const x = cx + p.x * scale;
      const y = cy + p.y * scale;
      const len = Math.hypot(p.x, p.y) || 1;
      const [ox, oy] = [p.x / len, p.y / len];
      const v = vestiges.list().find((c) => c.pedestal === place);
      const held = !!v && this.held(v.id);
      this.add.rectangle(x, y, NODE, NODE, held ? ui.deep : 0x0c0816, 1).setStrokeStyle(3, held ? ui.lilac : ui.dark);
      if (held && v) this.add.image(x, y, v.icon).setScale(iconScale(this, v.icon, NODE));
      for (const side of [0, 1]) {
        const s = side === 0 ? -1 : 1;
        const lx = x + ox * OUT - oy * s * APART;
        const ly = y + oy * OUT + ox * s * APART;
        lines.lineStyle(2, held ? ui.purple : ui.dark, 1).lineBetween(x, y, lx, ly);
        const e = held ? enhancements.list().find((c) => c.vestige === v?.id && c.side === side) : undefined;
        const box = this.add.rectangle(lx, ly, LEAF, LEAF, held ? ui.deep : 0x0c0816, 1).setStrokeStyle(2, ui.dark);
        if (!e) continue;
        const icon = enhancementTexture(e.id);
        if (this.textures.exists(icon)) this.add.image(lx, ly, icon).setScale(iconScale(this, icon, LEAF));
        box.setInteractive({ cursor: cursorCss('pointer') });
        box.on('pointerover', () => (this.hovered = e.id));
        box.on('pointerout', () => this.hovered === e.id && (this.hovered = ''));
        box.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.press(e.id, pointer.rightButtonDown()));
        this.leaves.push({ box, id: e.id });
      }
    });
  }

  private held(id: string): boolean {
    return save.vestiges.includes(id);
  }

  private press(id: string, refund: boolean): void {
    const done = refund ? refundEnhancement(id) : buyEnhancement(id);
    this.sfx.play(done ? (refund ? 'click' : 'buy') : 'deny');
  }

  update(): void {
    this.count.setText(`PERCEPTION: ${perceptionLeft()} of ${perceptionEarned()} left`);
    for (const l of this.leaves) l.box.setStrokeStyle(bought(l.id) ? 3 : 2, bought(l.id) ? GOLD : this.hovered === l.id ? ui.lilac : ui.mid);
    const e = enhancements.get(this.hovered);
    if (!e) return void this.info.setText('Left click buys.\nRight click refunds.');
    const off = bought(e.id) && !isEquipped(e.vestige) ? `\n\nOnly works while ${vestiges.get(e.vestige)?.name ?? e.vestige} is equipped.` : '';
    this.info.setText(`${e.name}\n\n${e.text}${off}`);
  }
}
