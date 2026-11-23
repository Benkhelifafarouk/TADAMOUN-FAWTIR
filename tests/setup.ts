/**
 * Global test setup.
 *
 * Environment variables are injected by vitest.config.mts. Every test file that
 * touches the database boots its own in-memory PostgreSQL instance through
 * tests/helpers/db.ts, so nothing here must mutate global state.
 */

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_DRIVER: 'pglite',
  AUTO_MIGRATE: 'false',
  DEMO_MODE: 'true',
  PAYMENT_PROVIDER: 'demo',
  PAYMENTS_LIVE_ENABLED: 'false',
});
