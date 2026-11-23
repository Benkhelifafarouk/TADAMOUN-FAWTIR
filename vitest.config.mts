import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 45_000,
    hookTimeout: 120_000,
    // PGlite is a WASM build of PostgreSQL: run files sequentially in one fork so
    // that each database instance owns its own memory safely.
    pool: 'forks',
    fileParallelism: false,
    reporters: ['default'],
    env: {
      NODE_ENV: 'test',
      DATABASE_DRIVER: 'pglite',
      APP_SECRET: 'test-secret-test-secret-test-secret-test-secret',
      FILE_SIGNING_SECRET: 'test-file-secret-test-file-secret-testfile',
      JOBS_TICK_SECRET: 'test-jobs-secret',
      PAYMENT_PROVIDER: 'demo',
      PAYMENTS_LIVE_ENABLED: 'false',
      DEMO_MODE: 'true',
      AUTO_MIGRATE: 'false',
      OCR_PROVIDER: 'demo',
    },
  },
  resolve: {
    alias: {
      '@': root,
    },
  },
});
