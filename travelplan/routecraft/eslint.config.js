import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // The single sanctioned `console.*` call site in the app — see
    // docs/conventions/logging.md. Config-level override only; no inline
    // eslint-disable comments anywhere in the codebase.
    files: ['src/lib/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // shadcn/ui primitives co-export `cva` variant helpers; the route table and
    // design-token maps export config objects. None are fast-refresh component
    // boundaries, so the HMR-only rule does not apply.
    files: [
      'src/components/ui/**/*.tsx',
      'src/app/router.tsx',
      'src/features/results/journey-badges.tsx',
      'src/test/**',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
