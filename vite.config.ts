import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || (mode === 'qa' ? '/' : './'),
  build: {
    target: 'es2022',
    ...(mode === 'qa' ? {
      outDir: '.qa-dist',
      rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), fixture: resolve(import.meta.dirname, 'tests/fixture.html') } },
    } : {}),
  },
}));
