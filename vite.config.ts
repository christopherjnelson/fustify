import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vitest/config';
import { fustifyAdminReportsPlugin } from './scripts/verification/viteAdminPlugin';

export default defineConfig(({ mode }) => {
  const isBundleAnalysis = mode === 'bundle-analysis';

  return {
    plugins: [
      react(),
      fustifyAdminReportsPlugin(),
      ...(isBundleAnalysis
        ? [
            visualizer({
              filename: '.fustify/reports/bundle/report.html',
              gzipSize: true,
              open: false,
              template: 'treemap',
            }),
            visualizer({
              filename: '.fustify/reports/bundle/stats.json',
              gzipSize: true,
              open: false,
              template: 'raw-data',
            }),
          ]
        : []),
    ],
    build: {
      ...(isBundleAnalysis
        ? {
            emptyOutDir: true,
            manifest: true,
            outDir: '.fustify/reports/bundle/dist',
          }
        : {}),
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              /\/src\/core\/(?:generation\/(?:generateNormalizedTerritories|geometryQuality|regularizeSharedGeometry)|geometry\/sphericalGeometry)\.ts$/.test(
                id,
              )
            ) {
              return 'normalized-world-generator';
            }
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary'],
        include: ['src/core/game/**/*.ts', 'src/core/persistence/saveGame.ts'],
        exclude: [
          'src/**/*.test.ts',
          'src/core/game/testFixtures.ts',
          'src/core/game/types.ts',
          'src/core/game/index.ts',
        ],
      },
    },
  };
});
