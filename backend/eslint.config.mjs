// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Clean-architecture dependency rule (specs/001-user-accounts/research.md R19).
const layerRule = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'drizzle.config.ts', 'dist/**', 'drizzle/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
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
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    // HTTP response bodies in tests are untyped JSON.
    files: ['test/**/*.ts', 'src/**/*.spec.ts', 'src/**/*.int-spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['src/**/domain/**/*.ts'],
    ignores: ['src/**/*.spec.ts'],
    rules: layerRule([
      { group: ['@nestjs/*'], message: 'domain/ must not depend on NestJS.' },
      { group: ['drizzle-orm', 'drizzle-orm/*', 'pg'], message: 'domain/ must not depend on the database.' },
      {
        group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'],
        message: 'domain/ must not import outer layers.',
      },
    ]),
  },
  {
    files: ['src/**/application/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/**/application/testing/**'],
    rules: layerRule([
      {
        group: ['@nestjs/*', '!@nestjs/common'],
        message: 'application/ may only use @nestjs/common (Injectable/Inject).',
      },
      { group: ['drizzle-orm', 'drizzle-orm/*', 'pg'], message: 'application/ must not depend on the database.' },
      {
        group: ['**/infrastructure/**', '**/presentation/**'],
        message: 'application/ must not import outer layers.',
      },
    ]),
  },
  {
    files: ['src/**/presentation/**/*.ts'],
    ignores: ['src/**/*.spec.ts'],
    rules: layerRule([
      { group: ['**/infrastructure/**'], message: 'presentation/ calls use cases, never adapters.' },
      { group: ['drizzle-orm', 'drizzle-orm/*', 'pg'], message: 'presentation/ must not touch the database.' },
    ]),
  },
);
