import Phaser from 'phaser';
import { render } from '../config/render';
import { vestiges as cfg } from '../config/vestiges';
import { toScreen } from '../core/iso';
import { save } from '../core/save';
import { AreaMap, Placed } from '../data/maps';
import { isEquipped, vestiges, vestigeTexture } from '../data/vestiges';
import { Tex } from './art';

const PEDESTALS = ['pedestal', 'empty_pedestal'];

// The throne room's pedestals: each Vestige he holds hovers over its own (its `pedestal` number in vestiges.json),
// and while it is equipped only a grey outline of it is there. Display only. The pedestals are the map's `pedestal`
// and `empty_pedestal` things round its `throne`, numbered clockwise as seen on screen, starting at the top.
export class PedestalsView {
  private shown: { v: string; at: Placed; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }[] = [];
  private age = 0;

  constructor(private scene: Phaser.Scene) {}

  // The pedestals in order, or none if the map has no throne.
  static order(map: AreaMap): Placed[] {
    const throne = map.objects.find((o) => o.asset.id === 'throne');
    if (!throne) return [];
    const angle = (o: Placed) => {
      const s = toScreen(o.x - throne.x, o.y - throne.y);
      // 0 straight up the screen, growing clockwise.
      return (Math.atan2(s.x, -s.y) + Math.PI * 2) % (Math.PI * 2);
    };
    return map.objects.filter((o) => PEDESTALS.includes(o.asset.id)).sort((a, b) => angle(a) - angle(b));
  }

  update(dt: number, map: AreaMap): void {
    this.age += dt;
    const order = PedestalsView.order(map);
    const want = order.length ? save.vestiges.flatMap((id) => {
      const v = vestiges.get(id);
      const at = v && order[v.pedestal];
      return at ? [{ v: id, at }] : [];
    }) : [];
    if (want.length !== this.shown.length || want.some((w, i) => w.v !== this.shown[i].v || w.at !== this.shown[i].at)) {
      for (const s of this.shown) {
        s.img.destroy();
        s.glow.destroy();
      }
      this.shown = want.map((w) => ({
        ...w,
        glow: this.scene.add.image(0, 0, Tex.glow).setBlendMode(Phaser.BlendModes.ADD),
        img: this.scene.add.image(0, 0, vestigeTexture(w.v)),
      }));
    }
    const px = render.pixelScale;
    this.shown.forEach((s, i) => {
      const v = vestiges.get(s.v)!;
      const out = isEquipped(s.v);
      const p = toScreen(s.at.x, s.at.y);
      const y = p.y - (cfg.pedestalHeight + Math.sin(this.age * 2 + i) * cfg.emblemBob) * px;
      s.img.setPosition(p.x, y).setScale(px * cfg.pedestalScale).setDepth(p.y + 1);
      if (out) s.img.setTintFill(cfg.outlineColor).setAlpha(cfg.outlineAlpha);
      else s.img.clearTint().setAlpha(1);
      s.glow.setVisible(!out).setPosition(p.x, y).setDepth(p.y).setTint(v.color).setScale(px * cfg.pedestalScale * 0.6).setAlpha(0.5 + 0.2 * Math.sin(this.age * 3 + i));
    });
  }
}
