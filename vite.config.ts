import { defineConfig } from 'vite';
import { dataApi } from './scripts/data-api';

// Relative base so the build works under /Swimply/ on GitHub Pages regardless of URL casing.
// The tools (asset-maker.html) are dev-only pages: the build only packs the game.
export default defineConfig({
  base: './',
  plugins: [dataApi()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
