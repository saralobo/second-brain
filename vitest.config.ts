import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@ava/core': r('./packages/core/src/index.ts'),
      '@ava/db': r('./packages/db/src/index.ts'),
      '@ava/ingestion': r('./packages/ingestion/src/index.ts'),
      '@ava/telemetry': r('./packages/telemetry/src/index.ts'),
      '@ava/llm/anthropic': r('./packages/llm/src/providers/anthropic.ts'),
      '@ava/llm': r('./packages/llm/src/index.ts'),
      '@ava/retrieval': r('./packages/retrieval/src/index.ts'),
      '@ava/app': r('./packages/app/src/index.ts'),
      '@ava/test-support': r('./packages/test-support/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/golden/**/*.test.ts',
      'tests/validation/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
})
