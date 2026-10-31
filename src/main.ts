import Phaser from 'phaser';
import { loadSave } from './core/save';
import { refreshBaseline } from './data/tree';
import { ArenaScene } from './scenes/ArenaScene';
import { TreeScene } from './scenes/TreeScene';

loadSave();
// Tree numbers may have changed since the save was written.
refreshBaseline();

const game = new Phaser.Game({
  // ?canvas forces the 2D renderer, for machines where WebGL is flaky.
  type: new URLSearchParams(location.search).has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 800 },
  scene: [ArenaScene, TreeScene],
});

// Handy for poking at scenes from the browser console while tuning.
(window as unknown as { swimply: Phaser.Game }).swimply = game;

// The asset maker saved a data file (see scripts/data-api.ts): reload so the game shows the new art and assets.
import.meta.hot?.on('swimply:data', () => location.reload());
