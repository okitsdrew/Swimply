import Phaser from 'phaser';
import { loadSave } from './core/save';
import { ArenaScene } from './scenes/ArenaScene';

loadSave();

const game = new Phaser.Game({
  // ?canvas forces the 2D renderer, for machines where WebGL is flaky.
  type: new URLSearchParams(location.search).has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0a10',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 800 },
  scene: [ArenaScene],
});

// Handy for poking at scenes from the browser console while tuning.
(window as unknown as { swimply: Phaser.Game }).swimply = game;
