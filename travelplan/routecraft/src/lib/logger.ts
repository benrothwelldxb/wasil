/**
 * Scoped, level-filtered logging with a swappable sink.
 *
 * `console.*` MUST be referenced nowhere else in the codebase — every
 * module that needs to log imports `log` (or builds its own scope via
 * `createLogger`/`log.child`) from here instead. See
 * `docs/conventions/logging.md` for the full rationale and the "adding a
 * remote sink" recipe.
 */
import { env } from '@/config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  level: Exclude<LogLevel, 'silent'>;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  /** Returns a child logger whose scope is `${parentScope}:${scope}`. */
  child(scope: string): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * The only `console.*` call site in the app. Maps each level to its
 * matching console method.
 */
export const consoleSink: LogSink = {
  write(entry) {
    const prefix = `[${entry.scope}]`;
    switch (entry.level) {
      case 'debug':
        console.debug(prefix, entry.message, entry.context ?? '');
        return;
      case 'info':
        console.info(prefix, entry.message, entry.context ?? '');
        return;
      case 'warn':
        console.warn(prefix, entry.message, entry.context ?? '');
        return;
      case 'error':
        console.error(prefix, entry.message, entry.context ?? '');
        return;
    }
  },
};

let activeSink: LogSink = consoleSink;

/** Replaces the active sink. Used to route logs elsewhere (or to capture them in tests). */
export function setSink(sink: LogSink): void {
  activeSink = sink;
}

function isEnabled(level: Exclude<LogLevel, 'silent'>): boolean {
  // Threshold is read at call time (not cached), so it always reflects the
  // current `env.logLevel`.
  return LEVEL_ORDER[level] >= LEVEL_ORDER[env.logLevel];
}

function emit(
  scope: string,
  level: Exclude<LogLevel, 'silent'>,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!isEnabled(level)) return;
  activeSink.write({ level, scope, message, context, timestamp: Date.now() });
}

function makeLogger(scope: string): Logger {
  return {
    debug: (msg, ctx) => emit(scope, 'debug', msg, ctx),
    info: (msg, ctx) => emit(scope, 'info', msg, ctx),
    warn: (msg, ctx) => emit(scope, 'warn', msg, ctx),
    error: (msg, ctx) => emit(scope, 'error', msg, ctx),
    child: (childScope) => makeLogger(`${scope}:${childScope}`),
  };
}

/** Creates a logger scoped to `scope` (default `'app'`). */
export function createLogger(scope = 'app'): Logger {
  return makeLogger(scope);
}

/** The app-wide default logger, scoped `'app'`. */
export const log: Logger = createLogger('app');
