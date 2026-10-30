import { defineConfig } from 'vite';

// Relative base so the build works under /Swimply/ on GitHub Pages regardless of URL casing.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
