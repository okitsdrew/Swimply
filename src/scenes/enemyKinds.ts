import Phaser from 'phaser';
import { run } from '../config/run';
import { WolfConfig } from '../config/werewolf';
import { Fx } from '../render/Fx';
import { PriestsView } from '../render/PriestsView';
import { ShadesView } from '../render/ShadesView';
import { SoundFx } from '../render/SoundFx';
import { WerewolvesView } from '../render/WerewolvesView';
import { Priest, Priests } from '../sim/Priests';
import { Shade, Shades } from '../sim/Shades';
import { Werewolf } from '../sim/Werewolf';
import { Werewolves } from '../sim/Werewolves';
import { EnemyKind } from './Enemies';

// What a kind needs from the scene to hook up its sounds and feel.
export interface KindContext {
  scene: Phaser.Scene;
  fx: Fx;
  sfx: SoundFx;
  // Freezes the sim briefly so a kill lands (see ArenaScene.freeze).
  freeze(seconds: number, force?: boolean): void;
}

// Each kind of enemy: its sim group and view, joined up, with its own sounds and the feel of its death. A new kind
// of enemy is a sim group, a view, and a function here, added to the scene's list.

export function shadeKind(c: KindContext): EnemyKind<Shade> & { group: Shades } {
  const group = new Shades();
  return {
    id: 'shade',
    group,
    view: new ShadesView(c.scene, group, c.fx),
    killed: () => {
      c.fx.addShake(run.killShake);
      c.freeze(run.killHitStop);
    },
    dev: { spawnLabel: 'Spawn a Shade', killLabel: 'Kill all Shades' },
  };
}

export function priestKind(c: KindContext): EnemyKind<Priest> {
  const group = new Priests();
  const view = new PriestsView(c.scene, group, c.fx);
  group.onCast = (_p, orb) => view.onCast(orb);
  group.onOrbGone = (x, y) => view.onOrbGone(x, y);
  group.onTeleport = (_p, x0, y0, x1, y1) => view.onTeleport(x0, y0, x1, y1);
  return {
    id: 'priest',
    group,
    view,
    killed: () => {
      c.fx.addShake(run.killShake);
      c.freeze(run.killHitStop);
    },
    dev: { spawnLabel: 'Spawn a Priest', killLabel: 'Kill Priests', near: 400 },
  };
}

// The Mindscape's mini-boss (`boss`, with the big bar) or the plain elites, by config section.
export function werewolfKind(c: KindContext, id: string, cfg: WolfConfig, boss: boolean): EnemyKind<Werewolf> & { group: Werewolves } {
  const group = new Werewolves(cfg);
  const view = new WerewolvesView(c.scene, group, c.fx, boss);
  group.onAttack = () => c.sfx.play('wolfAttack');
  group.onSlam = (w) => {
    c.sfx.play('wolfSmash');
    view.viewOf(w).onSlam();
  };
  group.onSwipe = (w) => {
    c.sfx.play('wolfSwipe');
    view.viewOf(w).onSwipe();
  };
  group.onLand = (w) => {
    c.sfx.play('wolfSmash');
    view.viewOf(w).onLand();
  };
  return {
    id,
    group,
    view,
    // The boss's own death (shards, winning) is the scene's; an elite's lands with a short forced freeze.
    killed: boss ? undefined : () => c.freeze(0.08, true),
    dev: boss
      ? { spawnLabel: 'Spawn werewolf', killLabel: 'Kill werewolf' }
      : { spawnLabel: 'Spawn elite werewolf', killLabel: 'Kill elite werewolves', near: 450 },
  };
}
