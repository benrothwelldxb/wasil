let counter = 0;

/**
 * Generate a reasonably-unique local id. Good enough for a single-device,
 * local-only app; a backend would assign server ids later.
 */
export function makeId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `${prefix}_${time}${counter.toString(36)}${rand}`;
}
