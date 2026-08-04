/**
 * Generic retry-with-backoff helper used by the `FlightEngine` to retry a
 * single adapter's `search()` call before falling through to the next
 * adapter. Framework-agnostic: knows nothing about adapters, journeys, or the
 * cache — only about retrying an async function and classifying whether a
 * given failure is worth retrying.
 */
import { isHttpError } from '@/lib/http';
import { isProviderError } from '@/data/provider/errors';

export interface RetryOptions {
  /** Total attempts including the first, non-retry call. Default `3`. */
  attempts?: number;
  /** Base backoff delay in milliseconds, before jitter. Default `300`. */
  baseDelayMs?: number;
  /** Exponential growth factor applied per retry. Default `2`. */
  factor?: number;
  /** Ceiling on the (pre-jitter) computed backoff delay. Default `3000`. */
  maxDelayMs?: number;
  /** Applies jitter to a computed delay. Default: equal-jitter. */
  jitter?: (delayMs: number) => number;
  /** Decides whether a failure should be retried. Default: `classifyRetryable`. */
  isRetryable?: (err: unknown) => boolean;
  signal?: AbortSignal;
  /** Waits `ms` milliseconds, abortable via `signal`. Default: abort-aware `setTimeout`. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Called immediately before each backoff sleep, once per retry. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_FACTOR = 2;
const DEFAULT_MAX_DELAY_MS = 3000;

/** Equal-jitter: half the delay is fixed, half is randomised. */
function defaultJitter(delayMs: number): number {
  return delayMs / 2 + Math.random() * (delayMs / 2);
}

/** Abort-aware `setTimeout`-based sleep. Rejects with `signal.reason`, unchanged, on abort. */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * The default retry classification:
 * - `HttpError` kind `network` | `timeout` → retryable.
 * - `HttpError` kind `http` with `status >= 500` or `status === 429` → retryable.
 * - `HttpError` kind `http` with any other 4xx, or kind `parse` | `abort` → not retryable.
 * - `ProviderError` code `PROVIDER_FAILURE` → retryable.
 * - `ProviderError` code `INVALID_CRITERIA` | `UNKNOWN_AIRPORT` | `NO_ROUTES` → not retryable.
 * - Anything else → not retryable.
 */
export function classifyRetryable(err: unknown): boolean {
  if (isHttpError(err)) {
    if (err.kind === 'network' || err.kind === 'timeout') return true;
    if (err.kind === 'http') return err.status === 429 || (err.status ?? 0) >= 500;
    return false; // parse | abort
  }
  if (isProviderError(err)) {
    return err.code === 'PROVIDER_FAILURE';
  }
  return false;
}

function computeDelayMs(attempt: number, baseDelayMs: number, factor: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt - 1));
}

/**
 * Calls `fn` (passing the 1-indexed attempt number), retrying on failure per
 * `opts`. A caller abort — `signal.aborted` true before an attempt starts or
 * during a backoff sleep — rejects immediately with `signal.reason`,
 * unchanged, and is never counted as an attempt or passed through
 * `isRetryable`.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const factor = opts.factor ?? DEFAULT_FACTOR;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitter = opts.jitter ?? defaultJitter;
  const isRetryable = opts.isRetryable ?? classifyRetryable;
  const sleep = opts.sleep ?? defaultSleep;
  const { signal, onRetry } = opts;

  let attempt = 1;
  for (;;) {
    if (signal?.aborted) {
      throw signal.reason;
    }

    try {
      return await fn(attempt);
    } catch (err) {
      if (signal?.aborted) {
        throw signal.reason;
      }
      if (attempt < attempts && isRetryable(err)) {
        const delayMs = jitter(computeDelayMs(attempt, baseDelayMs, factor, maxDelayMs));
        onRetry?.({ attempt, delayMs, error: err });
        await sleep(delayMs, signal);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}
