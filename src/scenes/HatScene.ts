import Phaser from 'phaser';
import { save } from '../core/save';
import { hats, hatTexture, ownsHat, wearHat, wornHat } from '../data/hats';
import { iconScale, Tex } from '../render/art';
import { SoundFx } from '../render/SoundFx';
import { ui } from '../render/ui';
import { menuFrame, menuInfo, menuPointer, PlaceGrid, SLOT } from './MindscapeMenu';

// The Mindscape menu's Hats tab, laid out like the Vestiges tab: the one hat he wears on top, the ones he owns below.
// Click a hat to put it on; click the one he wears, or the slot, to take it off.
export class HatScene extends Phaser.Scene {
  private slot!: Phaser.GameObjects.Image;
  private grid!: PlaceGrid;
  private info!: Phaser.GameObjects.Text;
  private sfx!: SoundFx;

  constructor() {
    super('hats');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.sfx = new SoundFx(this);
    const { slotsY } = menuFrame(this, 'hats', 'HATS', this.sfx);

    const box = this.add.rectangle(cx, slotsY, SLOT, SLOT, ui.deep, 1).setStrokeStyle(3, ui.lilac).setInteractive(menuPointer());
    box.on('pointerdown', () => {
      if (!wornHat()) return;
      wearHat('');
      this.sfx.play('click');
    });
    this.slot = this.add.image(cx, slotsY, Tex.glow);

    const all = hats.list();
    this.grid = new PlaceGrid(this, slotsY, (place) => {
      const h = all.find((x) => x.place === place);
      return h && ownsHat(h.id) ? { id: h.id, icon: hatTexture(h.id) } : null;
    }, (id) => {
      wearHat(wornHat()?.id === id ? '' : id);
      this.sfx.play('buy');
    });
    this.info = menuInfo(this, this.grid.infoY);
  }

  update(): void {
    const worn = wornHat();
    this.slot.setVisible(!!worn);
    if (worn) this.slot.setTexture(hatTexture(worn.id)).setScale(iconScale(this, hatTexture(worn.id), SLOT));
    this.grid.outline((id) => save.hat === id);
    const h = hats.get(this.grid.hovered) ?? worn;
    this.info.setText(save.hats.length ? (h ? h.name : 'Pick a hat to wear.') : 'No hats yet.');
  }
}
