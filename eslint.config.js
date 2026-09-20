import js from '@eslint/js';
import globals from 'globals';
import xvfinance from './eslint/plugin-xvfinance.js';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/chat/**/*.js', 'src/client/**/*.js'],
    plugins: { xvfinance },
    rules: {
      'xvfinance/no-service-role-in-chat': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '**/server/*', '**/service-role.js'],
              message:
                'Chat tools and client bundles cannot import server/service-role modules. Use a user-JWT client so RLS applies.',
            },
          ],
        },
      ],
    },
  },
];
