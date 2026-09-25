import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
      'prefer-const': 'error',
    },
  },
  {
    // The eval harness strips the AI marks (C2PA) from its images to keep
    // ratings blind. Removing them from images people see would break the
    // AI Act's marking duty, so nothing outside src/evals/ may import it.
    files: ['src/**/*.ts'],
    ignores: ['src/evals/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)evals(/|$)',
              message:
                'src/evals/ is eval-only: it strips AI content credentials (AI Act Art. 50(2)). Do not use it in the app.',
            },
          ],
        },
      ],
    },
  },
)