import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/lib/http';
import { ProviderError, type ProviderErrorCode } from '@/data/provider/errors';
import { classifyRetryable, withRetry } from './index';

function httpErr(kind: HttpError['kind'], status?: number): HttpError {
  return new HttpError({ kind, message: `http ${kind}`, url: 'https://api.test/x', status });
}

function providerErr(code: ProviderErrorCode): ProviderError {
  return new ProviderError(code, `provider ${code}`);
}

describe('classifyRetryable', () => {
  const cases: Array<[string, unknown, boolean]> = [
    ['HttpError network', httpErr('network'), true],
    ['HttpError timeout', httpErr('timeout'), true],
    ['HttpError http 500', httpErr('http', 500), true],
    ['HttpError http 503', httpErr('http', 503), true],
    ['HttpError http 429', httpErr('http', 429), true],
    ['HttpError http 400', httpErr('http', 400), false],
    ['HttpError http 404', httpErr('http', 404), false],
    ['HttpError http with no status', httpErr('http'), false],
    ['HttpError parse', httpErr('parse'), false],
    ['HttpError abort', httpErr('abort'), false],
    ['ProviderError PROVIDER_FAILURE', providerErr('PROVIDER_FAILURE'), true],
    ['ProviderError INVALID_CRITERIA', providerErr('INVALID_CRITERIA'), false],
    ['ProviderError UNKNOWN_AIRPORT', providerErr('UNKNOWN_AIRPORT'), false],
    ['ProviderError NO_ROUTES', providerErr('NO_ROUTES'), false],
    ['a plain Error', new Error('boom'), false],
    ['a string', 'boom', false],
    ['undefined', undefined, false],
  ];

  it.each(cases)('%s → %s', (_label, err, expected) => {
    expect(classifyRetryable(err)).toBe(expected);
  });
});

describe('withRetry', () => {
  it('succeeds on the first try without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { sleep, jitter: (d) => d });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a retryable error up to `attempts` times then throws the last error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const errors = [httpErr('network'), httpErr('timeout'), httpErr('http', 500)];
    const fn = vi.fn(
      (attempt: number) => Promise.reject(errors[attempt - 1]) as Promise<never>,
    );

    await expect(
      withRetry(fn, { sleep, jitter: (d) => d, attempts: 3 }),
    ).rejects.toBe(errors[2]);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not retry a terminal (non-retryable) error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const terminal = providerErr('INVALID_CRITERIA');
    const fn = vi.fn().mockRejectedValue(terminal);

    await expect(withRetry(fn, { sleep, jitter: (d) => d, attempts: 5 })).rejects.toBe(terminal);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('calls onRetry with {attempt, delayMs, error} before each backoff sleep', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const err = httpErr('network');
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    const result = await withRetry(fn, {
      sleep,
      jitter: (d) => d,
      attempts: 2,
      baseDelayMs: 300,
      factor: 2,
      onRetry,
    });

    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, delayMs: 300, error: err });
  });

  it('computes the backoff sequence as base*factor^(n-1), capped at maxDelayMs, then jitters', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const jitter = vi.fn((d: number) => d); // identity, so we can assert pre/post-jitter values are equal
    let call = 0;
    const fn = vi.fn(() => {
      call += 1;
      return call <= 5 ? Promise.reject(httpErr('network')) : Promise.resolve('ok');
    });

    const result = await withRetry(fn, {
      sleep,
      jitter,
      attempts: 6,
      baseDelayMs: 300,
      factor: 2,
      maxDelayMs: 3000,
    });

    expect(result).toBe('ok');
    // attempt 1..5: 300, 600, 1200, 2400, 4800→capped to 3000
    const expectedDelays = [300, 600, 1200, 2400, 3000];
    expect(jitter).toHaveBeenCalledTimes(5);
    expect(jitter.mock.calls.map((c) => c[0])).toEqual(expectedDelays);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual(expectedDelays);
  });

  it('applies the injected jitter function to the computed delay before sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const jitter = vi.fn((d: number) => d + 7);
    const fn = vi.fn().mockRejectedValueOnce(httpErr('network')).mockResolvedValueOnce('ok');

    await withRetry(fn, { sleep, jitter, attempts: 2, baseDelayMs: 300, factor: 2 });

    expect(sleep).toHaveBeenCalledWith(307, undefined);
  });

  it('rejects immediately with the abort reason, unchanged, when the signal is already aborted', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    controller.abort(reason);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(
      withRetry(fn, { sleep, jitter: (d) => d, signal: controller.signal }),
    ).rejects.toBe(reason);

    expect(fn).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rejects immediately with the abort reason, unchanged, and does not count it as an attempt, when aborted during backoff sleep', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    // Simulates the caller aborting while `sleep` is pending: the injected
    // sleep itself flips the controller and rejects with the (now-set) reason.
    const sleep = vi.fn((_ms: number, signal?: AbortSignal) => {
      controller.abort(reason);
      return Promise.reject(signal?.reason as unknown);
    });
    const fn = vi.fn().mockRejectedValue(httpErr('network'));

    await expect(
      withRetry(fn, { sleep, jitter: (d) => d, attempts: 3, signal: controller.signal }),
    ).rejects.toBe(reason);

    // Only the first attempt ran; the retry that was about to happen never counted.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately with the abort reason when the signal aborts during the attempt itself (detected right after the call fails, before sleeping)', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn(() => {
      // The signal flips while the attempt is in flight — by the time the
      // rejection is caught, `signal.aborted` is already true.
      controller.abort(reason);
      return Promise.reject(httpErr('network'));
    });

    await expect(
      withRetry(fn, { sleep, jitter: (d) => d, attempts: 3, signal: controller.signal }),
    ).rejects.toBe(reason);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  describe('default sleep/jitter (fake timers — no real waiting)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('backs off using the default abort-aware setTimeout sleep and equal-jitter function when none are injected', async () => {
      const fn = vi.fn().mockRejectedValueOnce(httpErr('network')).mockResolvedValueOnce('ok');

      const promise = withRetry(fn, { attempts: 2, baseDelayMs: 10, maxDelayMs: 20 });
      await vi.advanceTimersByTimeAsync(20);

      await expect(promise).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('the default sleep rejects with the unchanged abort reason when the signal aborts mid-wait', async () => {
      const controller = new AbortController();
      const reason = new DOMException('cancelled', 'AbortError');
      const fn = vi.fn().mockRejectedValue(httpErr('network'));

      const promise = withRetry(fn, { attempts: 3, baseDelayMs: 1000, signal: controller.signal });
      // Let the first attempt run and enter the default backoff sleep, then abort mid-wait.
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(reason);

      await expect(promise).rejects.toBe(reason);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
