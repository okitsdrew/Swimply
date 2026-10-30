import Phaser from 'phaser';

// Code-drawn placeholder art. Gameplay only refers to these texture keys, so real sprite sheets
// can be loaded under the same keys later without touching the sim.
export const Tex = {
  hero: 'hero',
  arrow: 'arrow',
  shadow: 'shadow',
  dummy: 'dummy',
  smoke: 'smoke',
  glow: 'glow',
} as const;

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

let made = false;

export function makeArt(scene: Phaser.Scene): void {
  if (made) return;
  made = true;

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

  fromGrid(
    scene,
    Tex.dummy,
    [
      '...tttt...',
      '..tTTTTt..',
      '..tTttTt..',
      '...tttt...',
      '....pp....',
      'pppppppppp',
      '.tTTTTTTt.',
      '.tTtttTTt.',
      '.tTTTTTTt.',
      '.tTTtTTTt.',
      '..tTTTTt..',
      '....pp....',
      '....pp....',
      '....pp....',
      '...pppp...',
      '..pppppp..',
    ],
    { t: 0x6e5a3c, T: 0x8f7650, p: 0x3e3226 },
  );

  softCircle(scene, Tex.glow, 32, 0xffffff, 0.9);
  softCircle(scene, Tex.shadow, 16, 0x000000, 0.6);
  softCircle(scene, Tex.smoke, 12, 0x8a8698, 0.9);
}
