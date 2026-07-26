import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/deployment/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
