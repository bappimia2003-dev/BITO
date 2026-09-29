import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/acceptance/**/*.test.ts'],
    passWithNoTests: true,
  },
});
