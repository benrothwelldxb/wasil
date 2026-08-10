import '@testing-library/jest-dom/vitest'

// jsdom does not implement matchMedia; provide a reduced-motion-friendly stub.
// (Skipped under the node test environment, where there is no `window`.)
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}
