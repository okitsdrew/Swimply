import { defineConfig } from './store';

// Orbs enemies drop (memory shards). What each kind looks like and is worth lives in src/data/pickups.json.
export const pickups = defineConfig(
  'pickups',
  'player',
  {
    // How far from the player an orb starts flying to him. Not drawn (hitboxes in the dev menu shows it).
    pickupRadius: 100,
    // Flying orbs start at this speed and speed up to flySpeed, so the flight is seen but he can never outrun one.
    flyStartSpeed: 300,
    flyAccel: 15000,
    flySpeed: 3600,
    // An orb this close to him is picked up.
    collectRadius: 8,
    // Dropped orbs pop out from the body up to this fast, then slow down and settle.
    popSpeed: 120,
    // A boss's pile of orbs bursts out up to this fast.
    burstSpeed: 380,
    popDrag: 5,
    // Seconds a dropped orb hops before it can be picked up.
    settleTime: 0.35,
    // Look: how high the hop goes and how much a lying orb bobs, in art pixels; how fast it bobs and pulses.
    hopHeight: 5,
    bobHeight: 0.5,
    bobRate: 2.2,
    orbScale: 1,
    glowScale: 0.3,
    glowAlpha: 0.7,
  },
  {
    pickupRadius: { min: 0, max: 600, step: 5 },
    flyStartSpeed: { min: 0, max: 2000, step: 10 },
    flyAccel: { min: 100, max: 50000, step: 100 },
    flySpeed: { min: 100, max: 8000, step: 50 },
    collectRadius: { min: 1, max: 60, step: 1 },
    popSpeed: { min: 0, max: 600, step: 5 },
    burstSpeed: { min: 0, max: 1500, step: 10 },
    popDrag: { min: 0, max: 20, step: 0.5 },
    settleTime: { min: 0, max: 2, step: 0.05 },
    hopHeight: { min: 0, max: 40, step: 1 },
    bobHeight: { min: 0, max: 10, step: 0.5 },
    bobRate: { min: 0, max: 10, step: 0.1 },
    orbScale: { min: 0.25, max: 4, step: 0.25 },
    glowScale: { min: 0, max: 3, step: 0.05 },
    glowAlpha: { min: 0, max: 1, step: 0.05 },
  },
);
