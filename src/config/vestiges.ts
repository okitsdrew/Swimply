import { defineConfig } from './store';

// Vestiges (skills) in general: the slots at the bottom of the screen, and the throne room's pedestals.
export const vestiges = defineConfig(
  'vestiges',
  'vestiges',
  {
    // How see-through the slots at the bottom of the screen are when nothing is in them.
    emptySlotAlpha: 0.35,
    // Over the throne room's pedestals: how high a Vestige hovers (art pixels), how big, how much it bobs, and how
    // faint its grey outline is while he has it equipped.
    pedestalHeight: 28,
    pedestalScale: 1,
    pedestalBob: 2,
    outlineColor: 0x8a8a98,
    outlineAlpha: 0.75,
  },
  {
    emptySlotAlpha: { min: 0, max: 1, step: 0.05 },
    pedestalHeight: { min: 0, max: 120, step: 1 },
    pedestalScale: { min: 0.25, max: 6, step: 0.25 },
    pedestalBob: { min: 0, max: 10, step: 0.5 },
    outlineColor: 'color',
    outlineAlpha: { min: 0, max: 1, step: 0.05 },
  },
);

// The emblems of the equipped Vestiges circling him. They share one ring round him, so where it is and how it moves
// is set once here; how each emblem looks is in its own Vestige's section (EmblemLook).
export const emblems = defineConfig(
  'emblems',
  'vestiges',
  {
    // How far from him they circle (world units), how high (art pixels), how fast (turns a second) and how much
    // they bob.
    distance: 26,
    height: 34,
    spin: 0.12,
    bob: 2,
    // How quickly the ring catches up when he moves (higher is snappier), like Timo's moveRate.
    followRate: 4,
    // While its Vestige is in use (aimed, or cast and not over), an emblem's glow (and Timo's) is this many times
    // bigger and brighter.
    activeGlow: 2,
  },
  {
    distance: { min: 0, max: 80, step: 1 },
    height: { min: 0, max: 80, step: 1 },
    spin: { min: 0, max: 1, step: 0.01 },
    bob: { min: 0, max: 10, step: 0.5 },
    followRate: { min: 0.2, max: 30, step: 0.1 },
    activeGlow: { min: 1, max: 5, step: 0.1 },
  },
);

// How one Vestige's emblem looks: its size, seconds per frame of its flap, its glow (art pixels across, and how
// bright), and embers rising off it in its colour, this many a second.
export interface EmblemLook {
  emblemScale: number;
  emblemFrameTime: number;
  emblemGlow: number;
  emblemGlowAlpha: number;
  emblemEmbers: number;
}

const emblemDefaults: EmblemLook = { emblemScale: 1, emblemFrameTime: 0.16, emblemGlow: 15, emblemGlowAlpha: 0.45, emblemEmbers: 6 };
const emblemRanges = {
  emblemScale: { min: 0.25, max: 4, step: 0.25 },
  emblemFrameTime: { min: 0.03, max: 0.5, step: 0.01 },
  emblemGlow: { min: 0, max: 100, step: 1 },
  emblemGlowAlpha: { min: 0, max: 1, step: 0.05 },
  emblemEmbers: { min: 0, max: 40, step: 1 },
};

// Flame Torrent, the fire butterfly's Vestige: fireballs from each side of him cross just in front of him and curve
// out to their full range toward the mouse on paths set where they were shot, then fly straight back to him wherever
// he is now. They pass over everything but walls: a wall turns one back on the way out and puts it out on the way
// back.
export const flameTorrent = defineConfig(
  'flame_torrent',
  'vestiges',
  {
    cooldown: 8,
    // How far out the tip is (world units), how wide the paths swing to each side, and how far to his side each
    // fireball starts.
    range: 400,
    width: 40,
    side: 24,
    // Seconds a fireball takes to reach the tip, its speed back to him (world units a second), and how close it
    // must come to him to be caught. How many leave from each side, and seconds between them.
    outTime: 0.6,
    returnSpeed: 1200,
    catchRadius: 25,
    perSide: 4,
    gap: 0.06,
    // Each fireball's hit: damage, how close it must pass (world units), and seconds before it can hit the same
    // enemy again (so the way out and the way back both count). A burn: seconds, and damage a second.
    damage: 25,
    hitRadius: 20,
    rehitTime: 0.4,
    burn: 2,
    burnPower: 5,
    // The aiming ring at the loop's tip (world units across, as a radius).
    tipRadius: 45,
    // How the fireballs look: height over the ground and size (art pixels), seconds per frame, and trail embers a
    // second for each.
    height: 14,
    scale: 1.5,
    frameTime: 0.06,
    trail: 40,
    ...emblemDefaults,
  },
  {
    cooldown: { min: 0, max: 30, step: 0.5 },
    range: { min: 50, max: 1000, step: 10 },
    width: { min: 0, max: 300, step: 5 },
    side: { min: 0, max: 100, step: 2 },
    outTime: { min: 0.1, max: 2, step: 0.05 },
    returnSpeed: { min: 100, max: 3000, step: 25 },
    catchRadius: { min: 2, max: 80, step: 1 },
    perSide: { min: 1, max: 8, step: 1 },
    gap: { min: 0, max: 0.5, step: 0.01 },
    damage: { min: 0, max: 200, step: 1 },
    hitRadius: { min: 2, max: 60, step: 1 },
    rehitTime: { min: 0.05, max: 2, step: 0.05 },
    burn: { min: 0, max: 10, step: 0.25 },
    burnPower: { min: 0, max: 50, step: 1 },
    tipRadius: { min: 10, max: 200, step: 5 },
    height: { min: 0, max: 60, step: 1 },
    scale: { min: 0.25, max: 4, step: 0.25 },
    frameTime: { min: 0.02, max: 0.3, step: 0.01 },
    trail: { min: 0, max: 200, step: 5 },
    ...emblemRanges,
  },
);

// Each Vestige's emblem look, by its id. A new Vestige with an emblem gets its own section and a line here; one with
// no entry uses the defaults.
const looks: Record<string, EmblemLook> = { flame_torrent: flameTorrent };
export const emblemLook = (id: string): EmblemLook => looks[id] ?? emblemDefaults;

// Timo's Doomsday Scenario: he picks a spot, flashes there through anything in the way, gathers a ball of energy
// while enemies close in (he cannot be hurt), and explodes. Damage in a radius, knockback in a bigger one. It only
// lands where he could have walked to, so it never skips a locked gate or breaks out of a map.
export const doomsday = defineConfig(
  'doomsday',
  'vestiges',
  {
    // Seconds before it can be used again.
    cooldown: 8,
    // How far from him he can land, in world units.
    range: 600,
    // Seconds from the click to his flight: Timo is thrown at the spot (he can still be hurt meanwhile), arcing this
    // high (art pixels) and spinning this many turns, and the ball starts to form round him there.
    throwTime: 0.1,
    throwArc: 30,
    throwSpins: 1,
    // Timo's glow while Doomsday is in use (art pixels across, before the emblems' activeGlow).
    timoGlow: 15,
    // Seconds he is gone between the portal closing on him and opening where he lands (0 is instant). He cannot be
    // hurt meanwhile.
    travelTime: 0.2,
    // The portals' size (world units) and seconds they take to open and shut.
    portalSize: 40,
    portalTime: 0.3,
    // Seconds he gathers energy between landing and the blast, standing still and unhurt, and seconds he stays
    // unhurt after it.
    chargeTime: 1.25,
    safeAfter: 0.3,
    damage: 250,
    damageRadius: 150,
    // Everything this close (the hurt ones too) is thrown outward, this hard, so nothing is left standing on him
    // (werewolves take part of it: their knockbackTaken). Only the damage circle is drawn.
    knockbackRadius: 230,
    knockback: 700,
    // Also hurts things that break (spawners), at this fraction of the damage.
    breakDamage: 1,
    // Seconds everything the blast hurts is stunned (bosses shrug some of it off: their ccResist).
    stun: 1,
    shake: 14,
    hitStop: 0.08,
    // How solid the aiming ring is (its colours are the sprites: the Vestige's skill ring, red where he cannot land).
    aimAlpha: 0.7,
    // The blast's colour, how big the ball grows while charging (art pixels across), seconds per frame of its churn,
    // how high over him it grows (art pixels), and the last seconds of the charge, in which it drops to the ground
    // and bursts.
    blastColor: 0xc58cff,
    ballSize: 100,
    ballFrameTime: 0.08,
    ballHeight: 70,
    dropTime: 0.6,
    // The drawn drop it turns into as it falls: its size (times the art pixel) and seconds per frame.
    dropScale: 2,
    dropFrameTime: 0.06,
  },
  {
    cooldown: { min: 0, max: 30, step: 0.5 },
    range: { min: 50, max: 1000, step: 10 },
    throwTime: { min: 0, max: 1, step: 0.05 },
    throwArc: { min: 0, max: 120, step: 1 },
    throwSpins: { min: 0, max: 5, step: 0.25 },
    timoGlow: { min: 0, max: 100, step: 1 },
    travelTime: { min: 0, max: 1, step: 0.01 },
    portalSize: { min: 5, max: 200, step: 5 },
    portalTime: { min: 0.05, max: 2, step: 0.05 },
    chargeTime: { min: 0, max: 3, step: 0.05 },
    safeAfter: { min: 0, max: 2, step: 0.05 },
    damage: { min: 0, max: 1000, step: 5 },
    damageRadius: { min: 10, max: 400, step: 5 },
    knockbackRadius: { min: 10, max: 600, step: 5 },
    knockback: { min: 0, max: 2000, step: 10 },
    breakDamage: { min: 0, max: 5, step: 0.1 },
    stun: { min: 0, max: 10, step: 0.1 },
    shake: { min: 0, max: 40, step: 1 },
    hitStop: { min: 0, max: 0.3, step: 0.01 },
    aimAlpha: { min: 0, max: 1, step: 0.05 },
    blastColor: 'color',
    ballSize: { min: 4, max: 200, step: 2 },
    ballFrameTime: { min: 0.02, max: 0.5, step: 0.01 },
    ballHeight: { min: 0, max: 120, step: 1 },
    dropTime: { min: 0, max: 1, step: 0.05 },
    dropScale: { min: 0.5, max: 8, step: 0.5 },
    dropFrameTime: { min: 0.02, max: 0.5, step: 0.01 },
  },
);
