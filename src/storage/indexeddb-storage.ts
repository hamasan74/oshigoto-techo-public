import { indexedDbKeys } from './storage-keys';

function getIndexedDbFactory() {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return null;
  }

  return window.indexedDB;
}

async function openAppDatabase() {
  const indexedDbFactory = getIndexedDbFactory();
  if (!indexedDbFactory) {
    return null;
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDbFactory.open(indexedDbKeys.databaseName, indexedDbKeys.version);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(indexedDbKeys.stores.snapshots)) {
          database.createObjectStore(indexedDbKeys.stores.snapshots);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readDatabaseValue<T>(
  storeName: string,
  key: IDBValidKey,
  revive: (value: unknown) => T | null,
) {
  const database = await openAppDatabase();
  if (!database) {
    return null;
  }

  return new Promise<T | null>((resolve) => {
    let resolved = false;
    let result: T | null = null;

    const finalize = (value: T | null) => {
      if (resolved) {
        return;
      }

      resolved = true;
      database.close();
      resolve(value);
    };

    try {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);

      request.onsuccess = () => {
        result = revive(request.result);
      };

      request.onerror = () => {
        result = null;
      };

      transaction.oncomplete = () => finalize(result);
      transaction.onerror = () => finalize(null);
      transaction.onabort = () => finalize(null);
    } catch {
      finalize(null);
    }
  });
}

export async function writeDatabaseValue(storeName: string, key: IDBValidKey, value: unknown) {
  const database = await openAppDatabase();
  if (!database) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const finalize = (success: boolean) => {
      if (resolved) {
        return;
      }

      resolved = true;
      database.close();
      resolve(success);
    };

    try {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value, key);

      transaction.oncomplete = () => finalize(true);
      transaction.onerror = () => finalize(false);
      transaction.onabort = () => finalize(false);
    } catch {
      finalize(false);
    }
  });
}
