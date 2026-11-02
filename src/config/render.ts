import { defineConfig } from './store';

// How the flat world is drawn. The simulation never reads these; only drawing code does.
export const render = defineConfig(
  'render',
  'look and feel',
  {
    // Iso projection: screen x = (x - y) * isoScale, screen y = (x + y) * isoScale / 2.
    isoScale: Math.SQRT1_2,
    // Each art pixel is drawn as this many screen pixels.
    pixelScale: 2,
    arrowScale: 3.375,
    bowScale: 1,
    // How far above the ground arrows fly, in screen pixels.
    arrowHeight: 20,
    // Aiming at the cursor points this far below it, so shots meet what is drawn under the cursor.
    aimHeight: 20,
    // Each pixel of the mouse cursor sprites is this many screen pixels.
    cursorScale: 3,
    // Where the pointer clicks, in screen pixels from its top-left corner.
    pointerHotX: 0,
    pointerHotY: 0,
    // How high roof floors are lifted, in art pixels: the height of a tall wall.
    roofHeight: 50,
    // How see-through roofs and walls become in front of the hero, 0 (gone) to 1 (solid).
    seeThrough: 0.3,
  },
  {
    isoScale: { min: 0.3, max: 1.5, step: 0.01 },
    pixelScale: { min: 1, max: 6, step: 1 },
    arrowScale: { min: 0.5, max: 10, step: 0.125 },
    bowScale: { min: 0.3, max: 3, step: 0.05 },
    arrowHeight: { min: 0, max: 40, step: 1 },
    aimHeight: { min: 0, max: 80, step: 1 },
    cursorScale: { min: 1, max: 6, step: 1 },
    pointerHotX: { min: 0, max: 6, step: 1 },
    pointerHotY: { min: 0, max: 6, step: 1 },
    roofHeight: { min: 0, max: 120, step: 1 },
    seeThrough: { min: 0, max: 1, step: 0.05 },
  },
);
