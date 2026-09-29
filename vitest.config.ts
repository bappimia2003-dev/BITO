import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.{test,spec}.ts',
      'apps/**/*.{test,spec}.ts',
      'tests/unit/**/*.{test,spec}.ts',
    ],
    exclude: ['**/*.integration.test.ts', '**/*.acceptance.test.ts', '**/node_modules/**'],
    passWithNoTests: false,
  },
});
