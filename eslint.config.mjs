// Lint for every workspace. Typecheck (`npm run typecheck`) covers types; this covers correctness rules tsc can't see,
// chiefly React's rules of hooks and effect dependencies in packages/web.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-types/**', 'playwright-report/**', 'test-results/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // tests reach into private state and build malformed payloads on purpose
  { files: ['**/*.test.ts', 'e2e/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
);
