import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@/config/env';

describe('parseEnv', () => {
  describe('all-defaults path', () => {
    it('succeeds with an empty raw object (zero .env config)', () => {
      const result = parseEnv({});

      expect(result).toEqual({
        appEnv: 'production',
        apiBaseUrl: '/api',
        logLevel: 'warn',
        rawFlags: '',
        appVersion: 'dev',
        isDev: false,
        isProd: true,
      });
    });

    it('applies dev defaults when raw.DEV is true', () => {
      const result = parseEnv({ DEV: true });

      expect(result.appEnv).toBe('development');
      expect(result.logLevel).toBe('debug');
      expect(result.isDev).toBe(true);
      expect(result.isProd).toBe(false);
    });

    it('applies prod defaults when raw.DEV is false', () => {
      const result = parseEnv({ DEV: false });

      expect(result.appEnv).toBe('production');
      expect(result.logLevel).toBe('warn');
      expect(result.isDev).toBe(false);
      expect(result.isProd).toBe(true);
    });

    it('derives dev defaults from raw.MODE when DEV is absent', () => {
      const result = parseEnv({ MODE: 'development' });

      expect(result.appEnv).toBe('development');
      expect(result.logLevel).toBe('debug');
    });

    it('derives prod defaults from raw.MODE when DEV is absent', () => {
      const result = parseEnv({ MODE: 'production' });

      expect(result.appEnv).toBe('production');
      expect(result.logLevel).toBe('warn');
    });

    it('treats an empty-string variable as unset and falls back to its default', () => {
      const result = parseEnv({ DEV: true, VITE_LOG_LEVEL: '' });

      expect(result.logLevel).toBe('debug');
    });
  });

  describe('overrides', () => {
    it('applies an explicit VITE_APP_ENV override', () => {
      const result = parseEnv({ DEV: true, VITE_APP_ENV: 'staging' });

      expect(result.appEnv).toBe('staging');
      expect(result.isDev).toBe(false);
      expect(result.isProd).toBe(false);
    });

    it('applies an explicit absolute-URL VITE_API_BASE_URL override', () => {
      const result = parseEnv({ VITE_API_BASE_URL: 'https://api.example.com/v1' });

      expect(result.apiBaseUrl).toBe('https://api.example.com/v1');
    });

    it('applies an explicit /-rooted path VITE_API_BASE_URL override', () => {
      const result = parseEnv({ VITE_API_BASE_URL: '/backend' });

      expect(result.apiBaseUrl).toBe('/backend');
    });

    it('applies an explicit VITE_LOG_LEVEL override', () => {
      const result = parseEnv({ DEV: true, VITE_LOG_LEVEL: 'silent' });

      expect(result.logLevel).toBe('silent');
    });

    it('applies an explicit VITE_FLAGS override', () => {
      const result = parseEnv({ VITE_FLAGS: 'newNav,!betaTable' });

      expect(result.rawFlags).toBe('newNav,!betaTable');
    });

    it('applies an explicit VITE_APP_VERSION override', () => {
      const result = parseEnv({ VITE_APP_VERSION: '1.2.3' });

      expect(result.appVersion).toBe('1.2.3');
    });
  });

  describe('rejections', () => {
    it('throws EnvError for an invalid VITE_API_BASE_URL', () => {
      expect(() => parseEnv({ VITE_API_BASE_URL: 'not-a-url' })).toThrow(EnvError);
    });

    it('throws EnvError for a protocol-relative VITE_API_BASE_URL', () => {
      expect(() => parseEnv({ VITE_API_BASE_URL: '//example.com' })).toThrow(EnvError);
    });

    it('throws EnvError for a non-http(s) VITE_API_BASE_URL', () => {
      expect(() => parseEnv({ VITE_API_BASE_URL: 'ftp://example.com' })).toThrow(EnvError);
    });

    it('throws EnvError for an invalid VITE_LOG_LEVEL enum value', () => {
      expect(() => parseEnv({ VITE_LOG_LEVEL: 'verbose' })).toThrow(EnvError);
    });

    it('throws EnvError for an invalid VITE_APP_ENV enum value', () => {
      expect(() => parseEnv({ VITE_APP_ENV: 'test' })).toThrow(EnvError);
    });

    it('includes every offending key in the EnvError message', () => {
      expect.assertions(3);
      try {
        parseEnv({ VITE_APP_ENV: 'bogus', VITE_LOG_LEVEL: 'bogus' });
      } catch (error) {
        expect(error).toBeInstanceOf(EnvError);
        const message = (error as EnvError).message;
        expect(message).toContain('VITE_APP_ENV');
        expect(message).toContain('VITE_LOG_LEVEL');
      }
    });
  });
});
