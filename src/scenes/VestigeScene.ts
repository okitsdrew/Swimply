import Phaser from 'phaser';
import { save } from '../core/save';
import { equip, equippedIn, VESTIGE_SLOTS, vestiges } from '../data/vestiges';
import { iconScale, Tex } from '../render/art';
import { SoundFx } from '../render/SoundFx';
import { ui, uiText } from '../render/ui';
import { menuFrame, menuInfo, menuPointer, PlaceGrid, SLOT } from './MindscapeMenu';

const KEYS = ['Q', 'E', 'R'];

// The Mindscape menu's Vestiges tab, laid over the arena: his slots on top, the Vestiges he holds below. Pick a slot,
// then click a Vestige to put it there (it leaves any other slot); clicking the one already there takes it out.
// The arena opens and closes the menu with Tab.
export class VestigeScene extends Phaser.Scene {
  private selected = 0;
  private slots: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image }[] = [];
  private grid!: PlaceGrid;
  private info!: Phaser.GameObjects.Text;
  private sfx!: SoundFx;

  constructor() {
    super('vestiges');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.sfx = new SoundFx(this);
    this.slots = [];
    // Starts on the first empty slot, else the first.
    this.selected = Math.max(0, [...Array(VESTIGE_SLOTS).keys()].find((i) => !equippedIn(i)) ?? 0);
    const { slotsY } = menuFrame(this, 'vestiges', 'VESTIGES', this.sfx);

    for (let i = 0; i < VESTIGE_SLOTS; i++) {
      const x = cx + (i - (VESTIGE_SLOTS - 1) / 2) * (SLOT + 20);
      const box = this.add.rectangle(x, slotsY, SLOT, SLOT, ui.deep, 1).setInteractive(menuPointer());
      this.add.text(x - SLOT / 2 + 5, slotsY - SLOT / 2 + 5, KEYS[i] ?? '', uiText(8, { color: ui.dim }));
      const icon = this.add.image(x, slotsY, Tex.glow).setScale(5);
      box.on('pointerdown', () => {
        this.selected = i;
        this.sfx.play('click');
      });
      this.slots.push({ box, icon });
    }

    const all = vestiges.list();
    this.grid = new PlaceGrid(this, slotsY, (place) => {
      const v = all.find((x) => x.pedestal === place);
      return v && save.vestiges.includes(v.id) ? { id: v.id, icon: v.icon } : null;
    }, (id) => this.pick(id));
    this.info = menuInfo(this, this.grid.infoY);
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
      if (v) s.icon.setTexture(v.icon).setScale(iconScale(this, v.icon, SLOT));
    });
    this.grid.outline((id) => save.equipped.includes(id));
    const v = vestiges.get(this.grid.hovered) ?? equippedIn(this.selected);
    const held = save.vestiges.length;
    this.info.setText(held ? (v ? v.name : 'Pick a slot, then a Vestige to put in it.') : 'No Vestiges yet.');
  }
}
