/**
 * Provider error taxonomy. Every failure a `JourneyProvider` raises carries a
 * machine-readable `code` alongside a human-readable message so the UI can react
 * (retry, correct input, show a fallback) without string-matching.
 */

export type ProviderErrorCode =
  | 'UNKNOWN_AIRPORT'
  | 'NO_ROUTES'
  | 'INVALID_CRITERIA'
  | 'PROVIDER_FAILURE';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    // Preserve prototype chain when targeting ES5-style transpilation.
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}
