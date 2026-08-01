import type { ResolvedTheme, ThemeMode } from "@/types";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** Read the operating system's current color-scheme preference. */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

/** Resolve a `ThemeMode` (which may be "system") to a concrete theme. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}

/** Apply the resolved theme to the document root element. */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }
  return resolved;
}

/**
 * Subscribe to OS color-scheme changes. The callback fires whenever the
 * system preference flips. Returns an unsubscribe function.
 */
export function subscribeToSystemTheme(
  callback: (theme: ResolvedTheme) => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  const listener = (event: MediaQueryListEvent) => {
    callback(event.matches ? "dark" : "light");
  };
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
