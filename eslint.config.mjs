import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // First-time ESLint adoption on an existing codebase. Keep genuinely useful
    // correctness rules as errors (e.g. rules-of-hooks), but demote the newest
    // React Compiler and stylistic rules to warnings so `npm run lint` surfaces
    // a small, meaningful set instead of thousands of legacy nits. Tighten these
    // back toward errors as the tree is cleaned up.
    rules: {
      'react/no-unescaped-entities': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      'prefer-const': 'warn',
    },
  },
  // Build output and generated files are not source — never lint them. ESLint
  // does not read .gitignore, so these must be listed explicitly.
  globalIgnores([
    '.next/**',
    '.netlify/**',
    'out/**',
    'build/**',
    'coverage/**',
    'generated/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
