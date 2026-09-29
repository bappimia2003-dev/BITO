import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.d.ts',
      'docs/SPEC.md',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Disallow console.log in src/
  {
    files: ['**/src/**/*.{ts,tsx}'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Layer boundaries: packages/shared depends on nothing
  {
    files: ['packages/shared/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'next', message: 'packages/shared cannot import next' },
            { name: 'postgres', message: 'packages/shared cannot import postgres' },
            { name: '@bito/engine', message: 'packages/shared cannot import @bito/engine' },
            {
              name: '@bito/integrations',
              message: 'packages/shared cannot import @bito/integrations',
            },
            { name: '@bito/nodes', message: 'packages/shared cannot import @bito/nodes' },
            { name: '@bito/web', message: 'packages/shared cannot import @bito/web' },
          ],
        },
      ],
    },
  },
  // Layer boundaries: packages/engine depends only on shared, must NOT import next, postgres, node:fs, etc.
  {
    files: ['packages/engine/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'next', message: 'packages/engine must NOT import next' },
            { name: 'next/server', message: 'packages/engine must NOT import next' },
            { name: 'postgres', message: 'packages/engine must NOT import postgres' },
            { name: 'node:fs', message: 'packages/engine must NOT import node:fs' },
            { name: 'fs', message: 'packages/engine must NOT import fs' },
            {
              name: 'node:fs/promises',
              message: 'packages/engine must NOT import node:fs/promises',
            },
            { name: '@bito/integrations', message: 'packages/engine depends only on shared' },
            { name: '@bito/nodes', message: 'packages/engine depends only on shared' },
            { name: '@bito/web', message: 'packages/engine depends only on shared' },
          ],
          patterns: [
            {
              group: ['@bito/integrations*', '@bito/nodes*', '@bito/web*'],
              message: 'packages/engine depends only on shared',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'packages/engine must not call fetch directly (HTTP is injected)',
        },
      ],
    },
  },
  // Layer boundaries: packages/integrations depends only on shared
  {
    files: ['packages/integrations/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@bito/engine', message: 'packages/integrations depends only on shared' },
            { name: '@bito/nodes', message: 'packages/integrations depends only on shared' },
            { name: '@bito/web', message: 'packages/integrations depends only on shared' },
          ],
          patterns: [
            {
              group: ['@bito/engine*', '@bito/nodes*', '@bito/web*'],
              message: 'packages/integrations depends only on shared',
            },
          ],
        },
      ],
    },
  },
  // Layer boundaries: packages/nodes cannot import web
  {
    files: ['packages/nodes/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@bito/web', message: 'packages/nodes cannot import @bito/web' }],
          patterns: [
            {
              group: ['@bito/web*'],
              message: 'packages/nodes cannot import @bito/web',
            },
          ],
        },
      ],
    },
  }
);
