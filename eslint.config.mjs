import js from '@eslint/js'
import security from 'eslint-plugin-security'
import globals from 'globals'

const commonRules = {
  ...js.configs.recommended.rules,
  ...security.configs.recommended.rules,
  'no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }
  ],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-control-regex': 'off',
  'no-useless-assignment': 'off',
  'no-useless-escape': 'off',
  'security/detect-object-injection': 'off'
}

export default [
  {
    ignores: [
      '.generated/**',
      '.insforge/**',
      'coverage/**',
      'dist/**',
      'idea/**',
      'node_modules/**',
      'out/**',
      'public/**',
      'release/**',
      'test-results/**',
      'renderer.js',
      'fragments/**'
    ]
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    plugins: {
      security
    },
    rules: commonRules
  },
  {
    files: [
      'forge.config.js',
      'main.js',
      'preload.js',
      'playwright.config.cjs',
      'scripts/**/*.cjs',
      'tests/**/*.cjs',
      'tests/e2e/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs
      }
    },
    plugins: {
      security
    },
    rules: commonRules
  },
  {
    files: ['preload.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.commonjs,
        ...globals.browser
      }
    }
  }
]
