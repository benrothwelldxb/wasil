import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_REGISTRY, resolveFlags } from '@/config/flags';

vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  },
}));

import { log } from '@/lib/logger';

const warnMock = vi.mocked(log.warn);

beforeEach(() => {
  warnMock.mockClear();
});

describe('resolveFlags', () => {
  describe('registry defaults per environment', () => {
    it('resolves development defaults', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: '',
        localOverride: null,
        appEnv: 'development',
      });

      expect(result).toEqual({
        queryDevtools: true,
        debugPanel: false,
        syntheticLatency: true,
        httpProvider: false,
        stopoverDiscovery: true,
      });
    });

    it('resolves staging defaults', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: '',
        localOverride: null,
        appEnv: 'staging',
      });

      expect(result).toEqual({
        queryDevtools: false,
        debugPanel: false,
        syntheticLatency: true,
        httpProvider: false,
        stopoverDiscovery: true,
      });
    });

    it('resolves production defaults', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: '',
        localOverride: null,
        appEnv: 'production',
      });

      expect(result).toEqual({
        queryDevtools: false,
        debugPanel: false,
        syntheticLatency: false,
        httpProvider: false,
        stopoverDiscovery: false,
      });
    });
  });

  describe('env-string parsing', () => {
    it('enables a named flag, overriding its default', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: 'debugPanel',
        localOverride: null,
        appEnv: 'production',
      });

      expect(result.debugPanel).toBe(true);
    });

    it('disables a named flag with a leading "!"', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: '!syntheticLatency',
        localOverride: null,
        appEnv: 'development',
      });

      expect(result.syntheticLatency).toBe(false);
    });

    it('applies multiple comma-separated flags, trimming whitespace', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: ' debugPanel , !queryDevtools ,httpProvider ',
        localOverride: null,
        appEnv: 'development',
      });

      expect(result.debugPanel).toBe(true);
      expect(result.queryDevtools).toBe(false);
      expect(result.httpProvider).toBe(true);
      // untouched by the env string, so it keeps its registry default
      expect(result.syntheticLatency).toBe(true);
    });

    it('leaves defaults untouched for an empty string', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: '',
        localOverride: null,
        appEnv: 'staging',
      });

      expect(result).toEqual({
        queryDevtools: false,
        debugPanel: false,
        syntheticLatency: true,
        httpProvider: false,
        stopoverDiscovery: true,
      });
    });
  });

  describe('unknown flag names', () => {
    it('ignores an unknown name without throwing', () => {
      expect(() =>
        resolveFlags({
          defaults: FLAG_REGISTRY,
          rawEnvFlags: 'notARealFlag',
          localOverride: null,
          appEnv: 'development',
        }),
      ).not.toThrow();
    });

    it('does not change any known flag when the string only contains an unknown name', () => {
      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: 'notARealFlag',
        localOverride: null,
        appEnv: 'development',
      });

      expect(result).toEqual({
        queryDevtools: true,
        debugPanel: false,
        syntheticLatency: true,
        httpProvider: false,
        stopoverDiscovery: true,
      });
    });

    it('reports the unknown name via log.warn exactly once per resolution', () => {
      resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: 'notARealFlag,notARealFlag',
        localOverride: '!notARealFlag',
        appEnv: 'development',
      });

      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('unknown feature flag', { name: 'notARealFlag' });
    });
  });

  describe('localStorage override precedence (dev-only gating)', () => {
    it('applies the override, taking precedence over the env string', () => {
      // Mirrors how the module composes `localOverride`: the caller passes
      // the stored string straight through when `env.isDev` is true.
      const isDev = true;
      const stored = '!debugPanel,httpProvider';

      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: 'debugPanel',
        localOverride: isDev ? stored : null,
        appEnv: 'development',
      });

      expect(result.debugPanel).toBe(false);
      expect(result.httpProvider).toBe(true);
    });

    it('is ignored entirely when isDev is false', () => {
      // Mirrors how the module composes `localOverride`: the caller passes
      // `null` instead of the stored string when `env.isDev` is false, so
      // the override never reaches `resolveFlags`.
      const isDev = false;
      const stored = 'debugPanel';

      const result = resolveFlags({
        defaults: FLAG_REGISTRY,
        rawEnvFlags: '',
        localOverride: isDev ? stored : null,
        appEnv: 'production',
      });

      expect(result.debugPanel).toBe(false);
    });
  });

  it('is pure: identical input produces identical output', () => {
    const input = {
      defaults: FLAG_REGISTRY,
      rawEnvFlags: 'debugPanel,!syntheticLatency',
      localOverride: 'httpProvider',
      appEnv: 'staging' as const,
    };

    expect(resolveFlags(input)).toEqual(resolveFlags(input));
  });
});
