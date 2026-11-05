import { defineConfig } from './store';

// How loud things are.
export const sound = defineConfig(
  'sound',
  'sound',
  {
    // Everything, 0 to 1.
    volume: 0.5,
    // A map's background sounds (distant explosions in spawn), on top of volume.
    ambientVolume: 0.5,
    // Looping sounds from things and floors (a fire's crackle), on top of volume.
    loopVolume: 0.6,
    // How far (world units, a tile is 64) a looping sound carries; it fades to nothing at this distance.
    loopRange: 400,
    // Dialogue voices (the blips as a line types out), on top of volume.
    voiceVolume: 0.7,
    // Effects (teleport, dash, shots, hits), on top of volume.
    effectsVolume: 0.8,
    // Each effect plays a little higher or lower at random, by up to this fraction, so repeats do not grate.
    pitchJitter: 0.08,
    // The same effect again within this many seconds is skipped (three arrows hitting at once make one sound).
    repeatGap: 0.04,
    mute: false,
  },
  {
    volume: { min: 0, max: 1, step: 0.05 },
    ambientVolume: { min: 0, max: 1, step: 0.05 },
    effectsVolume: { min: 0, max: 1, step: 0.05 },
    voiceVolume: { min: 0, max: 1, step: 0.05 },
    loopVolume: { min: 0, max: 1, step: 0.05 },
    loopRange: { min: 50, max: 2000, step: 25 },
    pitchJitter: { min: 0, max: 0.5, step: 0.01 },
    repeatGap: { min: 0, max: 0.3, step: 0.01 },
    mute: 'bool',
  },
);
