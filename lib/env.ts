import { z } from 'zod';

/**
 * Server-side environment contract. Every value is validated once at startup so
 * a misconfigured deployment fails loudly instead of silently using a default.
 * Never import this module from a Client Component.
 */

const booleanish = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_SECRET: z.string().min(24).optional(),
  FILE_SIGNING_SECRET: z.string().min(24).optional(),
  JOBS_TICK_SECRET: z.string().min(8).optional(),

  DATABASE_DRIVER: z.enum(['pglite', 'postgres']).default('pglite'),
  PGLITE_DATA_DIR: z.string().default('.data/pglite'),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: booleanish,
  AUTO_MIGRATE: booleanish,

  PAYMENT_PROVIDER: z.enum(['demo', 'none']).default('demo'),
  PAYMENTS_LIVE_ENABLED: booleanish,
  PUBLIC_DONATIONS_ENABLED: booleanish,
  DEMO_MODE: booleanish,

  OCR_PROVIDER: z.enum(['demo', 'http']).default('demo'),
  OCR_PROVIDER_URL: z.string().url().optional(),
  OCR_PROVIDER_API_KEY: z.string().optional(),
  OCR_PROVIDER_MODEL: z.string().optional(),
  EXTERNAL_AI_PROCESSING_ENABLED: booleanish,

  EMAIL_PROVIDER: z.enum(['none', 'smtp']).default('none'),
  EMAIL_FROM: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMS_PROVIDER: z.enum(['none', 'http']).default('none'),
  SMS_API_KEY: z.string().optional(),

  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(8 * 1024 * 1024),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('.data/private-storage'),

  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(720),
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(20),
});

export type Env = Omit<z.infer<typeof schema>, 'APP_SECRET' | 'FILE_SIGNING_SECRET'> & {
  APP_SECRET: string;
  FILE_SIGNING_SECRET: string;
  autoMigrate: boolean;
  databaseSsl: boolean;
  paymentsLive: boolean;
  donationsEnabled: boolean;
  demoMode: boolean;
  externalAi: boolean;
};

const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';
let cached: Env | null = null;

function parse(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  const v = parsed.data;
  const isProd = v.NODE_ENV === 'production';

  if (isProd) {
    const problems: string[] = [];
    if (!v.APP_SECRET) problems.push('APP_SECRET is required in production');
    if (!v.FILE_SIGNING_SECRET) problems.push('FILE_SIGNING_SECRET is required in production');
    if (!v.JOBS_TICK_SECRET) problems.push('JOBS_TICK_SECRET is required in production');
    if (v.DATABASE_DRIVER === 'postgres' && !v.DATABASE_URL) {
      problems.push('DATABASE_URL is required when DATABASE_DRIVER=postgres');
    }
    if (v.PAYMENTS_LIVE_ENABLED) {
      problems.push(
        'PAYMENTS_LIVE_ENABLED=true is not supported: no licensed payment provider integration has been certified',
      );
    }
    if (v.DEMO_MODE) problems.push('DEMO_MODE must be false in production');
    if (problems.length > 0) {
      throw new Error(`Unsafe production configuration — ${problems.join('; ')}`);
    }
  }

  const autoMigrate = v.AUTO_MIGRATE ?? v.NODE_ENV !== 'production';
  const paymentsLive = v.PAYMENTS_LIVE_ENABLED ?? false;

  return {
    ...v,
    APP_SECRET: v.APP_SECRET ?? DEV_SECRET,
    FILE_SIGNING_SECRET: v.FILE_SIGNING_SECRET ?? `${DEV_SECRET}-files`,
    autoMigrate,
    databaseSsl: v.DATABASE_SSL ?? v.NODE_ENV === 'production',
    paymentsLive,
    donationsEnabled: v.PUBLIC_DONATIONS_ENABLED ?? true,
    demoMode: v.DEMO_MODE ?? v.NODE_ENV !== 'production',
    externalAi: v.EXTERNAL_AI_PROCESSING_ENABLED ?? false,
  };
}

export function env(): Env {
  if (!cached) cached = parse();
  return cached;
}

/** For tests: forget the cached environment after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function isProduction(): boolean {
  return env().NODE_ENV === 'production';
}
