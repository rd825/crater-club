/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
  // `vite build --mode single` (npm run build:single) inlines all JS + CSS into one
  // dist/index.html for a zero-dependency, server-less static deploy — the way the original
  // vanilla game shipped. The two self-hosted woff2 fonts remain as sibling files under dist/.
  // The normal `vite build` is unaffected.
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/data/**'],
    },
  },
}));
