import { defineConfig } from './store';

// How loud things are.
export const sound = defineConfig(
  'sound',
  'sound',
  {
    // Everything, 0 to 1.
    volume: 0.8,
    // A map's background sounds (distant explosions in spawn), on top of volume.
    ambientVolume: 0.7,
    mute: false,
  },
  {
    volume: { min: 0, max: 1, step: 0.05 },
    ambientVolume: { min: 0, max: 1, step: 0.05 },
    mute: 'bool',
  },
);
