import { defineConfig } from 'vite';

// base './' lets the game run from any GitHub Pages path.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
