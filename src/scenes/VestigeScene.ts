import Phaser from 'phaser';
import { save } from '../core/save';
import { equip, equippedIn, VESTIGE_SLOTS, vestiges, vestigeTexture } from '../data/vestiges';
import { Tex } from '../render/art';
import { cursorCss } from '../render/Cursors';
import { SoundFx } from '../render/SoundFx';
import { ui, uiText } from '../render/ui';

const KEYS = ['Q', 'E', 'R'];
const SLOT = 64;
const CELL = 72;
// The castle's Vestiges: the menu always shows this many places, held ones filled in.
const PLACES = 8;

// The Mindscape menu's Vestiges tab, laid over the arena: his slots on top, the Vestiges he holds below. Pick a slot,
// then click a Vestige to put it there (it leaves any other slot); clicking the one already there takes it out.
// The arena opens and closes it with Tab.
export class VestigeScene extends Phaser.Scene {
  private selected = 0;
  private slots: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image }[] = [];
  private places: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; id: string }[] = [];
  private info!: Phaser.GameObjects.Text;
  private sfx!: SoundFx;
  private hovered = '';

  constructor() {
    super('vestiges');
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.sfx = new SoundFx(this);
    this.slots = [];
    this.places = [];
    this.hovered = '';
    // Starts on the first empty slot, else the first.
    this.selected = Math.max(0, [...Array(VESTIGE_SLOTS).keys()].find((i) => !equippedIn(i)) ?? 0);
    const pointer = { cursor: cursorCss('pointer') };
    this.add.rectangle(0, 0, width, height, 0x0a0612, 0.9).setOrigin(0).setInteractive();
    this.add.text(cx, 30, 'MINDSCAPE', uiText(16)).setOrigin(0.5, 0);
    this.add.text(cx, 62, 'VESTIGES', uiText(8, { color: ui.dim })).setOrigin(0.5, 0);

    const top = height * 0.28;
    for (let i = 0; i < VESTIGE_SLOTS; i++) {
      const x = cx + (i - (VESTIGE_SLOTS - 1) / 2) * (SLOT + 20);
      const box = this.add.rectangle(x, top, SLOT, SLOT, ui.deep, 1).setInteractive(pointer);
      this.add.text(x - SLOT / 2 + 5, top - SLOT / 2 + 5, KEYS[i] ?? '', uiText(8, { color: ui.dim }));
      const icon = this.add.image(x, top, Tex.glow).setScale(5);
      box.on('pointerdown', () => {
        this.selected = i;
        this.sfx.play('click');
      });
      this.slots.push({ box, icon });
    }

    const rows = 2;
    const cols = PLACES / rows;
    const gridTop = top + SLOT + 40;
    const all = vestiges.list();
    for (let i = 0; i < PLACES; i++) {
      const v = all.find((x) => x.pedestal === i);
      const id = v && save.vestiges.includes(v.id) ? v.id : '';
      const x = cx + ((i % cols) - (cols - 1) / 2) * CELL;
      const y = gridTop + Math.floor(i / cols) * CELL + CELL / 2;
      const box = this.add.rectangle(x, y, CELL - 10, CELL - 10, ui.deep, id ? 1 : 0.4).setStrokeStyle(2, ui.dark);
      const icon = this.add.image(x, y, id ? vestigeTexture(id) : Tex.glow).setScale(4).setVisible(!!id);
      if (id) {
        box.setInteractive(pointer);
        box.on('pointerover', () => (this.hovered = id));
        box.on('pointerout', () => this.hovered === id && (this.hovered = ''));
        box.on('pointerdown', () => this.pick(id));
      }
      this.places.push({ box, icon, id });
    }
    this.info = this.add.text(cx, gridTop + rows * CELL + 24, '', uiText(8, { align: 'center', lineSpacing: 10 })).setOrigin(0.5, 0);
    this.add.text(cx, height - 40, 'TAB to close', uiText(8, { color: ui.dim })).setOrigin(0.5);
  }

  private pick(id: string): void {
    equip(this.selected, equippedIn(this.selected)?.id === id ? '' : id);
    this.sfx.play('buy');
  }

  update(): void {
    this.slots.forEach((s, i) => {
      const v = equippedIn(i);
      s.box.setStrokeStyle(3, i === this.selected ? ui.lilac : ui.mid);
      s.icon.setVisible(!!v);
      if (v) s.icon.setTexture(vestigeTexture(v.id));
    });
    for (const p of this.places) {
      if (!p.id) continue;
      p.box.setStrokeStyle(2, save.equipped.includes(p.id) ? ui.violet : this.hovered === p.id ? ui.lilac : ui.mid);
    }
    const v = vestiges.get(this.hovered) ?? equippedIn(this.selected);
    const held = save.vestiges.length;
    this.info.setText(held ? (v ? v.name : 'Pick a slot, then a Vestige to put in it.') : 'No Vestiges yet.');
  }
}
