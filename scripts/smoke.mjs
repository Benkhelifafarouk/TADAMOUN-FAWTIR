#!/usr/bin/env node
/**
 * HTTP smoke test against a real production build.
 *
 *   npm run build && npm run test:e2e
 *
 * Starts `next start` on a free port with an isolated environment, then checks
 * the public surface, security headers, redirects (locale + auth), private file
 * denial, webhook signature rejection and that no private data reaches HTML.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = Number(process.env.SMOKE_PORT ?? 3210);
const BASE = `http://127.0.0.1:${PORT}`;
const failures = [];
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForServer(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return false;
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_URL: BASE,
  APP_SECRET: 'smoke-test-secret-value-0123456789',
  FILE_SIGNING_SECRET: 'smoke-file-secret-value-0123456789',
  JOBS_TICK_SECRET: 'smoke-jobs-secret',
  DATABASE_DRIVER: 'pglite',
  PGLITE_DATA_DIR: process.env.SMOKE_PGLITE_DIR ?? '.data/pglite',
  AUTO_MIGRATE: 'false',
  DEMO_MODE: 'false',
  PAYMENTS_LIVE_ENABLED: 'false',
  PAYMENT_PROVIDER: 'demo',
  OCR_PROVIDER: 'demo',
};

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
  { env, stdio: ['ignore', 'pipe', 'pipe'] },
);

let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});

function shutdown() {
  if (!server.killed) {
    server.kill('SIGTERM');
    setTimeout(() => {
      if (!server.killed) server.kill('SIGKILL');
    }, 3000).unref();
  }
}

try {
  const ready = await waitForServer();
  if (!ready) {
    console.error('Server did not become ready.\n', serverLog.slice(-2000));
    shutdown();
    process.exit(1);
  }

  const health = await fetch(`${BASE}/api/health`);
  const healthJson = await health.json();
  check('health endpoint is ok', health.status === 200 && healthJson.status === 'ok', JSON.stringify(healthJson));

  const root = await fetch(`${BASE}/`, { redirect: 'manual' });
  check('root redirects to a locale', [302, 307, 308].includes(root.status) && (root.headers.get('location') ?? '').includes('/ar'));

  const arabic = await fetch(`${BASE}/ar`);
  const arabicHtml = await arabic.text();
  check('Arabic home renders', arabic.status === 200 && arabicHtml.includes('تضامن فواتير'));
  check('RTL direction is set', arabicHtml.includes('dir="rtl"'));
  const csp = arabic.headers.get('content-security-policy') ?? '';
  check('CSP header present with nonce', csp.includes('nonce-') && csp.includes("frame-ancestors 'none'"));
  const apiCache = (await fetch(`${BASE}/api/health`)).headers.get('cache-control') ?? '';
  check('no-store on API responses', apiCache.includes('no-store'), apiCache);

  const french = await fetch(`${BASE}/fr`);
  const frenchHtml = await french.text();
  check('French home renders LTR', french.status === 200 && frenchHtml.includes('dir="ltr"'));

  const requests = await fetch(`${BASE}/ar/requests`);
  const requestsHtml = await requests.text();
  check('public request list renders', requests.status === 200);
  check('no beneficiary email leaked into public HTML', !requestsHtml.includes('@demo.local'));
  check('no demo family name leaked into public HTML', !requestsHtml.includes('Famille Démo'));

  const legal = await fetch(`${BASE}/ar/legal/privacy`);
  check('privacy notice renders', legal.status === 200);

  const admin = await fetch(`${BASE}/ar/admin`, { redirect: 'manual' });
  check('admin area redirects anonymous users', [302, 307, 308].includes(admin.status));

  const beneficiaryArea = await fetch(`${BASE}/ar/app`, { redirect: 'manual' });
  check('beneficiary area redirects anonymous users', [302, 307, 308].includes(beneficiaryArea.status));

  const fileNoToken = await fetch(`${BASE}/api/files/00000000-0000-0000-0000-000000000000`);
  check('private file without token is denied', fileNoToken.status === 403);

  const badWebhook = await fetch(`${BASE}/api/webhooks/payments/demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'deadbeef' },
    body: JSON.stringify({ id: 'evt_1', type: 'payment.captured' }),
  });
  check('unsigned webhook is rejected', badWebhook.status === 401);

  const unknownProvider = await fetch(`${BASE}/api/webhooks/payments/stripe`, {
    method: 'POST',
    body: '{}',
  });
  check('unknown payment provider is rejected', unknownProvider.status === 404);

  const jobsWithoutSecret = await fetch(`${BASE}/api/internal/jobs/tick`, { method: 'POST' });
  check('job endpoint requires the shared secret', jobsWithoutSecret.status === 401);

  const missingPage = await fetch(`${BASE}/ar/requests/TF-0000-000000`, { redirect: 'manual' });
  check('unknown request does not 500', missingPage.status === 200 || [302, 307, 404].includes(missingPage.status));
} catch (error) {
  failures.push(`unexpected error: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  shutdown();
}

for (const item of checks) {
  console.info(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail && !item.ok ? ` — ${item.detail}` : ''}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed.`);
  process.exitCode = 1;
} else {
  console.info(`\nAll ${checks.length} smoke checks passed.`);
}
