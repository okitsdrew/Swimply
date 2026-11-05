import { defineConfig } from './store';

// Vestiges (skills) in general: how many he can hold ready, and how they float by him.
export const vestiges = defineConfig(
  'vestiges',
  'vestiges',
  {
    // How far from him the equipped emblems hover, in world units, and how high, in art pixels.
    emblemDistance: 26,
    emblemHeight: 34,
    emblemScale: 1,
    // How fast the emblems circle him (turns a second) and bob.
    emblemSpin: 0.12,
    emblemBob: 2,
    // How see-through the slots at the bottom of the screen are when nothing is in them.
    emptySlotAlpha: 0.35,
    // Over the throne room's pedestals: how high a Vestige hovers (art pixels), how big, and how faint its grey
    // outline is while he has it equipped.
    pedestalHeight: 28,
    pedestalScale: 2,
    outlineColor: 0x8a8a98,
    outlineAlpha: 0.5,
  },
  {
    emblemDistance: { min: 0, max: 80, step: 1 },
    emblemHeight: { min: 0, max: 80, step: 1 },
    emblemScale: { min: 0.25, max: 4, step: 0.25 },
    emblemSpin: { min: 0, max: 1, step: 0.01 },
    emblemBob: { min: 0, max: 10, step: 0.5 },
    emptySlotAlpha: { min: 0, max: 1, step: 0.05 },
    pedestalHeight: { min: 0, max: 120, step: 1 },
    pedestalScale: { min: 0.25, max: 6, step: 0.25 },
    outlineColor: 'color',
    outlineAlpha: { min: 0, max: 1, step: 0.05 },
  },
);

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
    // Seconds he is gone between the portal closing on him and opening where he lands (0 is instant). He cannot be
    // hurt meanwhile.
    travelTime: 0.2,
    // The portals' size (world units) and seconds they take to open and shut.
    portalSize: 40,
    portalTime: 0.3,
    // Seconds he gathers energy between landing and the blast, standing still and unhurt, and seconds he stays
    // unhurt after it.
    chargeTime: 1,
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
    // The blast's colour, how big the ball grows while charging (art pixels across), how high over him it grows (art
    // pixels), and the last seconds of the charge, in which it drops to the ground and bursts.
    blastColor: 0xc58cff,
    ballSize: 80,
    ballHeight: 30,
    dropTime: 0.2,
    // The drawn drop it turns into as it falls: its size (times the art pixel) and seconds per frame.
    dropScale: 3,
    dropFrameTime: 0.06,
  },
  {
    cooldown: { min: 0, max: 30, step: 0.5 },
    range: { min: 50, max: 1000, step: 10 },
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
    ballHeight: { min: 0, max: 120, step: 1 },
    dropTime: { min: 0, max: 1, step: 0.05 },
    dropScale: { min: 0.5, max: 8, step: 0.5 },
    dropFrameTime: { min: 0.02, max: 0.5, step: 0.01 },
  },
);
