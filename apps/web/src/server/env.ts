import { resolve } from 'node:path';
import { z } from 'zod';
import { BitoError } from '@bito/shared';

// Attempt to load .env from current directory or monorepo root if running locally
try {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {
      process.loadEnvFile(resolve(process.cwd(), '../../.env'));
    }
  }
} catch {
  // Ignore if .env is missing
}

const isProduction = process.env.NODE_ENV === 'production';
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

const encryptionKeyValidator = z.string().refine(
  (val) => {
    try {
      const buf = Buffer.from(val, 'base64');
      return buf.length === 32;
    } catch {
      return false;
    }
  },
  { message: 'CREDENTIAL_ENCRYPTION_KEY must be base64-encoded 32 bytes' }
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_MIGRATE: z.string().min(1, 'DATABASE_URL_MIGRATE is required').optional(),
  APP_URL: z.string().url('APP_URL must be a valid URL'),
  CREDENTIAL_ENCRYPTION_KEY: encryptionKeyValidator,
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 chars'),
  WEBAUTHN_RP_ID: z.string().min(1, 'WEBAUTHN_RP_ID is required'),
  WEBAUTHN_RP_NAME: z.string().min(1, 'WEBAUTHN_RP_NAME is required'),
  WEBAUTHN_ORIGIN: z.string().url('WEBAUTHN_ORIGIN must be a valid URL'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ALLOW_REGISTRATION: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((val) => val === 'true' || val === '1' || val === undefined),
  GEMINI_DEFAULT_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_PLATFORM_API_KEY: z.string().optional(),
  GRAPH_API_VERSION: z.string().default('v20.0'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  TICK_BUDGET_MS: z.coerce.number().default(45000),
  ALLOW_PRIVATE_HTTP: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((val) => val === 'true' || val === '1'),
  NEXT_PUBLIC_APP_NAME: z.string().default('BITO'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(customEnv?: Record<string, string | undefined>): Env {
  const source = customEnv ?? process.env;

  // Check: Only NEXT_PUBLIC_APP_NAME is allowed among NEXT_PUBLIC_* variables
  const disallowedNextPublic = Object.keys(source).filter(
    (k) => k.startsWith('NEXT_PUBLIC_') && k !== 'NEXT_PUBLIC_APP_NAME'
  );
  if (disallowedNextPublic.length > 0) {
    throw BitoError(
      'CONFIG_INVALID',
      `Disallowed public environment variables detected: ${disallowedNextPublic.join(', ')}. Only NEXT_PUBLIC_APP_NAME is permitted.`
    );
  }

  // Provide development/test/build defaults if outside production or during Next.js static build phase
  const allowDevDefaults = !isProduction || isBuildPhase;

  const target: Record<string, unknown> = {
    DATABASE_URL:
      source.DATABASE_URL ||
      (allowDevDefaults ? 'postgresql://postgres:postgres@localhost:5432/bito' : undefined),
    DATABASE_URL_MIGRATE:
      source.DATABASE_URL_MIGRATE ||
      (allowDevDefaults ? 'postgresql://postgres:postgres@localhost:5432/bito' : undefined),
    APP_URL: source.APP_URL || (allowDevDefaults ? 'http://localhost:3000' : undefined),
    CREDENTIAL_ENCRYPTION_KEY:
      source.CREDENTIAL_ENCRYPTION_KEY ||
      (allowDevDefaults ? 'k8Fw0nZ/bYJ7f8u5+qR7aA3wE1yU9vX2tC6sN4mP0lI=' : undefined),
    CRON_SECRET:
      source.CRON_SECRET || (allowDevDefaults ? 'dev_cron_secret_at_least_16_chars' : undefined),
    WEBAUTHN_RP_ID: source.WEBAUTHN_RP_ID || (allowDevDefaults ? 'localhost' : undefined),
    WEBAUTHN_RP_NAME: source.WEBAUTHN_RP_NAME || (allowDevDefaults ? 'BITO' : undefined),
    WEBAUTHN_ORIGIN:
      source.WEBAUTHN_ORIGIN || (allowDevDefaults ? 'http://localhost:3000' : undefined),
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    ALLOW_REGISTRATION: source.ALLOW_REGISTRATION,
    GEMINI_DEFAULT_MODEL: source.GEMINI_DEFAULT_MODEL ?? 'gemini-2.5-flash',
    GEMINI_PLATFORM_API_KEY: source.GEMINI_PLATFORM_API_KEY,
    GRAPH_API_VERSION: source.GRAPH_API_VERSION ?? 'v20.0',
    GOOGLE_OAUTH_CLIENT_ID: source.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: source.GOOGLE_OAUTH_CLIENT_SECRET,
    TICK_BUDGET_MS: source.TICK_BUDGET_MS ?? 45000,
    ALLOW_PRIVATE_HTTP: source.ALLOW_PRIVATE_HTTP,
    NEXT_PUBLIC_APP_NAME: source.NEXT_PUBLIC_APP_NAME ?? 'BITO',
  };

  const parsed = envSchema.safeParse(target);
  if (!parsed.success) {
    const errorList = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw BitoError('CONFIG_INVALID', `Environment validation failed at boot: ${errorList}`, {
      details: { issues: parsed.error.format() },
    });
  }

  if (parsed.data.ALLOW_PRIVATE_HTTP) {
    // Loud warning at boot (SPEC 9.6)
    process.stderr.write(
      '[WARNING] ALLOW_PRIVATE_HTTP is enabled! Private network HTTP requests are permitted. NEVER enable this in production!\n'
    );
  }

  return parsed.data;
}

export const env = (() => {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
})();
