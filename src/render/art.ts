import Phaser from 'phaser';
import { rgba, Sprite, sprites } from '../data/sprites';

// Code-drawn placeholder art. Gameplay only refers to these texture keys, so real sprite sheets
// can be loaded under the same keys later without touching the sim.
export const Tex = {
  hero: 'hero',
  arrow: 'arrow',
  shadow: 'shadow',
  smoke: 'smoke',
  glow: 'glow',
  pillar: 'pillar',
} as const;

export const shadeFrames = ['shade_0', 'shade_1'];
// The werewolf exists only as drawn sprites (no code art), so these keys come from sprites.json.
export const wolfWalkFrames = ['werewolf_0', 'werewolf_1', 'werewolf_2', 'werewolf_3'];
export const wolfAttackFrames = ['werewolf_10', 'werewolf_11', 'werewolf_12', 'werewolf_13'];

export const heroWalkFrames = ['hero_walk0', 'hero_walk1', 'hero_walk2', 'hero_walk3'];

type Palette = Record<string, number>;

function fromGrid(scene: Phaser.Scene, key: string, rows: string[], palette: Palette): void {
  const g = scene.make.graphics({}, false);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (color === undefined) return;
      g.fillStyle(color, 1);
      g.fillRect(x, y, 1, 1);
    });
  });
  g.generateTexture(key, rows[0].length, rows.length);
  g.destroy();
}

// Adds a one-pixel border of `ch` round every filled pixel, so a dark sprite still reads on a dark floor.
function outlined(rows: string[], ch: string): string[] {
  const filled = (x: number, y: number) => (rows[y - 1]?.[x - 1] ?? '.') !== '.';
  const out: string[] = [];
  for (let y = 0; y < rows.length + 2; y++) {
    let line = '';
    for (let x = 0; x < rows[0].length + 2; x++) {
      if (filled(x, y)) {
        line += rows[y - 1][x - 1];
        continue;
      }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) near = true;
      line += near ? ch : '.';
    }
    out.push(line);
  }
  return out;
}

function softCircle(scene: Phaser.Scene, key: string, size: number, color: number, alpha: number): void {
  const g = scene.make.graphics({}, false);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (d > 1) continue;
      g.fillStyle(color, alpha * (1 - d * d));
      g.fillRect(x, y, 1, 1);
    }
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

// A low round stump: a side band between two ellipses, drawn pixel by pixel so the edges stay crisp. Its ground
// point (the middle of the bottom ellipse) is 15 of its 22 rows down, which is the asset's originY in assets.json.
function pillar(scene: Phaser.Scene): void {
  const w = 28;
  const h = 22;
  const inside = (x: number, y: number, cy: number) => ((x - w / 2) / (w / 2)) ** 2 + ((y - cy) / 7) ** 2 <= 1;
  const g = scene.make.graphics({}, false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (inside(px, py, 7)) g.fillStyle(0x3a3350, 1);
      else if (inside(px, py, 15) || (py >= 7 && py <= 15)) g.fillStyle(0x2b2638, 1);
      else continue;
      g.fillRect(x, y, 1, 1);
    }
  }
  g.generateTexture(Tex.pillar, w, h);
  g.destroy();
}

// Turns a pixel-art sprite from the asset maker into a texture under its id, replacing any texture already there
// (such as the code-drawn art of the same name). Images already showing the old texture must be re-made after.
export function applySprite(scene: Phaser.Scene, sprite: Sprite): void {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(sprite.width, sprite.height);
  const colors = sprite.palette.map((c) => rgba(c.hex));
  sprite.pixels.forEach((j, i) => {
    if (j < 0) return;
    img.data.set(colors[j], i * 4);
  });
  ctx.putImageData(img, 0, 0);
  if (scene.textures.exists(sprite.id)) scene.textures.remove(sprite.id);
  scene.textures.addCanvas(sprite.id, canvas);
}

let made = false;

// All the game's art: the code-drawn placeholders, then the drawn sprites on top.
export function makeArt(scene: Phaser.Scene): void {
  if (made) return;
  made = true;
  makeCodeArt(scene);
  // Drawn art wins over code art of the same name.
  for (const s of sprites.list()) applySprite(scene, s);
}

export function makeCodeArt(scene: Phaser.Scene): void {

  // Four walk frames share one torso; only the legs change.
  const legs = [
    ['...ll..ll...', '...ll..ll...'],
    ['..ll...ll...', '.......ll...'],
    ['...ll..ll...', '...ll..ll...'],
    ['...ll...ll..', '...ll.......'],
  ];

  // The hero: a black helm with two glowing purple eyes, purple sleeves, a white tabard over a thick black belt.
  const heroColors = {
    k: 0x0b0910,
    K: 0x1c1826,
    p: 0x9a50ff,
    P: 0xf0e0ff,
    s: 0x6a3ab0,
    S: 0x8a58d8,
    w: 0xe9e9f0,
    W: 0xb4b4c6,
    e: 0x5a2a9a,
    b: 0x07070a,
    B: 0x9a50ff,
    l: 0x18151f,
  };
  const heroTorso = [
    '...k.kk.k...',
    '..kkkkkkkk..',
    '.kkpPkkPpkk.',
    '.kkppkkppkk.',
    '.kkkkkkkkkk.',
    '..kkkkkkkk..',
    '...kwwwwk...',
    '...kwWWwk...',
    '...kweewk...',
    '...kwwwwk...',
    '..kbbBBbbk..',
    '..kbbbbbbk..',
    '..kkkkkkkk..',
    '..kkKkkKkk..',
    '..kkkkkkkk..',
    '..kkKkkKkk..',
  ];
  fromGrid(scene, Tex.hero, [...heroTorso, ...legs[0]], heroColors);
  heroWalkFrames.forEach((key, i) => fromGrid(scene, key, [...heroTorso, ...legs[i]], heroColors));

  fromGrid(scene, Tex.arrow, ['..wdd.......', '.wddkkkdpp..', 'wddkkkkkdpPP', '.wddkkkdpp..', '..wdd.......'], {
    w: 0x4a1a7a,
    d: 0x2a0a4a,
    k: 0x07000d,
    p: 0x7a2fd0,
    P: 0xe0c8ff,
  });

  // The Shade: a tattered teal wraith with glowing yellow eyes; two hem frames flicker as it drifts.
  const shadeTop = [
    '....kkkk....',
    '...kKKKKk...',
    '..kKkkkkKk..',
    '..kkEkkEkk..',
    '..kkekkekk..',
    '.kkKkkkkKkk.',
    'kkKkkkkkkKkk',
    'Kk.kkkkkk.kK',
    'k..kKkkKk..k',
    '...kkkkkk...',
    '..kKkkkkKk..',
    '..kkkkkkkk..',
    '.kkKkkkkKkk.',
    '.kkkkkkkkkk.',
  ];
  const shadeHems = [
    ['.k.kk.kk.k..', 'k...k..k...k', '....k.....k.'],
    ['..kk.kk.kk..', '.k..k..k..k.', '.k.....k....'],
  ];
  const shadeColors = { k: 0x154f61, K: 0x1f6e86, E: 0xffe14a, e: 0xb08a10, O: 0x8a8a98 };
  shadeHems.forEach((hem, i) => fromGrid(scene, shadeFrames[i], outlined([...shadeTop, ...hem], 'O'), shadeColors));

  softCircle(scene, Tex.glow, 32, 0xffffff, 0.9);
  softCircle(scene, Tex.shadow, 16, 0x000000, 0.6);
  softCircle(scene, Tex.smoke, 12, 0x8a8698, 0.9);
  pillar(scene);
}
