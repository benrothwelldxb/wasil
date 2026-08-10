/**
 * Active data context.
 *
 * Decides which storage driver is currently active (real vs demo) and exposes
 * it to repositories. The mode is persisted in app-level meta so a page reload
 * keeps you in the same context. Switching mode is a single call; repositories
 * always read the *current* driver, so they follow the switch automatically.
 */
import {
  LocalStorageDriver,
  MemoryStorageDriver,
  isLocalStorageAvailable,
  type StorageDriver,
} from './driver';
import { DEMO_PREFIX, META_PREFIX, REAL_PREFIX, SCHEMA_VERSION, StorageKeys } from './namespace';

export type DataMode = 'real' | 'demo';

const MODE_KEY = `${META_PREFIX}mode`;

function makeDriver(prefix: string): StorageDriver {
  return isLocalStorageAvailable() ? new LocalStorageDriver(prefix) : new MemoryStorageDriver();
}

// Drivers are created once and reused.
const realDriver = makeDriver(REAL_PREFIX);
const demoDriver = makeDriver(DEMO_PREFIX);

function readMode(): DataMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

let currentMode: DataMode = typeof window !== 'undefined' ? readMode() : 'real';

export function getDataMode(): DataMode {
  return currentMode;
}

export function setDataMode(mode: DataMode): void {
  currentMode = mode;
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* no-op */
  }
}

/** The driver for the currently active mode. Repositories call this per access. */
export function activeDriver(): StorageDriver {
  const driver = currentMode === 'demo' ? demoDriver : realDriver;
  // Stamp the schema version on first use so migrations have an anchor.
  if (driver.get<number>(StorageKeys.schemaVersion) === null) {
    driver.set(StorageKeys.schemaVersion, SCHEMA_VERSION);
  }
  return driver;
}

export function driverForMode(mode: DataMode): StorageDriver {
  return mode === 'demo' ? demoDriver : realDriver;
}

/** Wipe every key held by a mode's driver (used by demo reset & delete-all). */
export function clearMode(mode: DataMode): void {
  const driver = driverForMode(mode);
  for (const key of driver.keys()) driver.remove(key);
}
