/**
 * Typed feature-flag registry, resolved once at module load into a frozen
 * boolean snapshot.
 *
 * Flags are read via `isEnabled` (or the `useFlag` hook / `<Flag>` component
 * in `@/hooks/use-flag` and `@/components/shared/Flag`) — never by reaching
 * into `FLAG_REGISTRY` or `env.rawFlags` directly. See
 * `docs/conventions/flags.md` for the full rationale, the "adding a flag"
 * checklist, and the dev-only localStorage QA recipe.
 */
import type { AppEnv } from '@/config/env';
import { env } from '@/config/env';
import { log } from '@/lib/logger';

/** localStorage key for the dev-only override (see `docs/conventions/flags.md`). */
const LOCAL_OVERRIDE_KEY = 'routecraft:flags';

export const FLAG_REGISTRY = {
  queryDevtools: {
    default: { development: true, staging: false, production: false },
    description: 'TanStack Query devtools panel',
  },
  debugPanel: {
    default: { development: false, staging: false, production: false },
    description: 'In-app debug panel',
  },
  syntheticLatency: {
    default: { development: true, staging: true, production: false },
    description: 'Artificial latency in the synthetic provider',
  },
  httpProvider: {
    default: { development: false, staging: false, production: false },
    description: 'Use the HTTP journey provider (Phase Two)',
  },
  stopoverDiscovery: {
    default: { development: true, staging: true, production: false },
    description: 'Use the stopover discovery engine as the primary flight adapter',
  },
} as const;

export type FlagName = keyof typeof FLAG_REGISTRY;

type AppEnvName = AppEnv['appEnv'];

const FLAG_NAMES = Object.keys(FLAG_REGISTRY) as FlagName[];

function isFlagName(name: string): name is FlagName {
  return (FLAG_NAMES as string[]).includes(name);
}

/**
 * Applies a comma-separated flag string (`name` enables, `!name` disables)
 * onto `target` in place. Unknown names are ignored and reported through
 * `log.warn` at most once per `name` per `warned` set, so a name repeated
 * across the env string and the localStorage override — or repeated within
 * one string — only logs once per resolution pass.
 */
function applyFlagString(
  input: string,
  target: Record<FlagName, boolean>,
  warned: Set<string>,
): void {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (const part of parts) {
    const negated = part.startsWith('!');
    const name = negated ? part.slice(1).trim() : part;
    if (name.length === 0) continue;

    if (!isFlagName(name)) {
      if (!warned.has(name)) {
        warned.add(name);
        log.warn('unknown feature flag', { name });
      }
      continue;
    }

    target[name] = !negated;
  }
}

export interface ResolveFlagsInput {
  /** Registry to read per-environment defaults from — pass `FLAG_REGISTRY`. */
  defaults: typeof FLAG_REGISTRY;
  /** Raw `VITE_FLAGS` string (`env.rawFlags`). */
  rawEnvFlags: string;
  /**
   * Raw dev-only localStorage override string, or `null` when there is none
   * to apply — including when the caller has already decided (via
   * `env.isDev`) that overrides should be ignored outside development.
   * `resolveFlags` itself performs no env/localStorage access; it is a pure
   * function of its inputs so it is fully testable without touching globals.
   */
  localOverride: string | null;
  /** Current `env.appEnv`, selecting which column of `defaults` applies. */
  appEnv: AppEnvName;
}

/**
 * Pure resolver: registry defaults for `appEnv`, then `rawEnvFlags`, then
 * `localOverride` (highest precedence), each layer overriding the last.
 * Touches no globals — safe to call directly from tests with fabricated
 * inputs.
 */
export function resolveFlags(input: ResolveFlagsInput): Record<FlagName, boolean> {
  const { defaults, rawEnvFlags, localOverride, appEnv } = input;

  const result = {} as Record<FlagName, boolean>;
  for (const name of FLAG_NAMES) {
    result[name] = defaults[name].default[appEnv];
  }

  const warned = new Set<string>();
  applyFlagString(rawEnvFlags, result, warned);
  if (localOverride !== null) {
    applyFlagString(localOverride, result, warned);
  }

  return result;
}

/**
 * Reads the dev-only localStorage override. Returns `null` outside
 * development (`env.isDev === false`), when `localStorage`/`window` are
 * unavailable (SSR/test environments), or when the key is unset.
 */
function readLocalOverride(): string | null {
  if (!env.isDev) return null;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;

  try {
    return window.localStorage.getItem(LOCAL_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/**
 * The resolved, frozen flag snapshot for the running app — computed once at
 * module load from `env.appEnv`, `env.rawFlags`, and (dev-only) the
 * localStorage override. Prefer `isEnabled`, `useFlag`, or `<Flag>` over
 * reading this directly.
 */
export const flags: Readonly<Record<FlagName, boolean>> = Object.freeze(
  resolveFlags({
    defaults: FLAG_REGISTRY,
    rawEnvFlags: env.rawFlags,
    localOverride: readLocalOverride(),
    appEnv: env.appEnv,
  }),
);

/** Whether `name` is enabled in the resolved snapshot. */
export function isEnabled(name: FlagName): boolean {
  return flags[name];
}
