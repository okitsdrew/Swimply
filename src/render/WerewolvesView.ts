import Phaser from 'phaser';
import { Werewolf } from '../sim/Werewolf';
import { Werewolves } from '../sim/Werewolves';
import { EnemyView, ViewFrame } from './enemies';
import { Fx } from './Fx';
import { WerewolfView } from './WerewolfView';

// One WerewolfView per werewolf in the group, made when he first appears and removed when he dies.
export class WerewolvesView implements EnemyView<Werewolf> {
  private views = new Map<Werewolf, WerewolfView>();

  // `boss` gives each the big named bar under the run's clock instead of a small one over his head.
  constructor(private scene: Phaser.Scene, private wolves: Werewolves, private fx: Fx, private boss: boolean) {}

  viewOf(w: Werewolf): WerewolfView {
    let v = this.views.get(w);
    if (!v) this.views.set(w, (v = new WerewolfView(this.scene, w, this.fx, this.boss)));
    return v;
  }

  onRisen(w: Werewolf): void {
    this.viewOf(w).onRisen();
  }

  onKilled(x: number, y: number, w: Werewolf): void {
    this.viewOf(w).onKilled(x, y);
    this.views.get(w)?.destroy();
    this.views.delete(w);
  }

  render(f: ViewFrame): void {
    for (const w of this.wolves.list) this.viewOf(w);
    for (const [w, v] of this.views) {
      if (this.wolves.list.includes(w)) v.render(f.dt, f.width);
      else {
        v.destroy();
        this.views.delete(w);
      }
    }
  }

  clear(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
  }
}
