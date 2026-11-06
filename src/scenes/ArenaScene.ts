import Phaser from 'phaser';
import { player as cfgPlayer } from '../config/character';
import { camera } from '../config/feel';
import { render } from '../config/render';
import { run } from '../config/run';
import { sim } from '../config/sim';
import { story, timo } from '../config/story';
import { breakables as cfgBreakables } from '../config/breakables';
import { doomsday, flameTorrent } from '../config/vestiges';
import { werewolf as cfgElite, werewolfMiniboss as werewolf } from '../config/werewolf';
import { Input, KeyboardMouseSource } from '../core/input';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { allOn, AreaMap, findMarker, maps, Placed, withFlags } from '../data/maps';
import { ambienceFor, sounds } from '../data/sounds';
import { scriptFor, scripts, storyFlags } from '../data/story';
import { addShards, maxTree, resetTree } from '../data/tree';
import { forgetVestiges, isEquipped, unlockVestige, vestiges } from '../data/vestiges';
import { save, writeSave } from '../core/save';
import { DevMenu } from '../dev/DevMenu';
import { AmbienceView } from '../render/AmbienceView';
import { LoopSounds } from '../render/LoopSounds';
import { SoundFx } from '../render/SoundFx';
import { ArrowsView } from '../render/ArrowsView';
import { FireballsView } from '../render/FireballsView';
import { BreakablesView } from '../render/BreakablesView';
import { makeArt } from '../render/art';
import { cursorCss } from '../render/Cursors';
import { DialogueBox } from '../render/DialogueBox';
import { Eyelids } from '../render/Eyelids';
import { Fx } from '../render/Fx';
import { GhostText } from '../render/GhostText';
import { HeroPose } from '../render/HeroPose';
import { DoorsView } from '../render/DoorsView';
import { InteractHint } from '../render/InteractHint';
import { MapView } from '../render/MapView';
import { PedestalsView } from '../render/PedestalsView';
import { StatusView } from '../render/StatusView';
import { PickupsView } from '../render/PickupsView';
import { PlayerView } from '../render/PlayerView';
import { RunHud } from '../render/RunHud';
import { TimoView } from '../render/TimoView';
import { VestigesView } from '../render/VestigesView';
import { Arrows } from '../sim/Arrows';
import { Fireballs } from '../sim/Fireballs';
import { Breakables } from '../sim/Breakables';
import { Pickups } from '../sim/Pickups';
import { Player } from '../sim/Player';
import { Run } from '../sim/Run';
import { stats } from '../sim/stats';
import { Enemy } from '../sim/enemies';
import { Effect, EFFECT_KINDS } from '../sim/status';
import { Target } from '../sim/targets';
import { FlowField } from '../sim/Nav';
import { VestigeCaster } from '../sim/Vestiges';
import { MapWorld } from '../sim/World';
import { Enemies } from './Enemies';
import { kateKind, priestKind, shadeKind, werewolfKind } from './enemyKinds';
import { ArenaParts, Mindscape, TreeScreen, winMindscape } from './Mindscape';
import { StoryRunner } from './StoryRunner';
import { drawHitboxes } from './hitboxes';
import { Travel } from './Travel';

const DEFAULT_MAP = 'spawn';

// The page address can pick what to play, which is how the level editor's "play here" opens the game:
//   ?map=spawn        play that map
//   &at=320,640       start there (world units) instead of at the map's player start
//   &calm             no Shades appear, to walk round a map
// The map is kept in the address, so the reload after a tool saves comes back to the same map.
const params = new URLSearchParams(location.search);

// The arena: a map from src/data/maps, played the way its mode says. In the Mindscape the run (Shades that keep
// coming, death, the upgrade tree, and the next run) is Mindscape.ts's. Any other map is calm: no Shades, no run
// clock, and a death puts him back where he came in. Doors and things with a `to` lead to other maps. The sim
// runs on a fixed time step here; drawing runs once per screen frame. Switching map restarts the scene with the new
// map's id.
export class ArenaScene extends Phaser.Scene {
  private input2!: Input;
  private mapId = params.get('map') ?? DEFAULT_MAP;
  // The map as the save's flags show it (see withFlags), less anything broken this visit.
  private map!: AreaMap;
  // The map as its file has it, everything in it, for showing it again as flags change.
  private baseMap!: AreaMap;
  // Flags turned on by breaking things this visit. They only reach the save when he leaves through a door alive; a
  // death starts the map over without them, so whatever he broke is back.
  private areaFlags: Record<string, boolean> = {};
  // Things broken this visit that set no flag: gone until he comes back.
  private broken = new Set<Placed>();
  private breakables!: Breakables;
  private breakablesView!: BreakablesView;
  // Not the Mindscape: no Shades, no run, no tree.
  private calm = false;
  // The run, in the Mindscape only.
  private mindscape: Mindscape | null = null;
  private tree!: TreeScreen;
  // Where he comes in, when another map sent him here.
  private arriveAt: Vec2 | null = null;
  // The door here he came in through, when another map's door sent him; he appears on clear floor beside it.
  private arriveDoor: Vec2 | null = null;
  // Doors, links and the fade to another map.
  private travel!: Travel;
  private hint!: InteractHint;
  private doorsView!: DoorsView;
  private box!: DialogueBox;
  private ghost!: GhostText;
  private story!: StoryRunner;
  private timo!: TimoView;
  // Whether Timo was thrown (a Doomsday on its way) last frame.
  private timoThrown = false;
  // A story step has him hidden inside the hero.
  private timoHidden = false;
  private kates!: ReturnType<typeof kateKind>;
  private lids!: Eyelids;
  private pose!: HeroPose;
  // Whether the hero's own look was hidden (a pose, a Vestige) last frame.
  private posed = false;
  private ambience!: AmbienceView;
  private sfx!: SoundFx;
  private loops!: LoopSounds;
  // A script can take control away (the hero lying down, a scene playing out).
  private control = true;
  // A story walk: where he is going, how close counts as there, and how long he has been stuck.
  private walkTo: { x: number; y: number; stop: number; stuck: number; last: number } | null = null;
  // A story camera move, in screen space: from where, to where (null: back to him), seconds in and in all.
  private pan: { from: Vec2; to: Vec2 | null; time: number; total: number } | null = null;
  private world!: MapWorld;
  private nav!: FlowField;
  private mapView!: MapView;
  private player!: Player;
  private view!: PlayerView;
  private fx!: Fx;
  private arrows!: Arrows;
  private arrowsView!: ArrowsView;
  private pickups!: Pickups;
  private caster!: VestigeCaster;
  private fireballs!: Fireballs;
  private fireballsView!: FireballsView;
  private vestigesView!: VestigesView;
  private pedestals!: PedestalsView;
  private statusView!: StatusView;
  private everyone: Enemy[] = [];
  // The Mindscape menu (Vestiges) is open over the arena.
  private menuOpen = false;
  private pickupsView!: PickupsView;
  // Every enemy, of every kind (see enemyKinds.ts).
  private enemies!: Enemies;
  private targets: Target[] = [];
  private run!: Run;
  private hud!: RunHud;
  private debug!: Phaser.GameObjects.Graphics;
  private showHitboxes = false;
  private camCenter = { x: 0, y: 0 };
  // Sim time owed to the fixed step, carried between frames.
  private acc = 0;
  private hitStop = 0;
  // Seconds since the last hit-stop began, for run.hitStopGap.
  private sinceHitStop = Infinity;
  private paused = false;
  private stepsQueued = 0;
  private aim: Vec2 | null = null;
  private cursor = '';

  constructor() {
    super('arena');
  }

  // Sounds load once; a restart finds them already in the cache.
  preload(): void {
    for (const s of sounds.list()) if (!this.cache.audio.exists(s.id)) this.load.audio(s.id, s.url);
  }

  init(data: { map?: string; at?: Vec2; door?: Vec2 }): void {
    if (data.map) this.mapId = data.map;
    this.arriveAt = data.at ?? null;
    this.arriveDoor = data.door ?? null;
  }

  create(): void {
    // A missing map (renamed or deleted file) falls back to any map rather than a blank screen.
    const map = maps.get(this.mapId) ?? maps.get(DEFAULT_MAP) ?? maps.list()[0];
    if (!map) throw new Error('No maps in src/data/maps');
    this.baseMap = map;
    this.areaFlags = {};
    this.broken = new Set();
    this.map = withFlags(map, save.flags);
    this.mapId = map.id;
    this.calm = map.mode !== 'mindscape';
    if (params.get('map') !== map.id) {
      params.set('map', map.id);
      params.delete('at');
      history.replaceState(null, '', `?${params}`);
    }
    this.world = new MapWorld(this.map);
    this.nav = new FlowField(this.map, this.world);
    this.acc = 0;
    this.paused = false;
    this.stepsQueued = 0;

    makeArt(this);
    this.cameras.main.setBackgroundColor(0x000000);
    this.cameras.main.fadeIn(story.fadeTime * 1000);
    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.fx = new Fx(this);
    this.mapView = new MapView(this, this.map, false);
    this.debug = this.add.graphics().setDepth(1e7);

    this.player = new Player(this.world);
    this.view = new PlayerView(this, this.player, this.fx);
    this.arrows = new Arrows();
    this.arrowsView = new ArrowsView(this, this.arrows, this.fx);
    this.breakables = new Breakables();
    this.breakablesView = new BreakablesView(this.mapView, this.fx);
    this.pickups = new Pickups();
    this.pickupsView = new PickupsView(this, this.pickups);
    this.sfx = new SoundFx(this);
    this.caster = new VestigeCaster(this.world, this.player, (x, y) => this.nav.reachable(x, y));
    this.vestigesView = new VestigesView(this, this.caster, this.fx);
    this.pedestals = new PedestalsView(this);
    this.statusView = new StatusView(this, this.fx);
    this.caster.onDeny = () => this.sfx.play('deny');
    this.caster.onBlast = (x, y) => this.doomsdayBlast(x, y);
    this.fireballs = new Fireballs(this.world, (o) => this.breakables.canBreak(o));
    this.fireballs.onHitThing = (thing, damage) => {
      const s = toScreen(thing.x, thing.y);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, damage);
      this.sfx.play('hit');
      this.breakables.burn(thing, flameTorrent.burn, flameTorrent.burnPower);
      this.breakables.damage(thing, damage);
    };
    this.fireballsView = new FireballsView(this, this.fireballs, this.fx);
    this.caster.onTorrent = (dx, dy) => {
      this.fireballs.cast(this.player.x, this.player.y, dx, dy);
      this.sfx.play('flameTorrent');
    };
    this.fireballs.onSnuffed = (x, y) => {
      const s = toScreen(x, y);
      this.fx.smoke(s.x, s.y - flameTorrent.height * render.pixelScale, 4, 4 * render.pixelScale);
    };
    this.caster.playing = (id) => id === 'flame_torrent' && this.fireballs.active;
    this.vestigesView.emblemAt = (id) => (id === 'flame_torrent' ? this.fireballs.lead : null);
    this.fireballs.onHit = (target, damage, x, y) => {
      this.enemies.damage(target, damage, x, y);
      this.enemies.afflict(target as Enemy, [{ kind: 'burn', seconds: flameTorrent.burn, power: flameTorrent.burnPower }]);
      const s = toScreen(target.x, target.y);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, damage);
      this.sfx.play('hit');
    };
    this.travel = new Travel(this, this.mapId, this.calm, this.world, this.player, this.sfx);
    // He got out alive, so what he broke here stays broken.
    this.travel.onLeave = () => {
      if (!Object.keys(this.areaFlags).length) return;
      Object.assign(save.flags, this.areaFlags);
      writeSave();
    };
    const kc = { scene: this, fx: this.fx, sfx: this.sfx, freeze: (s: number, force?: boolean) => this.freeze(s, force) };
    const shadeK = shadeKind(kc);
    const bossK = werewolfKind(kc, 'werewolf_miniboss', werewolf, true);
    // In the Mindscape the dev menu's Shade and werewolf come the run's way, in its spawn zones.
    if (!this.calm) {
      shadeK.dev!.spawn = () => this.run.spawn();
      bossK.dev!.spawn = () => this.mindscape?.spawnWolf();
    }
    const kateK = kateKind(kc, this.world);
    this.kates = kateK;
    // Beaten: a short freeze, then her last words; the script fades her out, and her death gives back the Vestige.
    kateK.group.onDying = () => {
      this.freeze(0.15, true);
      this.playScript('kate-defeated');
    };
    // Said every time she gets here, over whatever is going on.
    kateK.group.onPhase2 = () => {
      const aside = scripts.get('kate-phase2');
      if (aside) this.story.aside(aside);
    };
    this.enemies = new Enemies([shadeK, priestKind(kc), bossK, werewolfKind(kc, 'werewolf', cfgElite, false), kateK], this.world, this.nav, this.player);
    this.enemies.onFlag = (flag) => {
      this.areaFlags[flag] = true;
      this.showMap();
    };
    this.enemies.onKilled = (kind, x, y) => {
      this.mindscape?.onKilled(kind, x, y);
      if (kind === 'kate') this.kateBeaten();
    };
    this.enemies.onBurn = (e, amount) => {
      const s = toScreen(e.x, e.y);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, amount);
    };
    this.view.onStep = () => this.sfx.play('step');
    this.run = new Run(shadeK.group);
    this.run.holdSpawns = this.calm || params.has('calm');
    this.hud = new RunHud(this, this.run);
    this.hud.showRun = !this.calm;
    this.hint = new InteractHint(this);
    this.doorsView = new DoorsView(this);
    this.doorsView.onUnlock = () => this.sfx.play('unlock');
    this.box = new DialogueBox(this);
    this.ghost = new GhostText(this);
    this.timo = new TimoView(this);
    this.timoHidden = false;
    this.timo.setVisible(this.calm);
    this.lids = new Eyelids(this);
    this.ambience = new AmbienceView(this, ambienceFor(this.mapId));
    this.loops = new LoopSounds(this, this.map);
    this.pose = new HeroPose(this);
    this.posed = false;
    this.control = true;
    this.walkTo = null;
    this.pan = null;
    this.menuOpen = false;
    const walking = () => this.walkTo !== null;
    const player = this.player;
    const dying = () => this.kates.group.list.some((k) => k.dying);
    this.story = new StoryRunner(this.box, this.ghost, {
      // Timo keeps his face while someone else speaks or the scene pauses, and goes back to idling when it ends.
      onLine: (speaker, face) => {
        if (speaker === 'timo') this.timo.setFace(face);
        else if (speaker === 'kate') this.kates.view.look(face);
        else if (speaker === null) this.timo.setFace('');
      },
      setControl: (on) => {
        this.control = on;
        if (!on) this.player.stop();
      },
      eyes: (open, seconds) => (open ? this.lids.wakeUp(seconds) : this.lids.close()),
      pose: (pose, seconds, frames) => (pose === 'asleep' ? this.pose.asleep() : this.pose.standUp(seconds, frames)),
      moveTimo: (target) => this.moveTimo(target),
      shake: (amount) => this.fx.addShake(amount),
      flag: () => this.showMap(),
      sound: (id) => this.sfx.playSound(id),
      camera: (target, seconds) => this.panTo(target, seconds),
      walk: (target) => this.walkToward(target),
      get walking() {
        return walking();
      },
      dash: (target) => {
        const s = this.spotOf(target);
        if (s) this.player.dashAt(s.x, s.y);
      },
      get dashing() {
        return player.dashing;
      },
      look: (who, face) => who === 'kate' && this.kates.view.look(face),
      butterfly: (on) => this.kates.view.butterfly(on),
      bark: (who, color, text, seconds) => who === 'kate' && this.kates.view.bark(text, color, seconds),
      defeat: (who) => who === 'kate' && this.kates.group.list.forEach((k) => k.startFade()),
      get defeating() {
        return dying();
      },
      vestige: (id) => this.reclaim(id),
    });

    this.player.onFire = (_x, _y, dx, dy) => {
      const m = this.view.muzzle();
      this.arrows.fire(m.x, m.y, dx, dy);
      this.view.onFire();
      this.sfx.play('fire');
      this.story.notify('fire');
    };
    this.caster.onAim = () => this.story.notify('vestige');
    this.player.onDashStart = () => {
      this.view.onDashStart();
      this.sfx.play('dash');
      this.story.notify('dash');
    };
    this.player.onTeleport = (x0, y0, x1, y1, t) => {
      this.view.onTeleport(x0, y0, x1, y1, t);
      this.sfx.play('teleport');
      this.story.notify('teleport');
    };
    this.player.onTeleportArrive = (x, y) => this.view.onTeleportArrive(x, y);
    this.player.onBlink = (x0, y0, x1, y1, t) => {
      this.view.onBlink(x0, y0, x1, y1, t);
      this.sfx.play('teleport');
    };
    this.arrows.onHit = (target, damage, ax, ay, dx, dy) => {
      // Knockback pushes away from a point just behind the hit, so along the arrow's flight.
      this.enemies.damage(target, damage, ax - dx, ay - dy);
      const s = toScreen(ax, ay);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, damage);
      this.fx.addShake(camera.shakeOnHit);
      this.sfx.play('hit');
    };
    this.arrows.onBlocked = (x, y, thing, damage) => {
      if (!thing || !this.breakables.canBreak(thing)) return;
      const s = toScreen(x, y);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, damage);
      this.sfx.play('hit');
      this.breakables.damage(thing, damage);
    };
    this.breakables.onHit = (thing) => this.breakablesView.onHit(thing);
    this.breakables.onBroken = (thing) => this.onBroken(thing);
    const parts: ArenaParts = {
      scene: this, map: () => this.map, world: this.world, player: this.player, run: this.run, hud: this.hud, enemies: this.enemies,
      pickups: this.pickups, sfx: this.sfx, ghost: this.ghost, travel: this.travel, input: this.input2,
      freeze: (s, force) => this.freeze(s, force), pause: (on) => (this.paused = on), startRun: () => this.startRun(),
    };
    this.tree = new TreeScreen(parts);
    this.mindscape = this.calm ? null : new Mindscape(parts, this.tree, bossK.group, DEFAULT_MAP);

    this.startRun();
    const script = scriptFor(this.mapId, save.flags);
    if (script) this.story.play(script);
    // A retry: she has already met him, so she does not wait to be hit.
    if (save.flags.kateMet) this.kates.group.list.forEach((k) => k.wake());

    DevMenu.get().setActions([
      { label: 'Restart run', run: () => this.startRun() },
      { label: 'Skip 15s', run: () => (this.run.time += 15) },
      ...this.enemies.devActions(),
      { label: 'Hold spawns', run: () => (this.run.holdSpawns = !this.run.holdSpawns) },
      { label: 'Pause', run: () => (this.paused = !this.paused) },
      { label: 'Step', run: () => { this.paused = true; this.stepsQueued++; } },
      { label: 'Open tree', run: () => this.tree.show() },
      { label: '+50 shards', run: () => addShards(50) },
      { label: 'Reset tree (refund)', run: () => resetTree(true) },
      { label: 'Reset tree and shards', run: () => { resetTree(false); save.shards = 0; addShards(0); } },
      { label: 'Max tree', run: () => maxTree() },
      { label: 'Toggle hitboxes', run: () => (this.showHitboxes = !this.showHitboxes) },
      { label: `Next map (${map.name})`, run: () => this.nextMap() },
      { label: 'Reset this map (unbreak, revive)', run: () => this.resetMapFlags() },
      { label: 'Story: fresh start', run: () => this.storyFresh() },
      { label: 'Story: Mindscape won', run: () => this.storyWon() },
      { label: 'Vestige: grant Doomsday', run: () => unlockVestige('doomsday') },
      { label: 'Vestige: grant Flame Torrent', run: () => unlockVestige('flame_torrent') },
      { label: 'Vestiges: forget all', run: () => forgetVestiges() },
      ...EFFECT_KINDS.map((kind) => ({ label: `Effect: ${kind} all (3s)`, run: () => this.afflictAll({ kind, seconds: 3, power: kind === 'burn' ? 20 : 0.5 }) })),
      { label: 'Asset maker', run: () => window.open('asset-maker.html', 'swimply-asset-maker') },
      { label: 'Level editor', run: () => window.open(`level-editor.html?map=${this.mapId}`, 'swimply-level-editor') },
    ]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input2.destroy();
      this.scene.stop('tree');
      this.scene.stop('vestiges');
    });
  }

  // Tab: the Mindscape menu, to equip Vestiges. It opens only once he holds one, and only while no fight is on, no
  // scene is playing and nothing else is open. The game waits while it is open.
  private toggleMenu(): void {
    if (this.menuOpen) {
      this.menuOpen = false;
      this.scene.stop('vestiges');
      this.sfx.play('click');
      // Clicks in the menu also reached the game's input; drop them so they don't fire an arrow.
      this.input2.endFrame();
      this.player.fireBlocked = true;
      this.paused = false;
      return;
    }
    const can = save.vestiges.length > 0 && this.run.state === 'fighting' && this.control && !this.story.playing && !this.tree.open && !this.travel.leaving && !this.enemies.fighting();
    if (!can) return void this.sfx.play('deny');
    this.menuOpen = true;
    this.caster.aiming = -1;
    this.paused = true;
    this.sfx.play('treeOpen');
    this.scene.launch('vestiges');
  }

  private nextMap(): void {
    const all = maps.list();
    const next = all[(all.findIndex((m) => m.id === this.mapId) + 1) % all.length];
    this.scene.restart({ map: next.id });
  }

  // A spot the story names: "x,y" in world units, or the first placed thing of that asset id, with how far its
  // collision reaches from its middle.
  private spotOf(target: string): { x: number; y: number; reach: number } | null {
    const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(target);
    if (m) return { x: Number(m[1]), y: Number(m[2]), reach: 0 };
    const o = this.map.objects.find((p) => p.asset.id === target);
    if (!o) return console.warn(`[story] ${JSON.stringify(target)} is not placed in ${this.mapId}`), null;
    const reach = Math.max(0, ...o.asset.collision.map((c) => (Math.hypot(c.x, c.y) + c.radius) * o.size));
    return { x: o.x, y: o.y, reach };
  }

  private panTo(target: string, seconds: number): void {
    const to = target === 'hero' ? null : this.spotOf(target);
    if (target !== 'hero' && !to) return;
    this.pan = { from: { ...this.camCenter }, to: to ? toScreen(to.x, to.y) : null, time: 0, total: seconds };
  }

  private walkToward(target: string): void {
    const s = this.spotOf(target);
    this.walkTo = s && { x: s.x, y: s.y, stop: s.reach + cfgPlayer.bodyRadius + story.walkStop, stuck: 0, last: Infinity };
  }

  private moveTimo(target: string): void {
    if (target === 'hero') return this.timo.followHero();
    if (target === 'hide') return void (this.timoHidden = true);
    if (target === 'pop') {
      this.timoHidden = false;
      this.timo.popBack(this.player.x, this.player.y);
      const s = toScreen(this.timo.x, this.timo.y);
      this.fx.smoke(s.x, s.y - 12 * render.pixelScale, 6, 6 * render.pixelScale);
      return;
    }
    const o = this.map.objects.find((p) => p.asset.id === target);
    if (o) this.timo.goTo(o.x, o.y);
    else console.warn(`[story] Timo is sent to ${JSON.stringify(target)}, which is not placed in ${this.mapId}`);
  }

  // Dev aids for the story: back to waking up, or straight to after the Mindscape.
  // Dev aid: turns off every "broken sets" / "killed sets" flag this map's things use, then starts the map over
  // where he stands, so broken spawners and killed enemies are back for testing.
  private resetMapFlags(): void {
    for (const o of this.baseMap.objects) if (o.onBreak) delete save.flags[o.onBreak];
    writeSave();
    this.scene.restart({ map: this.mapId, at: { x: this.player.x, y: this.player.y } });
  }

  private storyFresh(): void {
    save.flags = {};
    resetTree(false);
    save.shards = 0;
    addShards(0);
    forgetVestiges();
    Travel.forget();
    this.scene.restart({ map: DEFAULT_MAP });
  }

  private storyWon(): void {
    for (const f of storyFlags()) delete save.flags[f];
    winMindscape();
    this.scene.restart({ map: DEFAULT_MAP });
  }

  // Freezes the sim briefly so a kill lands. Kills in quick succession share one freeze unless `force`.
  private freeze(seconds: number, force = false): void {
    if (seconds <= 0 || (!force && this.hitStop <= 0 && this.sinceHitStop < run.hitStopGap)) return;
    if (this.hitStop <= 0) this.sinceHitStop = 0;
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  // Dev aid: an effect on every enemy out, as its kind lets through.
  private afflictAll(effect: Effect): void {
    for (const e of this.enemies.all(this.everyone)) this.enemies.afflict(e, [effect]);
  }

  // Timo's Doomsday Scenario goes off where he landed: enemies and things that break, within reach, are hurt.
  private doomsdayBlast(x: number, y: number): void {
    const number = (ex: number, ey: number, amount: number) => {
      const s = toScreen(ex, ey);
      this.fx.damageNumber(s.x, s.y - render.arrowHeight, amount);
    };
    const stun = [{ kind: 'stun' as const, seconds: doomsday.stun, power: 0 }];
    this.enemies.blast(x, y, doomsday.damageRadius, doomsday.damage, doomsday.knockbackRadius, doomsday.knockback, stun, (e) => number(e.x, e.y, doomsday.damage));
    const amount = doomsday.damage * doomsday.breakDamage;
    for (const o of [...this.map.objects]) {
      if (amount <= 0 || !this.breakables.canBreak(o) || Math.hypot(o.x - x, o.y - y) > doomsday.damageRadius) continue;
      number(o.x, o.y, amount);
      this.breakables.damage(o, amount);
    }
    this.vestigesView.blast(x, y);
    this.sfx.play('doomsday');
    this.freeze(doomsday.hitStop, true);
  }

  // Something gave way: its flag turns on for this visit (or it is just gone, with none), and the map is shown again
  // with the flags as they are now, so other things that wait on that flag come or go too.
  private onBroken(thing: Placed): void {
    this.breakablesView.onBroken(thing);
    this.freeze(cfgBreakables.breakHitStop, true);
    if (thing.onBreak) this.areaFlags[thing.onBreak] = true;
    else this.broken.add(thing);
    this.showMap();
  }

  // Updates the map to the save's flags plus this visit's, less what broke: the drawing, what is solid, and the routes
  // walkers take. Only what changed is redone.
  private showMap(): void {
    const next = withFlags(this.baseMap, { ...save.flags, ...this.areaFlags });
    next.objects = next.objects.filter((o) => !this.broken.has(o));
    const now = new Set(next.objects);
    const was = new Set(this.map.objects);
    const removed = this.map.objects.filter((o) => !now.has(o));
    const added = next.objects.filter((o) => !was.has(o));
    if (!removed.length && !added.length) return;
    this.nav.refresh(this.world.change(removed, added));
    this.mapView.update(next);
    this.map = next;
    this.travel.near = null;
  }

  // A link is locked until its "opens when" flags are on (this visit's count), and, if it asks, the map is cleared.
  private isOpen(o: Placed): boolean {
    return allOn(o.opens, { ...save.flags, ...this.areaFlags }) && (!o.opensWhenClear || this.enemies.cleared(this.map));
  }

  private startRun(): void {
    this.enemies.clear();
    this.pickups.clear();
    this.pickupsView.clear();
    this.mindscape?.reset();
    this.arrows.clear();
    this.fireballs.clear();
    this.caster.reset();
    this.breakables.clear();
    this.breakablesView.clear();
    // A new run puts back what the last one broke.
    if (this.broken.size || Object.keys(this.areaFlags).length) {
      this.broken.clear();
      this.areaFlags = {};
      this.showMap();
    }
    this.enemies.place(this.map);
    // Where the address says, else the map's player start marker, else the middle of the map.
    const at = params.get('at')?.split(',').map(Number);
    const start = (this.arriveDoor && this.travel.besideDoor(this.map, this.arriveDoor)) ?? this.arriveAt ?? (at?.length === 2 && at.every(Number.isFinite) ? { x: at[0], y: at[1] }
      : findMarker(this.map, 'playerStart') ?? { x: this.world.width / 2, y: this.world.height / 2 });
    this.player.reset(start.x, start.y);
    this.view.setVisible(true);
    this.run.reset();
    this.hitStop = 0;
    this.acc = 0;
    const s = toScreen(this.player.x, this.player.y);
    this.camCenter = { x: s.x, y: s.y };
  }

  update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, 0.25);
    const input = this.input2;
    const cam = this.cameras.main;
    input.update();
    // Checked here, not in step(), because the sim does not step while the tree pauses a run.
    if (this.tree.open && input.justPressed('dash')) this.tree.close();
    if (input.justPressed('menu')) {
      input.consume('menu');
      this.toggleMenu();
    }
    this.mapView.reveal(this.player.x, this.player.y);
    this.mapView.render();
    this.aim = input.aim ? toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y + render.aimHeight) : null;

    // Fixed time step: real time is banked, then spent in equal steps. A kill's hit-stop and the dev pause
    // simply stop banking, so the sim freezes while drawing carries on.
    const step = 1 / Math.max(sim.stepRate, 1);
    this.sinceHitStop += frameDt;
    if (this.hitStop > 0) this.hitStop -= frameDt;
    else if (!this.paused) this.acc += frameDt * sim.timeScale;
    if (this.paused && this.stepsQueued > 0) {
      this.acc = step * this.stepsQueued;
      this.stepsQueued = 0;
    }
    let steps = 0;
    while (this.acc >= step && steps < sim.maxStepsPerFrame) {
      this.step(step);
      // A press is acted on in the first step that sees it. With no step this frame it waits for the next one.
      input.endFrame();
      this.acc -= step;
      steps++;
    }
    // Too far behind (a slow frame or a background tab): drop the backlog rather than fast-forward.
    if (this.acc >= step) this.acc = 0;
    const simDt = steps * step;

    if (this.run.state === 'fighting') this.view.update(simDt);
    this.fx.update(frameDt * (this.paused ? 0 : sim.timeScale));

    // The camera follows the player's projected position, with screen shake on top.
    const s = toScreen(this.player.x, this.player.y);
    if (this.pan) {
      // A story camera move eases from where the camera was to its spot, or back to him.
      const pan = this.pan;
      pan.time += frameDt;
      const t = pan.total > 0 ? Math.min(1, pan.time / pan.total) : 1;
      const e = t * t * (3 - 2 * t);
      const to = pan.to ?? s;
      this.camCenter.x = pan.from.x + (to.x - pan.from.x) * e;
      this.camCenter.y = pan.from.y + (to.y - pan.from.y) * e;
      if (t >= 1 && !pan.to) this.pan = null;
    } else {
      const follow = 1 - Math.exp(-camera.followRate * frameDt);
      this.camCenter.x += (s.x - this.camCenter.x) * follow;
      this.camCenter.y += (s.y - this.camCenter.y) * follow;
    }
    cam.scrollX = this.camCenter.x - cam.width / 2 + this.fx.shakeOffset.x;
    cam.scrollY = this.camCenter.y - cam.height / 2 + this.fx.shakeOffset.y;

    this.arrowsView.render();
    this.fireballsView.update(frameDt);
    this.enemies.render({ dt: frameDt, simDt: frameDt * (this.paused ? 0 : sim.timeScale), playerX: this.player.x, playerY: this.player.y, world: this.world, width: cam.width });
    this.pickupsView.render(frameDt);
    this.doorsView.update(frameDt, this.map, (o) => this.isOpen(o));
    this.breakablesView.update(frameDt, this.breakables.burning());
    // A story pose (lying, getting up) stands in for his normal look.
    this.pose.update(frameDt, this.player.x, this.player.y);
    // Doomsday hides him from the portal until the blast.
    const hidden = this.pose.active || this.player.blinking || this.caster.charging;
    if (hidden !== this.posed && this.run.state === 'fighting') this.view.setVisible(!hidden);
    this.posed = hidden;
    if (this.walkTo) {
      // Timo leads the way on a story walk.
      const w = this.walkTo;
      const d = Math.hypot(w.x - this.player.x, w.y - this.player.y) || 1;
      const ahead = Math.min(timo.leadDistance, d);
      this.timo.lead(this.player.x + ((w.x - this.player.x) / d) * ahead, this.player.y + ((w.y - this.player.y) / d) * ahead);
    }
    // Timo is Doomsday's emblem: in his Doomsday face and glowing while it is in use, thrown at the spot (even in the
    // Mindscape), inside the ball until the blast, then back by him. Once Timo's Vestige is his, he floats by him only
    // while it is equipped; otherwise he is inside him, coming out only to talk.
    const c = this.caster;
    const doom = c.active('doomsday');
    if (c.throwing) {
      this.timo.setVisible(true);
      this.timo.throwAt(c.target.x, c.target.y, c.throwProgress);
    } else if (c.blastPending) this.timo.setVisible(false);
    else {
      const shown = this.calm && !this.timoHidden && (this.story.playing || !save.vestiges.includes('doomsday') || isEquipped('doomsday'));
      if (this.timoThrown) {
        this.timo.popBack(this.player.x, this.player.y);
        const s = toScreen(this.timo.x, this.timo.y);
        if (shown) this.fx.smoke(s.x, s.y - 12 * render.pixelScale, 6, 6 * render.pixelScale);
      }
      this.timo.setVisible(shown);
    }
    this.timoThrown = c.blastPending;
    if (!this.story.playing) this.timo.setFace(doom ? 'timo_doom' : '');
    this.timo.setGlow(doom ? doomsday.blastColor : -1);
    this.timo.update(frameDt, this.player.x, this.player.y);
    this.pedestals.update(frameDt, this.map);
    this.statusView.update(frameDt, this.enemies.all(this.everyone));
    this.vestigesView.update(frameDt, this.player.x, this.player.y, this.run.state === 'fighting' && !hidden, cam.width, cam.height);
    this.lids.update(frameDt, cam.width, cam.height);
    this.ambience.update(frameDt);
    this.loops.update(this.player.x, this.player.y);
    this.box.update(frameDt, cam.width, this.player.x, this.player.y);
    this.ghost.update(frameDt, cam.width, cam.height);
    this.hint.update(frameDt, this.player.x, this.player.y, !!this.travel.near && !this.travel.leaving && this.control && this.run.state === 'fighting');
    const notes = [...(this.mindscape?.notes(this.showHitboxes) ?? []), this.paused && !this.tree.open && !this.menuOpen && 'PAUSED', sim.godMode && 'GOD MODE'].filter(Boolean);
    this.hud.update(frameDt, cam.width, cam.height, notes.join('   '));
    this.debug.clear();
    if (this.showHitboxes) drawHitboxes(this.debug, { hero: this.player, map: this.map, world: this.world, enemies: this.enemies, breakables: this.breakables, arrows: this.arrows });
    this.updateCursor();
  }

  // A crosshair while the bow can fire; the pointer in menus, during dialogue and before he can shoot.
  private updateCursor(): void {
    const aiming = this.run.state === 'fighting' && this.control && !this.travel.leaving && !this.tree.open && !this.menuOpen && !this.story.talking && stats.canFire();
    const css = cursorCss(aiming ? 'crosshair' : 'pointer');
    if (css === this.cursor) return;
    this.cursor = css;
    this.input.setDefaultCursor(css);
  }

  // One fixed step of the whole simulation, in the order things happen.
  private step(dt: number): void {
    const r = this.run;
    // A death in a calm map starts it over from where he came in: everything he broke or cleared here is back.
    if (this.calm && r.state === 'dead' && r.deadTime >= story.respawnDelay && !this.travel.leaving) {
      this.travel.leaving = true;
      this.scene.restart({ map: this.mapId, at: this.arriveAt ?? undefined, door: this.arriveDoor ?? undefined });
      return;
    }
    this.story.update(dt);
    // While a line is up, click and F move the dialogue on instead of shooting or interacting. The bow stays held
    // back until the button that skipped the last line is let go.
    if (this.story.talking && (this.input2.justPressed('interact') || this.input2.justPressed('fire'))) {
      this.sfx.play('next');
      this.story.skip();
      this.input2.consume('interact');
      this.input2.consume('fire');
    }
    // Vestiges come before his own update, so the click that casts one does not also shoot.
    const aimed = this.caster.aiming >= 0;
    const canAct = r.state === 'fighting' && !this.travel.leaving && this.control && !this.story.talking && !this.tree.open && !stats.weak();
    this.caster.update(dt, this.input2, this.aim, canAct);
    this.player.fireBlocked = this.story.talking || this.caster.aiming >= 0 || this.caster.throwing || ((aimed || this.player.fireBlocked) && this.input2.isDown('fire'));
    if (this.walkTo && r.state === 'fighting') this.stepWalk(dt);
    else if (!this.control && this.player.dashing) this.player.stepDash(dt);
    // Charging a Vestige, he holds still.
    else if (this.caster.charging || this.caster.throwing) this.player.stop();
    else if (r.state === 'fighting' && !this.travel.leaving && this.control) {
      this.player.update(dt, this.input2, this.aim);
      if (Math.hypot(this.input2.move.x, this.input2.move.y) > 0.1) this.story.notify('move');
      this.travel.check(this.map, this.input2.justPressed('interact'), (o) => this.isOpen(o));
      this.enemies.updateWorld(dt, this.map);
    }
    r.update(dt);
    this.mindscape?.update();
    this.nav.setGoal(this.player.x, this.player.y);
    this.enemies.update(dt);
    const p = this.player;
    // Attacks hit through god mode too (an attack marks what it caught), but only kill without it.
    if (r.state === 'fighting' && this.enemies.strikes(p.x, p.y, cfgPlayer.hitRadius, p.safe) && !sim.godMode) this.die();
    this.targets.length = 0;
    this.enemies.targets(this.targets);
    this.arrows.update(dt, this.targets, this.world);
    this.fireballs.update(dt, this.player.x, this.player.y, this.targets);
    this.breakables.update(dt);
    this.pickups.update(dt, this.player.x, this.player.y, r.state === 'fighting' && this.control);
    if (r.state === 'fighting' && !this.player.safe && !sim.godMode) {
      const { x, y } = this.player;
      if (this.enemies.touching(x, y, cfgPlayer.hitRadius) || this.world.onHurtingFloor(x, y)) this.die();
    }
  }

  // One step of a story walk: on until he is close enough, or has made no headway for a moment (something in the way).
  private stepWalk(dt: number): void {
    const w = this.walkTo!;
    const left = this.player.walkToward(dt, w.x, w.y, stats.moveSpeed() * story.walkSpeed);
    w.stuck = left < w.last - 0.5 ? 0 : w.stuck + dt;
    w.last = Math.min(w.last, left);
    if (left > w.stop && w.stuck < 0.5) return;
    this.walkTo = null;
    this.player.stop();
    this.timo.followHero();
  }

  // He takes a Vestige back: a banner, and it fills an empty slot.
  private reclaim(id: string): void {
    unlockVestige(id);
    this.hud.announce(`VESTIGE RECLAIMED\n${vestiges.get(id)?.name ?? id}`, story.vestigeBanner);
    this.sfx.play('unlock');
  }

  private playScript(id: string): void {
    const script = scripts.get(id);
    if (script) this.story.play(script);
    else console.warn(`[story] no script ${JSON.stringify(id)}`);
  }

  // Kate is beaten for good (saved at once, like the Mindscape's win), and the fire butterfly is his again.
  private kateBeaten(): void {
    save.flags.kateDefeated = true;
    if (save.vestiges.includes('flame_torrent')) writeSave();
    else this.reclaim('flame_torrent');
  }

  private die(): void {
    this.run.die();
    this.view.setVisible(false);
    this.sfx.play('death');
    const px = render.pixelScale;
    const s = toScreen(this.player.x, this.player.y);
    this.fx.smoke(s.x, s.y - 10 * px, run.deathSmoke, 8 * px);
    this.fx.particle({ x: s.x, y: s.y - 10 * px, life: 0.3, from: 3, to: 0, tint: 0xffe0b0 });
    this.fx.addShake(run.deathShake);
  }
}
