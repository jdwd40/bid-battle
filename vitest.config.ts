import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    testTimeout: 30000,
  },
});
