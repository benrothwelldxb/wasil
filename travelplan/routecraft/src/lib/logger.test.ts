import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleSink, createLogger, log, setSink } from '@/lib/logger';
import type { LogEntry, LogSink } from '@/lib/logger';

function capturingSink(): { sink: LogSink; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { sink: { write: (entry) => entries.push(entry) }, entries };
}

describe('createLogger / log (default scope + test-env threshold)', () => {
  it('createLogger() defaults to scope "app", same as the exported `log`', () => {
    const { sink, entries } = capturingSink();
    setSink(sink);

    createLogger().info('via createLogger()');
    log.info('via log');

    expect(entries.map((e) => e.scope)).toEqual(['app', 'app']);
  });

  it('child() joins scopes with ":", including multiple levels', () => {
    const { sink, entries } = capturingSink();
    setSink(sink);

    log.child('results').info('one level');
    log.child('a').child('b').info('two levels');

    expect(entries[0]?.scope).toBe('app:results');
    expect(entries[1]?.scope).toBe('app:a:b');
  });

  it('produces entries with the full {level, scope, message, context, timestamp} shape', () => {
    const { sink, entries } = capturingSink();
    setSink(sink);

    log.warn('careful', { count: 3 });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toEqual({
      level: 'warn',
      scope: 'app',
      message: 'careful',
      context: { count: 3 },
      timestamp: expect.any(Number),
    });
  });

  it('omits context when the caller does not pass one', () => {
    const { sink, entries } = capturingSink();
    setSink(sink);

    log.error('boom');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.context).toBeUndefined();
    expect(typeof entries[0]?.timestamp).toBe('number');
  });

  it('setSink swaps the active sink; only the new sink receives subsequent entries', () => {
    const first = capturingSink();
    const second = capturingSink();

    setSink(first.sink);
    log.info('one');

    setSink(second.sink);
    log.info('two');
    log.info('three');

    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(2);
  });

  it('emits debug/info/warn/error at this test environment\'s "debug" log level', () => {
    const { sink, entries } = capturingSink();
    setSink(sink);

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(entries.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });
});

describe('threshold filtering (mocked @/config/env)', () => {
  afterEach(() => {
    vi.doUnmock('@/config/env');
    vi.resetModules();
  });

  async function loggerAtLevel(logLevel: string) {
    vi.resetModules();
    vi.doMock('@/config/env', () => ({ env: { logLevel } }));
    return import('@/lib/logger');
  }

  it('a "warn" threshold drops debug/info but keeps warn/error', async () => {
    const mod = await loggerAtLevel('warn');
    const { sink, entries } = capturingSink();
    mod.setSink(sink);

    mod.log.debug('d');
    mod.log.info('i');
    mod.log.warn('w');
    mod.log.error('e');

    expect(entries.map((e) => e.level)).toEqual(['warn', 'error']);
  });

  it('an "error" threshold drops everything but error', async () => {
    const mod = await loggerAtLevel('error');
    const { sink, entries } = capturingSink();
    mod.setSink(sink);

    mod.log.debug('d');
    mod.log.info('i');
    mod.log.warn('w');
    mod.log.error('e');

    expect(entries.map((e) => e.level)).toEqual(['error']);
  });

  it('a "silent" threshold logger emits nothing', async () => {
    const mod = await loggerAtLevel('silent');
    const { sink, entries } = capturingSink();
    mod.setSink(sink);

    mod.log.debug('d');
    mod.log.info('i');
    mod.log.warn('w');
    mod.log.error('e');
    mod.log.child('nested').error('still nothing');

    expect(entries).toHaveLength(0);
  });

  it('a "debug" threshold logger emits everything', async () => {
    const mod = await loggerAtLevel('debug');
    const { sink, entries } = capturingSink();
    mod.setSink(sink);

    mod.log.debug('d');
    mod.log.info('i');
    mod.log.warn('w');
    mod.log.error('e');

    expect(entries).toHaveLength(4);
  });
});

describe('consoleSink', () => {
  it('is the only console.* call site, and maps each level to its matching console method', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const base = { scope: 'x', message: 'm', timestamp: Date.now() } as const;
    consoleSink.write({ ...base, level: 'debug' });
    consoleSink.write({ ...base, level: 'info' });
    consoleSink.write({ ...base, level: 'warn' });
    consoleSink.write({ ...base, level: 'error' });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
