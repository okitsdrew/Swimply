import fontUrl from '../data/fonts/PressStart2P-Regular.ttf?url';

// The game's screen text and menus share one pixel font and the bow arrow's palette, so every screen matches.
// Press Start 2P is drawn on an 8 pixel grid: sizes of 8, 16, 24 and 32 stay crisp.
export const UI_FONT = '"Press Start 2P", monospace';

export const ui = {
  text: '#e0c8ff',
  dim: '#8a7aa8',
  faint: '#4a3a64',
  bright: '#ffffff',
  outline: '#1a0a2a',
  shard: '#a8dcff',
  // As numbers, for shapes and lines.
  deep: 0x120a1c,
  dark: 0x2a0a4a,
  mid: 0x4a1a7a,
  purple: 0x7a2fd0,
  violet: 0x9a50ff,
  lilac: 0xe0c8ff,
  ink: 0x1a0a2a,
};

// A text style in the UI font with a dark pixel outline.
export function uiText(size: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, color: ui.text, stroke: ui.outline, strokeThickness: Math.max(3, size / 4), ...extra };
}

// The font must be loaded before any text is made with it, or the first texts fall back to monospace.
export async function loadUiFont(): Promise<void> {
  try {
    const face = new FontFace('Press Start 2P', `url(${fontUrl})`);
    document.fonts.add(await face.load());
  } catch (e) {
    console.warn('[ui] could not load the UI font, using monospace', e);
  }
}
