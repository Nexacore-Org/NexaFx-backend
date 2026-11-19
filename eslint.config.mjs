// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const noDisabledTests = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow disabled Jest tests' },
    schema: [],
    messages: { disabledTest: 'Disabled tests are not allowed.' },
  },
  create(context) {
    const disabledMethods = new Set(['skip', 'todo']);
    const disabledGlobals = new Set(['xit', 'xdescribe', 'xtest']);
    const jestGlobals = new Set(['describe', 'it', 'test']);

    return {
      CallExpression(node) {
        const callee = node.callee;
        const isDisabledMethod =
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          disabledMethods.has(callee.property.name) &&
          callee.object.type === 'Identifier' &&
          jestGlobals.has(callee.object.name);
        const isDisabledGlobal =
          callee.type === 'Identifier' && disabledGlobals.has(callee.name);

        if (isDisabledMethod || isDisabledGlobal) {
          context.report({ node, messageId: 'disabledTest' });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    plugins: {
      jest: {
        rules: {
          'no-disabled-tests': noDisabledTests,
        },
      },
    },
    rules: {
      'jest/no-disabled-tests': 'error',
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
);
