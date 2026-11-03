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

// Timo's Doomsday Scenario: he picks a spot, flashes there and explodes. Damage in a radius, knockback in a bigger
// one. It cannot land on water, void or roof tiles, or past anything solid, so it never breaks out of a map.
export const doomsday = defineConfig(
  'doomsday',
  'vestiges',
  {
    // Seconds before it can be used again.
    cooldown: 8,
    // How far from him he can land, in world units.
    range: 420,
    // Seconds the flight there takes (0 is instant). He cannot be hurt on the way.
    travelTime: 0.12,
    // Seconds between landing and the blast.
    blastDelay: 0.05,
    damage: 150,
    damageRadius: 130,
    // Everything this close is thrown outward, this hard (werewolves are too heavy to move).
    knockbackRadius: 230,
    knockback: 700,
    // Also hurts things that break (spawners), at this fraction of the damage.
    breakDamage: 1,
    shake: 14,
    hitStop: 0.08,
    // The aiming circle's colours: a spot he can land on, and one he cannot.
    okColor: 0xc58cff,
    badColor: 0xff2424,
    aimAlpha: 0.7,
    // The blast's colour.
    blastColor: 0xc58cff,
  },
  {
    cooldown: { min: 0, max: 30, step: 0.5 },
    range: { min: 50, max: 1000, step: 10 },
    travelTime: { min: 0, max: 1, step: 0.01 },
    blastDelay: { min: 0, max: 1, step: 0.01 },
    damage: { min: 0, max: 1000, step: 5 },
    damageRadius: { min: 10, max: 400, step: 5 },
    knockbackRadius: { min: 10, max: 600, step: 5 },
    knockback: { min: 0, max: 2000, step: 10 },
    breakDamage: { min: 0, max: 5, step: 0.1 },
    shake: { min: 0, max: 40, step: 1 },
    hitStop: { min: 0, max: 0.3, step: 0.01 },
    okColor: 'color',
    badColor: 'color',
    aimAlpha: { min: 0, max: 1, step: 0.05 },
    blastColor: 'color',
  },
);
