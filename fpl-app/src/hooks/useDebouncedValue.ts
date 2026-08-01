import { useEffect, useState } from "react";

/**
 * Return a debounced copy of `value` that only updates after `delay` ms have
 * passed without a change. Useful for search inputs to avoid recomputing
 * expensive derived state on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
