import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The single audited write-door rule (m5-lint-deny / Architecture.md §A):
      // tenant content must only be reached via src/broker/payload-client.ts.
      // Banning getPayload + @payload-config everywhere else stops any module
      // from quietly opening its own connection and bypassing the broker.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'payload',
              importNames: ['getPayload'],
              message: 'Get the Payload handle only via src/broker/payload-client.ts (the single audited write door).',
            },
          ],
          patterns: [
            {
              group: ['@payload-config'],
              message: 'Import @payload-config only in payload-client.ts or the bootstrap seed.',
            },
          ],
        },
      ],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    // Allowlist: the sanctioned Payload-handle holder, the bootstrap seed, and
    // the dev verification scripts may import getPayload / @payload-config.
    files: [
      'src/broker/payload-client.ts', // the sanctioned single holder
      'src/seed/**/*.ts', // bootstrap + dev verification scripts
      'src/broker/verify-isolation.ts',
      'src/agent/verify-agent.ts',
      'src/app/(payload)/**', // Payload's own generated admin/API plumbing (must import the config)
      'tests/**', // test code
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    ignores: ['.next/', 'src/payload-types.ts', 'src/payload-generated-schema.ts'],
  },
]

export default eslintConfig
