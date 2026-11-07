import Phaser from 'phaser';
import { iconScale } from '../render/art';
import { cursorCss } from '../render/Cursors';
import { SoundFx } from '../render/SoundFx';
import { ui, uiText } from '../render/ui';

// What the Mindscape menu's pages share, so they stay alike: the backdrop, the tabs in the top left, the slots' place
// on screen and the grid of 8 places below them. Each page is its own scene; the arena opens the one last shown.

export const SLOT = 64;
const CELL = 72;
const PLACES = 8;
const ROWS = 2;

const TABS = [{ scene: 'vestiges', label: 'VESTIGES' }, { scene: 'hats', label: 'HATS' }];
let current = TABS[0].scene;

// The page the menu opens on: the one it was last left on.
export const menuPage = (): string => current;
export const MENU_PAGES = TABS.map((t) => t.scene);

export const menuPointer = (): Phaser.Types.Input.InputConfiguration => ({ cursor: cursorCss('pointer') });

// Draws what every page has, and says where its slots go.
export function menuFrame(scene: Phaser.Scene, page: string, title: string, sfx: SoundFx): { slotsY: number } {
  const { width, height } = scene.scale;
  const cx = width / 2;
  current = page;
  scene.add.rectangle(0, 0, width, height, 0x0a0612, 0.9).setOrigin(0).setInteractive();
  scene.add.text(cx, 30, 'MINDSCAPE', uiText(16)).setOrigin(0.5, 0);
  scene.add.text(cx, 62, title, uiText(8, { color: ui.dim })).setOrigin(0.5, 0);
  scene.add.text(cx, height - 40, 'TAB to close', uiText(8, { color: ui.dim })).setOrigin(0.5);
  let x = 24;
  for (const tab of TABS) {
    const on = tab.scene === page;
    const label = scene.add.text(0, 38, tab.label, uiText(8, { color: on ? ui.bright : ui.dim })).setOrigin(0.5).setDepth(1);
    const w = label.width + 24;
    label.setX(x + w / 2);
    const box = scene.add.rectangle(x + w / 2, 38, w, 28, ui.deep, 1).setStrokeStyle(2, on ? ui.lilac : ui.mid);
    x += w + 8;
    if (on) continue;
    box.setInteractive(menuPointer());
    box.on('pointerdown', () => {
      sfx.play('click');
      scene.scene.start(tab.scene);
    });
  }
  return { slotsY: height * 0.28 };
}

// The grid of places, filled in with what he has. `at` says what sits in a place, if anything.
export class PlaceGrid {
  hovered = '';
  private filled: { box: Phaser.GameObjects.Rectangle; id: string }[] = [];
  // Where the words under the grid go.
  readonly infoY: number;

  constructor(scene: Phaser.Scene, slotsY: number, at: (place: number) => { id: string; icon: string } | null, pick: (id: string) => void) {
    const cx = scene.scale.width / 2;
    const cols = PLACES / ROWS;
    const top = slotsY + SLOT + 40;
    for (let i = 0; i < PLACES; i++) {
      const held = at(i);
      const x = cx + ((i % cols) - (cols - 1) / 2) * CELL;
      const y = top + Math.floor(i / cols) * CELL + CELL / 2;
      const box = scene.add.rectangle(x, y, CELL - 10, CELL - 10, ui.deep, held ? 1 : 0.4).setStrokeStyle(2, ui.dark);
      if (!held) continue;
      scene.add.image(x, y, held.icon).setScale(iconScale(scene, held.icon, CELL - 10));
      box.setInteractive(menuPointer());
      box.on('pointerover', () => (this.hovered = held.id));
      box.on('pointerout', () => this.hovered === held.id && (this.hovered = ''));
      box.on('pointerdown', () => pick(held.id));
      this.filled.push({ box, id: held.id });
    }
    this.infoY = top + ROWS * CELL + 24;
  }

  // Lights up what is in use, and what the mouse is on.
  outline(inUse: (id: string) => boolean): void {
    for (const p of this.filled) p.box.setStrokeStyle(2, inUse(p.id) ? ui.violet : this.hovered === p.id ? ui.lilac : ui.mid);
  }
}

// Words under the grid.
export const menuInfo = (scene: Phaser.Scene, y: number): Phaser.GameObjects.Text =>
  scene.add.text(scene.scale.width / 2, y, '', uiText(8, { align: 'center', lineSpacing: 10 })).setOrigin(0.5, 0);
