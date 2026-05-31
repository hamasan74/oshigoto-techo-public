export interface BrowserStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): BrowserStorageAdapter | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function readStorageValue(key: string) {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageValue(key: string, value: string) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // Ignore quota and privacy mode failures in PoC mode.
  }
}

export function removeStorageValue(key: string) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore quota and privacy mode failures in PoC mode.
  }
}

export function readJsonStorage<T>(key: string, revive: (value: unknown) => T | null) {
  const raw = readStorageValue(key);
  if (!raw) {
    return null;
  }

  try {
    return revive(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeJsonStorage(key: string, value: unknown) {
  writeStorageValue(key, JSON.stringify(value));
}
