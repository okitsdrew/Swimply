import Phaser from 'phaser';
import { player as cfgPlayer } from '../config/character';
import { camera } from '../config/feel';
import { render } from '../config/render';
import { run } from '../config/run';
import { priest } from '../config/priest';
import { shade } from '../config/shade';
import { spawners } from '../config/spawners';
import { sim } from '../config/sim';
import { story } from '../config/story';
import { breakables as cfgBreakables } from '../config/breakables';
import { pickups as cfgPickups } from '../config/pickups';
import { tree } from '../config/tree';
import { werewolf as cfgElite, werewolfMiniboss as werewolf } from '../config/werewolf';
import { Circle } from '../core/geometry';
import { Input, KeyboardMouseSource } from '../core/input';
import { toScreen, toWorld, Vec2 } from '../core/iso';
import { boxCorners } from '../data/assets';
import { AreaMap, findMarker, maps, Placed, withFlags, zoneAt } from '../data/maps';
import { PickupKind, pickupKinds } from '../data/pickups';
import { ambienceFor, sounds } from '../data/sounds';
import { scriptFor, storyFlags } from '../data/story';
import { addShards, maxTree, resetTree } from '../data/tree';
import { save, writeSave } from '../core/save';
import { DevMenu } from '../dev/DevMenu';
import { AmbienceView } from '../render/AmbienceView';
import { LoopSounds } from '../render/LoopSounds';
import { SoundFx } from '../render/SoundFx';
import { ArrowsView } from '../render/ArrowsView';
import { BreakablesView } from '../render/BreakablesView';
import { makeArt } from '../render/art';
import { cursorCss } from '../render/Cursors';
import { DialogueBox } from '../render/DialogueBox';
import { Eyelids } from '../render/Eyelids';
import { Fx } from '../render/Fx';
import { GhostText } from '../render/GhostText';
import { HeroPose } from '../render/HeroPose';
import { InteractHint } from '../render/InteractHint';
import { MapView } from '../render/MapView';
import { PickupsView } from '../render/PickupsView';
import { PlayerView } from '../render/PlayerView';
import { PriestsView } from '../render/PriestsView';
import { clock, RunHud } from '../render/RunHud';
import { ShadesView } from '../render/ShadesView';
import { TimoView } from '../render/TimoView';
import { WerewolfView } from '../render/WerewolfView';
import { Arrows } from '../sim/Arrows';
import { Breakables } from '../sim/Breakables';
import { Pickups } from '../sim/Pickups';
import { Player } from '../sim/Player';
import { Priest, Priests } from '../sim/Priests';
import { Run } from '../sim/Run';
import { Shades } from '../sim/Shades';
import { stats } from '../sim/stats';
import { Target } from '../sim/targets';
import { Werewolf } from '../sim/Werewolf';
import { FlowField } from '../sim/Nav';
import { MapWorld } from '../sim/World';
import { StoryRunner } from './StoryRunner';
import { TreeSceneData } from './TreeScene';

const DEFAULT_MAP = 'spawn';

// The page address can pick what to play, which is how the level editor's "play here" opens the game:
//   ?map=spawn        play that map
//   &at=320,640       start there (world units) instead of at the map's player start
//   &calm             no Shades appear, to walk round a map
// The map is kept in the address, so the reload after a tool saves comes back to the same map.
const params = new URLSearchParams(location.search);

// Where the player was standing when he last left each map, by map id, so coming back puts him there (back at the
// bow's pedestal after the Mindscape). Kept while the page is open, not saved.
const leftFrom = new Map<string, Vec2>();
// The map he came from, so the Mindscape knows where to send him back.
let cameFrom = '';

// The arena: a map from src/data/maps, played one of two ways. A map with Shade spawn zones is a run (the
// Mindscape): Shades that keep coming, death, the upgrade tree, and the next run. Any other map is calm: no Shades,
// no run clock, and a death puts him back where he came in. Doors and things with a `to` lead to other maps. The sim
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
  // No spawn zones: no Shades, no run, no tree.
  private calm = false;
  // Where he comes in, when another map sent him here.
  private arriveAt: Vec2 | null = null;
  // The door here he came in through, when another map's door sent him; he appears on clear floor beside it.
  private arriveDoor: Vec2 | null = null;
  // Fading out to another map; input is ignored meanwhile.
  private leaving = false;
  // Doors only take him once he has stood clear of every door since arriving, so coming back to the spot by a door
  // he left through does not send him straight out again.
  private doorsArmed = false;
  // The thing next to him that interact would use.
  private near: Placed | null = null;
  private hint!: InteractHint;
  private box!: DialogueBox;
  private ghost!: GhostText;
  private story!: StoryRunner;
  private timo!: TimoView;
  private lids!: Eyelids;
  private pose!: HeroPose;
  // Whether the hero's own look was hidden for a pose last frame.
  private posed = false;
  private ambience!: AmbienceView;
  private sfx!: SoundFx;
  private loops!: LoopSounds;
  // A script can take control away (the hero lying down, a scene playing out).
  private control = true;
  private world!: MapWorld;
  private nav!: FlowField;
  private mapView!: MapView;
  private player!: Player;
  private view!: PlayerView;
  private fx!: Fx;
  private arrows!: Arrows;
  private arrowsView!: ArrowsView;
  private shades!: Shades;
  private pickups!: Pickups;
  private pickupsView!: PickupsView;
  private shadesView!: ShadesView;
  private priests!: Priests;
  private priestsView!: PriestsView;
  // The Mindscape's mini-boss.
  private wolf!: Werewolf;
  private wolfView!: WerewolfView;
  // Plain werewolves, elites met in the world.
  private elites: { wolf: Werewolf; view: WerewolfView }[] = [];
  // Placed enemies still waiting for the player: a werewolf or Priest stands there; a Shade rises when he comes near.
  private sleepers: { o: Placed; wolf: Werewolf | null; priest: Priest | null }[] = [];
  // Each spawner's clock and the enemies it has out, so it keeps to its asset's spawnMax.
  private spawning = new Map<Placed, { timer: number; out: Set<object> }>();
  // Whether this run's werewolf has arrived yet.
  private wolfCame = false;
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
  private treeOpen = false;
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
    this.calm = !this.map.objects.some((o) => o.asset.marker === 'shadeSpawn');
    // Being in the Mindscape (any map that spawns) is what brings back his strength.
    if (!this.calm && !save.flags.enteredMindscape) {
      save.flags.enteredMindscape = true;
      writeSave();
    }
    if (params.get('map') !== map.id) {
      params.set('map', map.id);
      params.delete('at');
      history.replaceState(null, '', `?${params}`);
    }
    this.world = new MapWorld(this.map);
    this.nav = new FlowField(this.map, this.world);
    this.leaving = false;
    this.doorsArmed = false;
    this.near = null;
    this.acc = 0;
    this.paused = false;
    this.stepsQueued = 0;
    this.treeOpen = false;

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
    this.shades = new Shades();
    this.shadesView = new ShadesView(this, this.shades, this.fx);
    this.priests = new Priests();
    this.priestsView = new PriestsView(this, this.priests, this.fx);
    this.pickups = new Pickups();
    this.pickupsView = new PickupsView(this, this.pickups);
    this.pickups.onCollected = (kind) => this.collect(kind);
    this.wolf = new Werewolf(werewolf);
    this.wolfView = new WerewolfView(this, this.wolf, this.fx);
    this.elites = [];
    this.sfx = new SoundFx(this);
    this.view.onStep = () => this.sfx.play('step');
    this.run = new Run(this.shades);
    this.run.holdSpawns = this.calm || params.has('calm');
    this.hud = new RunHud(this, this.run);
    this.hud.showRun = !this.calm;
    this.hint = new InteractHint(this);
    this.box = new DialogueBox(this);
    this.ghost = new GhostText(this);
    this.timo = new TimoView(this);
    this.timo.setVisible(this.calm);
    this.lids = new Eyelids(this);
    this.ambience = new AmbienceView(this, ambienceFor(this.mapId));
    this.loops = new LoopSounds(this, this.map);
    this.pose = new HeroPose(this);
    this.posed = false;
    this.control = true;
    this.story = new StoryRunner(this.box, this.ghost, {
      // Timo keeps his face while someone else speaks, and goes back to idling when the talking stops.
      onLine: (speaker, face) => (speaker === 'timo' ? this.timo.setFace(face) : speaker === null && this.timo.setFace('')),
      setControl: (on) => (this.control = on),
      eyes: (open, seconds) => (open ? this.lids.wakeUp(seconds) : this.lids.close()),
      pose: (pose, seconds, frames) => (pose === 'asleep' ? this.pose.asleep() : this.pose.standUp(seconds, frames)),
      moveTimo: (target) => this.moveTimo(target),
      shake: (amount) => this.fx.addShake(amount),
    });

    this.player.onFire = (_x, _y, dx, dy) => {
      const m = this.view.muzzle();
      this.arrows.fire(m.x, m.y, dx, dy);
      this.view.onFire();
      this.sfx.play('fire');
      this.story.notify('fire');
    };
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
    this.arrows.onHit = (target, damage, ax, ay, dx, dy) => {
      // Knockback pushes away from a point just behind the hit, so along the arrow's flight.
      const elite = this.elites.find((e) => e.wolf === target);
      if (target === this.wolf) this.wolf.damage(damage);
      else if (elite) elite.wolf.damage(damage);
      else if (this.priests.list.includes(target as Priest)) this.priests.damage(target, damage, ax - dx, ay - dy);
      else this.shades.damage(target, damage, ax - dx, ay - dy);
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
    this.shades.onRisen = (s) => this.shadesView.onRisen(s);
    this.shades.onKilled = (x, y, s) => {
      for (const st of this.spawning.values()) st.out.delete(s);
      if (this.run.state === 'fighting' && !this.calm) {
        this.run.kills++;
        this.dropShards(x, y, tree.shardsPerKill);
      }
      this.shadesView.onKilled(x, y);
            this.fx.addShake(run.killShake);
      this.freeze(run.killHitStop);
    };
    this.priests.onRisen = (p) => this.priestsView.onRisen(p);
    this.priests.onCast = (_p, orb) => this.priestsView.onCast(orb);
    this.priests.onOrbGone = (x, y) => this.priestsView.onOrbGone(x, y);
    this.priests.onKilled = (x, y, p) => {
      for (const st of this.spawning.values()) st.out.delete(p);
      this.priestsView.onKilled(x, y);
      this.fx.addShake(run.killShake);
      this.freeze(run.killHitStop);
    };
    this.wireWolf(this.wolf, this.wolfView);
    this.wolf.onKilled = (x, y) => this.onWolfKilled(x, y);
    this.run.spawnPoint = () => this.spawnPoint();

    this.startRun();
    const script = scriptFor(this.mapId, save.flags);
    if (script) this.story.play(script);

    DevMenu.get().setActions([
      { label: 'Restart run', run: () => this.startRun() },
      { label: 'Spawn a Shade', run: () => this.run.spawn() },
      { label: 'Skip 15s', run: () => (this.run.time += 15) },
      { label: 'Spawn werewolf', run: () => this.spawnWolf() },
      { label: 'Kill werewolf', run: () => this.wolf.damage(this.wolf.hp) },
      { label: 'Spawn elite werewolf', run: () => this.spawnElite() },
      { label: 'Kill elite werewolves', run: () => [...this.elites].forEach((e) => e.wolf.damage(e.wolf.hp)) },
      { label: 'Kill all Shades', run: () => [...this.shades.list].forEach((s) => this.shades.kill(s)) },
      { label: 'Spawn a Priest', run: () => this.spawnPriest() },
      { label: 'Kill Priests', run: () => [...this.priests.list].forEach((p) => this.priests.kill(p)) },
      { label: 'Hold spawns', run: () => (this.run.holdSpawns = !this.run.holdSpawns) },
      { label: 'Pause', run: () => (this.paused = !this.paused) },
      { label: 'Step', run: () => { this.paused = true; this.stepsQueued++; } },
      { label: 'Open tree', run: () => this.openTree() },
      { label: '+50 shards', run: () => addShards(50) },
      { label: 'Reset tree (refund)', run: () => resetTree(true) },
      { label: 'Reset tree and shards', run: () => { resetTree(false); save.shards = 0; addShards(0); } },
      { label: 'Max tree', run: () => maxTree() },
      { label: 'Toggle hitboxes', run: () => (this.showHitboxes = !this.showHitboxes) },
      { label: `Next map (${map.name})`, run: () => this.nextMap() },
      { label: 'Story: fresh start', run: () => this.storyFresh() },
      { label: 'Story: Mindscape won', run: () => this.storyWon() },
      { label: 'Asset maker', run: () => window.open('asset-maker.html', 'swimply-asset-maker') },
      { label: 'Level editor', run: () => window.open(`level-editor.html?map=${this.mapId}`, 'swimply-level-editor') },
    ]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input2.destroy();
      this.scene.stop('tree');
    });
  }

  private nextMap(): void {
    const all = maps.list();
    const next = all[(all.findIndex((m) => m.id === this.mapId) + 1) % all.length];
    this.scene.restart({ map: next.id });
  }

  // Fades out and goes to another map. He arrives beside the door there that leads back here; with no such door,
  // where he stood when he last left that map.
  private travel(to: string): void {
    if (this.leaving) return;
    const next = maps.get(to);
    if (!next) {
      console.warn(`[maps] ${this.mapId}: a link goes to unknown map ${JSON.stringify(to)}`);
      return;
    }
    this.leaving = true;
    // He got out alive, so what he broke here stays broken.
    if (Object.keys(this.areaFlags).length) {
      Object.assign(save.flags, this.areaFlags);
      writeSave();
    }
    leftFrom.set(this.mapId, { x: this.player.x, y: this.player.y });
    cameFrom = this.mapId;
    // Into the Mindscape (a map Shades spawn in) from somewhere calm, or through a door from one calm map to another.
    const intoRun = next.objects.some((o) => o.asset.marker === 'shadeSpawn');
    if (this.calm) this.sfx.play(intoRun ? 'portal' : 'door');
    const cam = this.cameras.main;
    cam.fadeOut(story.fadeTime * 1000);
    const back = next.objects.find((o) => o.asset.marker === 'door' && o.to === this.mapId);
    const data = back ? { map: next.id, door: { x: back.x, y: back.y } } : { map: next.id, at: leftFrom.get(next.id) };
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(data));
  }

  // A spot beside a door where he can stand: clear of every door, inside the map, and not on blocking or killing
  // floor or inside anything solid. It tries spots in a ring round the door, the ones towards the middle of the map
  // first, then wider rings. If nothing fits, the door itself.
  private besideDoor(door: Vec2): Vec2 {
    const r = cfgPlayer.bodyRadius;
    const w = this.world;
    const doors = this.map.objects.filter((o) => o.asset.marker === 'door');
    const inward = Math.atan2(w.height / 2 - door.y, w.width / 2 - door.x);
    const turns = [0];
    for (let i = 1; i <= 8; i++) turns.push(i, -i);
    const solid: Circle[] = [];
    for (const extra of [1, 1.5, 2, 3]) {
      for (const turn of turns) {
        const a = inward + (turn * Math.PI) / 8;
        const d = (story.doorRadius + r) * extra + 8;
        const x = door.x + Math.cos(a) * d;
        const y = door.y + Math.sin(a) * d;
        if (x < r || y < r || x > w.width - r || y > w.height - r) continue;
        if (doors.some((o) => Math.hypot(o.x - x, o.y - y) < story.doorRadius * o.size + r)) continue;
        if (w.onBlockingFloor(x, y, r) || w.onHurtingFloor(x, y)) continue;
        if (w.near(x, y, r, solid).length) continue;
        return { x, y };
      }
    }
    return { x: door.x, y: door.y };
  }

  // Where to leave to after the Mindscape: the map he came from, else any map with a link here.
  private wayBack(): string {
    if (cameFrom && cameFrom !== this.mapId) return cameFrom;
    return maps.list().find((m) => m.objects.some((o) => o.to === this.mapId))?.id ?? DEFAULT_MAP;
  }

  // Doors take him as soon as he walks in. Anything else with a link waits for interact while he is next to it.
  private checkLinks(): void {
    const p = this.player;
    this.near = null;
    let best = Infinity;
    let inDoor = false;
    for (const o of this.map.objects) {
      if (!o.to) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (o.asset.marker === 'door') {
        if (d >= story.doorRadius * o.size) continue;
        if (this.doorsArmed) return this.travel(o.to);
        inDoor = true;
        continue;
      }
      const reach = Math.max(0, ...o.asset.collision.map((c) => Math.hypot(c.x, c.y) + c.radius)) * o.size + story.interactRange;
      if (d < reach && d < best) {
        best = d;
        this.near = o;
      }
    }
    if (!inDoor) this.doorsArmed = true;
    if (this.near && this.input2.justPressed('interact')) this.travel(this.near.to);
  }

  private moveTimo(target: string): void {
    if (target === 'hero') return this.timo.followHero();
    const o = this.map.objects.find((p) => p.asset.id === target);
    if (o) this.timo.goTo(o.x, o.y);
    else console.warn(`[story] Timo is sent to ${JSON.stringify(target)}, which is not placed in ${this.mapId}`);
  }

  // Dev aids for the story: back to waking up, or straight to after the Mindscape.
  private storyFresh(): void {
    for (const f of storyFlags()) delete save.flags[f];
    resetTree(false);
    save.shards = 0;
    addShards(0);
    leftFrom.clear();
    cameFrom = '';
    this.scene.restart({ map: DEFAULT_MAP });
  }

  private storyWon(): void {
    for (const f of storyFlags()) delete save.flags[f];
    this.winMindscape();
    this.scene.restart({ map: DEFAULT_MAP });
  }

  // The full tree whatever was bought, teleport, and his strength for good.
  private winMindscape(): void {
    Object.assign(save.flags, { enteredMindscape: true, mindscapeCleared: true, teleport: true });
    maxTree();
    addShards(0);
  }

  // The tree screen. The sim is paused under it, so nothing goes on attacking where he fell. After a death, closing
  // it starts the next run; opened mid-run from the dev menu, the run carries on.
  private openTree(): void {
    if (this.treeOpen) return;
    this.treeOpen = true;
    this.hud.treeOpen = true;
    this.sfx.play('treeOpen');
    const r = this.run;
    const dead = r.state === 'dead' && !this.calm;
    this.paused = true;
    const data: TreeSceneData = {
      summary: dead ? `YOU DIED   ${clock(r.time)}, ${r.kills} kills, +${r.shards} shards` : 'MEMORIES',
      closeLabel: dead ? 'Next run' : 'Back',
      onClose: () => this.closeTree(),
    };
    this.scene.launch('tree', data);
  }

  private closeTree(): void {
    if (!this.treeOpen) return;
    this.treeOpen = false;
    this.hud.treeOpen = false;
    this.sfx.play('click');
    this.scene.stop('tree');
    // Clicks on the tree screen also reached the game's input; drop them so they don't fire an arrow.
    this.input2.endFrame();
    if (this.run.state === 'dead') this.startRun();
    // The click on Next run is still held; the bow waits until it is let go.
    this.player.fireBlocked = true;
    this.paused = false;
  }

  private spawnWolf(): void {
    this.wolfCame = true;
    const p = this.spawnPoint();
    this.wolf.spawn(p.x, p.y);
    this.hud.announce('THE WEREWOLF COMES');
    // Part of what reveals Time Warp on the tree.
    if (!save.flags.werewolfSeen) {
      save.flags.werewolfSeen = true;
      writeSave();
    }
  }

  // Sounds and looks every werewolf shares, the boss and the elites.
  private wireWolf(w: Werewolf, view: WerewolfView): void {
    w.onRisen = () => view.onRisen();
    w.onAttack = () => this.sfx.play('wolfAttack');
    w.onSlam = () => {
      this.sfx.play('wolfSmash');
      view.onSlam();
    };
    w.onSwipe = () => {
      this.sfx.play('wolfSwipe');
      view.onSwipe();
    };
    w.onLand = () => {
      this.sfx.play('wolfSmash');
      view.onLand();
    };
  }

  // A plain werewolf, for now from the dev menu (spawners will bring them later): a few tiles from the player, on
  // clear ground. He drops nothing yet; soul shards come with the world's enemies.
  private spawnElite(): void {
    const p = this.clearSpot(this.player.x, this.player.y, 450, cfgElite.radius * cfgElite.scale);
    this.addElite().spawn(p.x, p.y);
  }

  // A Priest rising a few tiles from the player, on clear ground.
  private spawnPriest(): void {
    const p = this.clearSpot(this.player.x, this.player.y, 400, priest.radius);
    this.priests.spawn(p.x, p.y);
  }

  // A new plain werewolf, not yet out: the caller spawns him (he rises) or has him wait (placed).
  private addElite(): Werewolf {
    const wolf = new Werewolf(cfgElite);
    const view = new WerewolfView(this, wolf, this.fx, false);
    this.wireWolf(wolf, view);
    const entry = { wolf, view };
    wolf.onKilled = (x, y) => {
      view.onKilled(x, y);
      this.freeze(0.08, true);
      this.elites.splice(this.elites.indexOf(entry), 1);
      for (const st of this.spawning.values()) st.out.delete(wolf);
      view.destroy();
    };
    this.elites.push(entry);
    return wolf;
  }

  private clearElites(): void {
    this.elites.forEach((e) => e.view.destroy());
    this.elites = [];
  }

  // A spot about `dist` from (x, y) in a random direction where something of radius r can stand: pushed out of
  // anything solid, and not on blocking or killing floor if a few tries can help it.
  private clearSpot(x: number, y: number, dist: number, r: number): Vec2 {
    const p = { x, y, radius: r };
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      p.x = x + Math.cos(a) * dist;
      p.y = y + Math.sin(a) * dist;
      this.world.resolve(p);
      if (!this.world.onBlockingFloor(p.x, p.y, r) && !this.world.onHurtingFloor(p.x, p.y)) break;
    }
    return { x: p.x, y: p.y };
  }

  // The map's own enemies, fresh: placed werewolves stand at their spots; placed Shades and spawners wait.
  private placeEnemies(): void {
    this.sleepers = [];
    this.spawning.clear();
    for (const o of this.map.objects) {
      if (o.asset.marker !== 'enemy' || !o.asset.enemy) continue;
      if (o.asset.enemy === 'werewolf') {
        const wolf = this.addElite();
        wolf.wait(o.x, o.y);
        this.sleepers.push({ o, wolf, priest: null });
      } else if (o.asset.enemy === 'priest') this.sleepers.push({ o, wolf: null, priest: this.priests.wait(o.x, o.y) });
      else this.sleepers.push({ o, wolf: null, priest: null });
    }
  }

  // Wakes placed enemies the player comes near, and runs every spawner whose zone he stands in (or, with no zone,
  // that he is near). A broken spawner is no longer in the map, so it simply stops; what it sent out stays.
  private updateWorldEnemies(dt: number): void {
    const p = this.player;
    const near = (o: Placed) => Math.hypot(o.x - p.x, o.y - p.y) < (o.aggro || spawners.aggroRadius);
    this.sleepers = this.sleepers.filter(({ o, wolf, priest: pr }) => {
      if (wolf) {
        if (wolf.state !== 'idle') return false;
        if (!near(o)) return true;
        wolf.wake();
        return false;
      }
      if (pr) {
        if (pr.state !== 'idle') return false;
        if (!near(o)) return true;
        this.priests.wake(pr);
        return false;
      }
      if (!near(o)) return true;
      this.spawnEnemy('shade', o.x, o.y);
      return false;
    });
    const here = zoneAt(this.map, p.x, p.y);
    for (const o of this.map.objects) {
      const a = o.asset;
      if (!a.enemy || a.marker === 'enemy') continue;
      let st = this.spawning.get(o);
      if (!st) this.spawning.set(o, (st = { timer: 0, out: new Set() }));
      const on = o.zone ? o.zone === here : near(o);
      if (!on) {
        // Coming back in, the first one rises soon after, not a whole spawnEvery later.
        st.timer = Math.max(0, a.spawnEvery - spawners.firstSpawn);
        continue;
      }
      st.timer += dt;
      if (st.timer < a.spawnEvery || st.out.size >= a.spawnMax) continue;
      st.timer = 0;
      const r = a.enemy === 'werewolf' ? cfgElite.radius * cfgElite.scale : a.enemy === 'priest' ? priest.radius : shade.radius;
      const at = this.clearSpot(o.x, o.y, spawners.spawnDistance * o.size, r);
      const made = this.spawnEnemy(a.enemy, at.x, at.y);
      if (made) st.out.add(made);
    }
  }

  // One enemy of a kind rising at (x, y); returns it, for a spawner to count.
  private spawnEnemy(kind: string, x: number, y: number): object | null {
    if (kind === 'werewolf') {
      const wolf = this.addElite();
      wolf.spawn(x, y);
      return wolf;
    }
    if (kind === 'shade') {
      this.shades.spawn(x, y, shade.hp);
      return this.shades.list[this.shades.list.length - 1];
    }
    if (kind === 'priest') return this.priests.spawn(x, y);
    return null;
  }

  // Every werewolf here: the boss (when he is about) and the elites.
  private allWolves(): Werewolf[] {
    return [this.wolf, ...this.elites.map((e) => e.wolf)];
  }

  // A werewolf's attacks: the dash hurts along his path as he passes and at the far end where he slams; the
  // jump hurts the landing circle; the swipe hurts its cone for as long as he lunges.
  private checkWolfAttack(w: Werewolf): void {
    const p = this.player;
    const r = cfgPlayer.hitRadius;
    const hit = w.inDash(p.x, p.y, r) || (w.slammed && w.inSlam(p.x, p.y, r)) || (w.landed && w.inLanding(p.x, p.y, r)) || (w.state === 'swipe' && w.inSwipe(p.x, p.y, r));
    if (!hit || this.run.state !== 'fighting' || (p.safe && !w.cfg.slamPiercesInvuln)) return;
    // Counted even in god mode, so his attack choice can be tested.
    w.struck = true;
    if (!sim.godMode) this.die();
  }

  // Freezes the sim briefly so a kill lands. Kills in quick succession share one freeze unless `force`.
  private freeze(seconds: number, force = false): void {
    if (seconds <= 0 || (!force && this.hitStop <= 0 && this.sinceHitStop < run.hitStopGap)) return;
    if (this.hitStop <= 0) this.sinceHitStop = 0;
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  // Memory shard orbs where something died in the Mindscape. A boss's pile bursts out further.
  private dropShards(x: number, y: number, count: number, burst = false): void {
    const kind = pickupKinds.get('memory_shard');
    if (kind && count > 0) this.pickups.drop(kind, x, y, count, burst ? cfgPickups.burstSpeed : cfgPickups.popSpeed);
  }

  // An orb reached him: bank its worth, after the tree's bonus for memory shards.
  private collect(kind: PickupKind): void {
    if (kind.wallet !== 'memory') return;
    const n = Math.round(kind.value * stats.shardGain());
    this.run.shards += n;
    addShards(n);
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
    this.near = null;
  }

  private onWolfKilled(x: number, y: number): void {
    this.wolfView.onKilled(x, y);
        if (this.run.state !== 'fighting') return;
    this.dropShards(x, y, werewolf.shards, true);
    this.freeze(0.15, true);
    // Beating him wins the Mindscape, full tree or not: the Shades fade, then he wakes back where he touched the bow.
    this.winMindscape();
    this.run.holdSpawns = true;
    [...this.shades.list].forEach((s) => this.shades.kill(s));
    // Every orb left on the floor comes to him.
    this.pickups.callAll();
    this.ghost.show('Memories restored', Math.max(0.5, story.clearedDelay - 1));
    this.time.delayedCall(story.clearedDelay * 1000, () => this.travel(this.wayBack()));
  }

  private startRun(): void {
    this.shades.clear();
    this.shadesView.clear();
    this.priests.clear();
    this.priestsView.clear();
    this.pickups.clear();
    this.pickupsView.clear();
    this.wolf.clear();
    this.wolfView.clear();
    this.clearElites();
    this.wolfCame = false;
    this.arrows.clear();
    this.breakables.clear();
    this.breakablesView.clear();
    // A new run puts back what the last one broke.
    if (this.broken.size || Object.keys(this.areaFlags).length) {
      this.broken.clear();
      this.areaFlags = {};
      this.showMap();
    }
    this.placeEnemies();
    // Where the address says, else the map's player start marker, else the middle of the map.
    const at = params.get('at')?.split(',').map(Number);
    const start = (this.arriveDoor && this.besideDoor(this.arriveDoor)) ?? this.arriveAt ?? (at?.length === 2 && at.every(Number.isFinite) ? { x: at[0], y: at[1] }
      : findMarker(this.map, 'playerStart') ?? { x: this.world.width / 2, y: this.world.height / 2 });
    this.player.reset(start.x, start.y);
    this.view.setVisible(true);
    this.run.reset();
    this.hitStop = 0;
    this.acc = 0;
    const s = toScreen(this.player.x, this.player.y);
    this.camCenter = { x: s.x, y: s.y };
  }

  // A random spot inside one of the map's Shade spawn zones, or along its edge if it has none, far enough from the
  // player and clear of anything solid.
  private spawnPoint(): Vec2 {
    const m = shade.radius * 1.5;
    const w = this.world.width - m;
    const h = this.world.height - m;
    const zones = this.map.objects.filter((o) => o.asset.marker === 'shadeSpawn');
    const p = { x: 0, y: 0, radius: shade.radius };
    let best = { x: 0, y: 0 };
    let bestDist = -1;
    for (let i = 0; i < 12; i++) {
      if (zones.length) {
        const z = zones[Math.floor(Math.random() * zones.length)];
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * run.spawnZoneRadius * z.size;
        p.x = z.x + Math.cos(a) * r;
        p.y = z.y + Math.sin(a) * r;
      } else {
        const side = Math.floor(Math.random() * 4);
        const along = Math.random();
        p.x = side < 2 ? m + along * (w - m) : side === 2 ? m : w;
        p.y = side < 2 ? (side === 0 ? m : h) : m + along * (h - m);
      }
      this.world.resolve(p);
      const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
      if (d > bestDist) {
        best = { x: p.x, y: p.y };
        bestDist = d;
      }
      if (d >= run.minSpawnDistance) break;
    }
    return best;
  }

  update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, 0.25);
    const input = this.input2;
    const cam = this.cameras.main;
    input.update();
    // Checked here, not in step(), because the sim does not step while the tree pauses a run.
    if (this.treeOpen && input.justPressed('dash')) this.closeTree();
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
    const follow = 1 - Math.exp(-camera.followRate * frameDt);
    this.camCenter.x += (s.x - this.camCenter.x) * follow;
    this.camCenter.y += (s.y - this.camCenter.y) * follow;
    cam.scrollX = this.camCenter.x - cam.width / 2 + this.fx.shakeOffset.x;
    cam.scrollY = this.camCenter.y - cam.height / 2 + this.fx.shakeOffset.y;

    this.arrowsView.render();
    this.shadesView.render(this.player.x, this.player.y);
    this.priestsView.render(frameDt * (this.paused ? 0 : sim.timeScale), this.player.x, this.player.y);
    this.pickupsView.render(frameDt);
    this.wolfView.render(frameDt, cam.width);
    for (const e of this.elites) e.view.render(frameDt, cam.width);
    this.breakablesView.update(frameDt);
    // A story pose (lying, getting up) stands in for his normal look.
    this.pose.update(frameDt, this.player.x, this.player.y);
    if (this.pose.active !== this.posed && this.run.state === 'fighting') this.view.setVisible(!this.pose.active);
    this.posed = this.pose.active;
    this.timo.update(frameDt, this.player.x, this.player.y);
    this.lids.update(frameDt, cam.width, cam.height);
    this.ambience.update(frameDt);
    this.loops.update(this.player.x, this.player.y);
    this.box.update(frameDt, cam.width, this.player.x, this.player.y);
    this.ghost.update(frameDt, cam.width, cam.height);
    this.hint.update(frameDt, this.player.x, this.player.y, !!this.near && !this.leaving && this.control && this.run.state === 'fighting');
    const notes = [this.showHitboxes && this.wolf.present && `WEREWOLF ${this.wolf.state.toUpperCase()}`, this.paused && !this.treeOpen && 'PAUSED', this.run.holdSpawns && !this.calm && 'SPAWNS HELD', sim.godMode && 'GOD MODE'].filter(Boolean);
    this.hud.update(frameDt, cam.width, cam.height, notes.join('   '));
    this.drawDebug();
    this.updateCursor();
  }

  // A crosshair while the bow can fire; the pointer in menus, during dialogue and before he can shoot.
  private updateCursor(): void {
    const aiming = this.run.state === 'fighting' && this.control && !this.leaving && !this.treeOpen && !this.story.talking && stats.canFire();
    const css = cursorCss(aiming ? 'crosshair' : 'pointer');
    if (css === this.cursor) return;
    this.cursor = css;
    this.input.setDefaultCursor(css);
  }

  // One fixed step of the whole simulation, in the order things happen.
  private step(dt: number): void {
    const r = this.run;
    // A death in a calm map starts it over from where he came in: everything he broke or cleared here is back.
    if (this.calm && r.state === 'dead' && r.deadTime >= story.respawnDelay && !this.leaving) {
      this.leaving = true;
      this.scene.restart({ map: this.mapId, at: this.arriveAt ?? undefined, door: this.arriveDoor ?? undefined });
      return;
    }
    if (!this.calm && !this.treeOpen && r.state === 'dead' && r.canRestart) this.openTree();
    this.story.update(dt);
    // While a line is up, click and F move the dialogue on instead of shooting or interacting. The bow stays held
    // back until the button that skipped the last line is let go.
    if (this.story.talking && (this.input2.justPressed('interact') || this.input2.justPressed('fire'))) {
      this.sfx.play('next');
      this.story.skip();
      this.input2.consume('interact');
      this.input2.consume('fire');
    }
    this.player.fireBlocked = this.story.talking || (this.player.fireBlocked && this.input2.isDown('fire'));
    if (r.state === 'fighting' && !this.leaving && this.control) {
      this.player.update(dt, this.input2, this.aim);
      if (Math.hypot(this.input2.move.x, this.input2.move.y) > 0.1) this.story.notify('move');
      this.checkLinks();
      this.updateWorldEnemies(dt);
    }
    r.update(dt);
    if (r.state === 'fighting' && !this.wolfCame && !r.holdSpawns && r.time >= werewolf.arriveTime) this.spawnWolf();
    this.nav.setGoal(this.player.x, this.player.y);
    this.shades.update(dt, this.world, this.nav, this.player);
    this.priests.update(dt, this.world, this.nav, this.player);
    for (const w of this.allWolves()) {
      w.update(dt, this.world, this.nav, this.player);
      this.checkWolfAttack(w);
    }
    this.targets.length = 0;
    this.targets.push(...this.shades.list);
    for (const p of this.priests.list) if (p.alive) this.targets.push(p);
    for (const w of this.allWolves()) if (w.alive && !w.airborne) this.targets.push(w);
    this.arrows.update(dt, this.targets, this.world);
    this.pickups.update(dt, this.player.x, this.player.y, r.state === 'fighting' && this.control);
    if (r.state === 'fighting' && !this.player.safe && !sim.godMode) {
      const { x, y } = this.player;
      if (this.shades.touching(x, y, cfgPlayer.hitRadius) || this.priests.touching(x, y, cfgPlayer.hitRadius) || this.allWolves().some((w) => w.touching(x, y, cfgPlayer.hitRadius)) || this.world.onHurtingFloor(x, y)) this.die();
    }
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

  // Dev aid: circles and boxes for what actually collides, drawn flat on the ground, and the map's markers.
  private drawDebug(): void {
    const g = this.debug;
    g.clear();
    if (!this.showHitboxes) return;
    const ring = (x: number, y: number, r: number, color: number) => {
      const s = toScreen(x, y);
      const e = { x: r * render.isoScale * Math.SQRT2, y: r * render.isoScale * Math.SQRT1_2 };
      g.lineStyle(1, color, 1).strokeEllipse(s.x, s.y, e.x * 2, e.y * 2);
    };
    ring(this.player.x, this.player.y, cfgPlayer.bodyRadius, 0x66ccff);
    ring(this.player.x, this.player.y, cfgPlayer.hitRadius, 0xff4466);
    if (cfgPickups.roundOnScreen) {
      const p = toScreen(this.player.x, this.player.y);
      g.lineStyle(1, 0x7fc8ff, 1).strokeCircle(p.x, p.y, cfgPickups.pickupRadius * render.isoScale * Math.SQRT2);
    } else ring(this.player.x, this.player.y, cfgPickups.pickupRadius, 0x7fc8ff);
    for (const s of this.shades.list) {
      if (!s.alive) continue;
      ring(s.x, s.y, s.radius, 0xffcc44);
      ring(s.x, s.y, s.radius * shade.contactScale, 0xff4466);
      // Which way it is trying to walk.
      const a = toScreen(s.x, s.y);
      const b = toScreen(s.x + s.vx * 0.25, s.y + s.vy * 0.25);
      g.lineStyle(1, 0xffcc44, 1).lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const p of this.priests.list) {
      if (!p.alive) continue;
      ring(p.x, p.y, p.radius, 0xffcc44);
      ring(p.x, p.y, p.radius * priest.contactScale, 0xff4466);
    }
    for (const o of this.priests.orbs) ring(o.x, o.y, priest.orbRadius * priest.orbContact, 0xff4466);
    for (const w of this.allWolves()) {
      if (!w.alive) continue;
      ring(w.x, w.y, w.radius, 0xffcc44);
      ring(w.x, w.y, w.radius * w.cfg.contactScale, 0xff4466);
    }
    for (const c of this.world.circles) ring(c.x, c.y, c.radius, 0x66ffaa);
    // What arrows hit, in orange: hit shapes, and the collision circles of things that can break but have none.
    for (const o of this.map.objects) {
      const k = o.size;
      for (const h of o.asset.hit) {
        if (!h.box) ring(o.x + h.x * k, o.y + h.y * k, h.radius * k, 0xff9933);
        else g.lineStyle(1, 0xff9933, 1).strokePoints(boxCorners(h).map((c) => toScreen(o.x + c.x * k, o.y + c.y * k)), true);
      }
      if (o.asset.hit.length || !this.breakables.canBreak(o)) continue;
      for (const c of o.asset.collision) ring(o.x + c.x * k, o.y + c.y * k, c.radius * k, 0xff9933);
    }
    for (const b of this.world.floorBoxes) {
      g.lineStyle(1, 0x66ffaa, 0.8).strokePoints([toScreen(b.x0, b.y0), toScreen(b.x1, b.y0), toScreen(b.x1, b.y1), toScreen(b.x0, b.y1)], true);
    }
    for (const o of this.map.objects) {
      if (!o.asset.marker) continue;
      ring(o.x, o.y, 12, 0xf2d7a6);
      if (o.asset.marker === 'shadeSpawn') ring(o.x, o.y, run.spawnZoneRadius * o.size, 0xf2d7a6);
      const s = toScreen(o.x, o.y);
      g.lineStyle(1, 0xf2d7a6, 1).lineBetween(s.x - 6, s.y, s.x + 6, s.y).lineBetween(s.x, s.y - 6, s.x, s.y + 6);
    }
    for (const a of this.arrows.pool.items) if (a.active) ring(a.x, a.y, a.hitRadius, 0xa060ff);
  }
}
