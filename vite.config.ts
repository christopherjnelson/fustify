import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fustifyAdminReportsPlugin } from './scripts/verification/viteAdminPlugin';

export default defineConfig({
  plugins: [react(), fustifyAdminReportsPlugin()],
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
});
