// Root ESLint flat config — covers packages/*, editor, extension.
// Type-checked rules are deliberately NOT enabled here: tsc is the type gate
// (each package runs its own `typecheck`); ESLint stays syntax + good-practice.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/.vite/**',
      'test-fixtures/**',
      'editor/test/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TS handles undefined names; JS built-ins are checked by typecheck.
      'no-undef': 'off',
    },
  },
);
