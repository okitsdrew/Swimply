import Phaser from 'phaser';
import { loadSave } from './core/save';
import { BootScene } from './scenes/BootScene';

loadSave();

new Phaser.Game({
  // ?canvas forces the 2D renderer, for machines where WebGL is flaky.
  type: new URLSearchParams(location.search).has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0a10',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 800 },
  scene: [BootScene],
});
