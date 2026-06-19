import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Unit tests: pure logic co-located in src/ as *.test.ts.
// Node environment, no jsdom and no React setup file (those are only needed by
// the integration tests in tests/int/, which use vitest.config.mts).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
