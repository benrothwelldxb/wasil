/**
 * Simulates async I/O so the UI is written against Promises from day one.
 * When a real backend is introduced, service functions swap their bodies for
 * `fetch`/client calls and the hooks/components stay unchanged.
 */
export function resolveMock<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}
