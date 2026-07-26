import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    target: 'node24',
    outDir: 'dist-api',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    ssr: true,
    rollupOptions: {
      input: {
        server: resolve('api/server.ts'),
        'initializer-worker': resolve('api/initializerWorker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
