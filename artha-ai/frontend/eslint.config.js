import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', '**/.build-check/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  { files: ['**/*.{js,jsx,mjs}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    plugins: { react, 'react-hooks': hooks }, settings: { react: { version: '18.3' } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': 'off', 'react/jsx-uses-vars': 'error', 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } },
]
