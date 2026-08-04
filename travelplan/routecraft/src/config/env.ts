/**
 * Typed, validated environment configuration.
 *
 * `import.meta.env` MUST be referenced nowhere else in the codebase. Every
 * other module that needs a runtime setting imports `env` (or `assertEnv`)
 * from here. See `docs/conventions/env.md` for the full rationale and the
 * "adding a new var" checklist.
 */
import { z } from 'zod';

export const APP_ENVS = ['development', 'staging', 'production'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;

export interface AppEnv {
  appEnv: (typeof APP_ENVS)[number];
  apiBaseUrl: string;
  logLevel: (typeof LOG_LEVELS)[number];
  rawFlags: string;
  appVersion: string;
  isDev: boolean;
  isProd: boolean;
}

/** Thrown when one or more environment variables fail validation. */
export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

/**
 * Treats an empty/whitespace-only string as "unset" so that an accidentally
 * blank `VITE_*` variable (e.g. `VITE_LOG_LEVEL=` in a generated `.env`)
 * falls back to the default instead of failing validation.
 */
function emptyToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}

/**
 * Accepts either an absolute `http(s)://` URL or a `/`-rooted path
 * (e.g. `/api`). Rejects protocol-relative (`//host`), relative
 * (`api`), and other-scheme values.
 */
function isValidApiBaseUrl(value: string): boolean {
  if (value.startsWith('/')) {
    return !value.startsWith('//');
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Derives the dev/prod signal used to compute defaults from the raw env
 * object. Prefers the boolean `DEV` flag Vite injects; falls back to the
 * `MODE` string; defaults to `false` (production-like) when neither is
 * present, matching a real production build.
 */
function resolveIsDevSignal(raw: Record<string, unknown>): boolean {
  if (typeof raw.DEV === 'boolean') {
    return raw.DEV;
  }
  if (typeof raw.MODE === 'string') {
    return raw.MODE === 'development';
  }
  return false;
}

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)';
    return `  - ${key}: ${issue.message}`;
  });
  return `Invalid environment configuration:\n${lines.join('\n')}`;
}

/**
 * Pure, unit-testable core: validates a raw env-like object (typically
 * `import.meta.env`) and returns a fully-typed, defaulted `AppEnv`. Every
 * field is optional — an empty `raw` object always succeeds, so CI and
 * Cloudflare Pages builds work with zero `.env` configuration.
 *
 * Never references `import.meta` — pass `raw.DEV` / `raw.MODE` explicitly
 * to control dev-vs-prod default derivation in tests.
 */
export function parseEnv(raw: Record<string, unknown>): AppEnv {
  const isDevSignal = resolveIsDevSignal(raw);
  const defaultAppEnv: AppEnv['appEnv'] = isDevSignal ? 'development' : 'production';
  const defaultLogLevel: AppEnv['logLevel'] = isDevSignal ? 'debug' : 'warn';

  const schema = z.object({
    VITE_APP_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(APP_ENVS).default(defaultAppEnv),
    ),
    VITE_API_BASE_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .refine(isValidApiBaseUrl, {
          message:
            "must be an absolute URL (e.g. 'https://api.example.com') or a '/'-rooted path (e.g. '/api')",
        })
        .default('/api'),
    ),
    VITE_LOG_LEVEL: z.preprocess(
      emptyToUndefined,
      z.enum(LOG_LEVELS).default(defaultLogLevel),
    ),
    VITE_FLAGS: z.preprocess(emptyToUndefined, z.string().default('')),
    VITE_APP_VERSION: z.preprocess(emptyToUndefined, z.string().default('dev')),
  });

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new EnvError(formatIssues(result.error));
  }

  const data = result.data;

  return {
    appEnv: data.VITE_APP_ENV,
    apiBaseUrl: data.VITE_API_BASE_URL,
    logLevel: data.VITE_LOG_LEVEL,
    rawFlags: data.VITE_FLAGS,
    appVersion: data.VITE_APP_VERSION,
    isDev: data.VITE_APP_ENV === 'development',
    isProd: data.VITE_APP_ENV === 'production',
  };
}

/**
 * The single validated environment snapshot for the running app. Computed
 * once at module load — an invalid `VITE_*` value fails the app's boot
 * (and, in dev, surfaces as a Vite overlay) rather than limping along with
 * bad config.
 */
export const env: AppEnv = parseEnv(import.meta.env);

/**
 * Explicit fail-fast checkpoint for app bootstrap (call from `main.tsx`
 * before rendering). References `env` so any deferred/lazy access pattern
 * still surfaces a validation failure as an `EnvError`, and normalises any
 * unexpected error into one.
 */
export function assertEnv(): void {
  try {
    if (typeof env.appEnv !== 'string') {
      throw new EnvError('Environment configuration failed to initialize.');
    }
  } catch (error) {
    if (error instanceof EnvError) {
      throw error;
    }
    throw new EnvError(`Unexpected error while validating environment: ${String(error)}`);
  }
}
