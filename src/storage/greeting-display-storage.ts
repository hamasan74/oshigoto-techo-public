import { readJsonStorage, writeJsonStorage } from './browser-storage';
import { storageKeys } from './storage-keys';

export type GreetingDisplayPeriod = 'morning' | 'night';

interface GreetingSeenFlags {
  morning?: boolean;
  night?: boolean;
}

type GreetingSeenSnapshot = Record<string, Record<string, GreetingSeenFlags>>;

function readGreetingSeenSnapshot() {
  return (
    readJsonStorage(storageKeys.greetingSeenSnapshot, (value) => {
      if (!value || typeof value !== 'object') {
        return null;
      }

      return value as GreetingSeenSnapshot;
    }) ?? {}
  );
}

export function hasGreetingBeenSeen(userId: string, date: string, period: GreetingDisplayPeriod) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || !date) {
    return false;
  }

  const snapshot = readGreetingSeenSnapshot();
  return snapshot[normalizedUserId]?.[date]?.[period] === true;
}

export function markGreetingAsSeen(userId: string, date: string, period: GreetingDisplayPeriod) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || !date) {
    return;
  }

  const snapshot = readGreetingSeenSnapshot();
  const nextSnapshot: GreetingSeenSnapshot = {
    ...snapshot,
    [normalizedUserId]: {
      ...(snapshot[normalizedUserId] ?? {}),
      [date]: {
        ...(snapshot[normalizedUserId]?.[date] ?? {}),
        [period]: true,
      },
    },
  };

  writeJsonStorage(storageKeys.greetingSeenSnapshot, nextSnapshot);
}
